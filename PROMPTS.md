# LedgerLine: AI Session & Architecture Log (PROMPTS.md)

This log tracks genuine engineering suggestions, identified design trade-offs, discovered errors, and corresponding architectural corrections throughout the implementation of LedgerLine.

---

## Session 1: 2026-11-05 — Foundation, Driver Selection & Concurrency Design

### 1. ORM Elimination in Favor of Raw SQL
- **Initial Suggestion**: Using an ORM (Prisma or Sequelize) to model entities and execute database migrations.
- **Flaw Discovered**: Financial accounting engines require strict, fine-grained control over PostgreSQL transaction isolation, explicit row-level locking (`SELECT ... FOR UPDATE`), deterministic multi-row locking to prevent deadlocks, and exact SQL execution without ORM query generation overhead or hidden sub-queries. Furthermore, ORMs often struggle with native 64-bit BigInt serialization and advisory locks during migrations.
- **Correction**: Replaced ORMs with native `pg` (node-postgres), writing clean, parameterized SQL migration scripts (`001_create_users.sql` to `006_create_audit_events.sql`) and dedicated repository classes (`accountRepository`, `transactionRepository`, `ledgerRepository`).
- **Verification**: `npm run migrate` executes transactional DDL with PostgreSQL advisory locks.

### 2. Multi-Account Deadlock Elimination
- **Initial Suggestion**: In internal transfers, lock the source account row first, then lock the destination account row.
- **Flaw Discovered**: If User A transfers to User B while User B simultaneously transfers to User A, Thread 1 holds Lock(A) and waits for Lock(B), while Thread 2 holds Lock(B) and waits for Lock(A). This triggers a circular wait condition and PostgreSQL deadlock (`40P01`).
- **Correction**: Implemented `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`. Account UUIDs are sorted lexicographically before row acquisition (`ORDER BY id ASC FOR UPDATE`). Regardless of transfer direction, locks are acquired in the exact same global order across all threads.
- **Verification**: Tested with truly parallel requests in `tests/integration/concurrency.test.js` (`Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks`).

### 3. BigInt JSON Serialization in Node.js
- **Initial Suggestion**: Return integer paise as native JavaScript `BigInt` directly from database queries.
- **Flaw Discovered**: Express's underlying `res.json()` relies on `JSON.stringify()`, which throws a `TypeError: Do not know how to serialize a BigInt` when encountering modern 64-bit integers.
- **Correction**: Defined global `BigInt.prototype.toJSON = function() { return this.toString(); };` in database initialization, and configured `pg.types.setTypeParser(20, (val) => val === null ? null : BigInt(val))`. In API responses, amounts are returned with both `amountPaise` (string representation of minor units) and `amountFormatted` (human-readable Rupee string).
- **Verification**: Unit tests in `tests/unit/money.test.js` and all integration API tests.

### 4. Idempotency Key Atomic Lifecycle
- **Initial Suggestion**: Store idempotency keys in Redis or a memory cache.
- **Flaw Discovered**: Distributed caches can lose keys during network partitions or crashes, causing financial operations to execute twice. Storing the key outside the primary database transaction risks committing the money movement while failing to store the idempotency key.
- **Correction**: Stored idempotency keys in PostgreSQL (`idempotency_keys` table) with `UNIQUE (user_id, idempotency_key)`. The key reservation and the final response caching are committed atomically with the transaction and ledger entries. If the operation fails, the transaction rolls back cleanly.
- **Verification**: `tests/integration/idempotency.test.js` verified both identical retries and payload tampering conflict (409).



## Session 2: 2026-11-05 — Pre-Frontend Compliance Audit & Integration Architecture

### 1. Statement Refusal Tracking vs. Ledger Separation
- **Initial Suggestion**: Log failed transactions (insufficient funds, authorization rejections) into `ledger_entries` with a status flag.
- **Flaw Discovered**: Double-entry accounting principles dictate that the financial ledger must strictly reflect executed, committed balance movements. Polluting the immutable ledger with rejected attempts breaks accounting balance calculations and historical reconciliation (`SUM(credit) - SUM(debit) == balance`).
- **Correction**: Recorded refused operations in the `audit_events` table (`TRANSACTION_WITHDRAW_REFUSED`, `TRANSACTION_TRANSFER_REFUSED`) with exact refusal reasons and attempted amounts. In the dedicated `/api/v1/statements/:accountId` endpoint, committed postings are retrieved from `ledger_entries`, while refused attempts are pulled dynamically from `audit_events`.
- **Verification**: Verified in `tests/integration/transactions.test.js`, `authorization.test.js`, and `src/modules/statements/statement.service.js`.

### 2. Append-Only Protection at Database Level vs. Application Level
- **Initial Suggestion**: Rely solely on repository-level methods (omitting `UPDATE` / `DELETE` queries) to guarantee append-only ledger entries.
- **Flaw Discovered**: Application-level restrictions protect against normal API flows, but do not prevent direct accidental SQL updates or rogue scripts executed directly against the database.
- **Correction**: Documented the recommendation to install a database trigger or role-based SQL privilege revocation (`REVOKE UPDATE, DELETE ON ledger_entries FROM ...`) to enforce immutability at the PostgreSQL engine level.
- **Verification**: Reflected in `CHALLENGE_CHECKLIST.md` under Section 2.

---

## Session 3: 2026-11-06 — Database-Level Append-Only Ledger Hardening & Role Separation

### 1. Dual-Layer Defense-in-Depth vs. Single Layer
- **Initial Consideration**: Enforcing immutability either via SQL trigger alone OR via PostgreSQL role permissions alone.
- **Flaw Discovered**: A trigger alone allows the runtime connection to hold `UPDATE` and `DELETE` table privileges; if a bug or malicious actor alters the trigger, the rows become vulnerable. Conversely, role privileges alone leave the table unprotected if queries run through administrative or migration credentials.
- **Correction**: Implemented dual-layer defense-in-depth:
  1. **PostgreSQL Trigger (`trg_prevent_ledger_modification`)**: Intercepts any `UPDATE` or `DELETE` attempt `BEFORE` execution and raises SQLSTATE `23000 (integrity_constraint_violation)`.
  2. **Restricted Runtime Role (`ledgerline_runtime`)**: Table permissions explicitly grant `SELECT` and `INSERT` while revoking `UPDATE`, `DELETE`, and `TRUNCATE` (`42501 insufficient_privilege`).
- **Verification**: Verified in `tests/integration/ledger_immutability.test.js` where both layers are asserted independently.

### 2. Test Harness Truncation Isolation
- **Flaw Discovered**: Running integration tests under the restricted runtime role broke test isolation because `cleanDatabase()` calls `TRUNCATE TABLE ... ledger_entries CASCADE`, which requires table ownership or TRUNCATE privileges that the restricted runtime role must not possess.
- **Correction**: Separated test harness administrative cleanup from runtime application execution. `cleanDatabase()` utilizes `adminPool` via `TEST_DIRECT_URL` (database owner), whereas all application endpoints, repositories, and integration assertions execute through `testPool` via `TEST_DATABASE_URL` (the restricted runtime role `ledgerline_runtime`).
- **Verification**: Verified with `npm test` passing 39/39 tests across unit and 6 integration test suites.

### 3. BigInt Comparison on PostgreSQL SUM() Result
- **Actual Mistake Encountered**: In `tests/integration/ledger_immutability.test.js`, the test asserted `expect(aliceCalculated).toBe(aliceDbAcc.rows[0].balance)` expecting `9000n`. The test failed with `Expected: 9000n, Received: "9000"`.
- **Root Cause**: PostgreSQL's `SUM()` aggregate returns a `NUMERIC` type when summing integers, which `node-postgres` parses as a string to prevent precision loss. `accounts.balance` is a `BIGINT` column parsed into JavaScript native `BigInt` (OID 20 parser). Comparing string to BigInt via strict equality failed.
- **Correction**: Wrapped the returned value with `BigInt(aliceCalculated)` and `BigInt(bobCalculated)` to compare numeric values safely without precision loss.
- **Fixing Commit URL**: https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b

---

## Session 4: 2026-11-06 — Fix Backend Startup Logs, API Routing, and 404 Errors

### 1. API Base URL Duplication (`/api/v1/api/v1/auth/register`)
- **Initial Flaw Discovered**: Requests sent from Swagger UI or configured frontend clients were producing `404 Endpoint not found: [POST] /api/v1/api/v1/auth/register`.
- **Root Cause**: In `swagger.js`, OpenAPI `servers` had `url: '/api/v1'`, while route path keys were also declared starting with `/api/v1` (e.g., `'/api/v1/auth/register'`). When Swagger UI dispatched requests, it joined the server root and route path, yielding `/api/v1/api/v1/...`. Similarly, frontend integration documentation ambiguously stated `baseURL: http://localhost:5000/api/v1` while also listing `/api/v1/...` in service method snippets.
- **Correction**: Established a strict, unified convention:
  1. Base URL: `http://localhost:5000/api/v1` (for Axios and Swagger v1 server definition).
  2. Service / Swagger paths: Strictly relative to base URL (e.g. `/auth/register`, `/accounts`, `/transactions`).
  3. Express mounting: Versioned router mounted under `/api/v1` exactly once in `src/app.js`.
- **Verification**: Verified via test suite and automated route verification script asserting `POST /api/v1/auth/register` returns 201 while `POST /api/v1/api/v1/auth/register` returns 404.

### 2. Health-Check Endpoint Inconsistency (`/api/v1/health` vs `/health`)
- **Initial Flaw Discovered**: Frontend health polling or Swagger testing attempted `GET /api/v1/health` resulting in 404, while startup logs announced `GET http://localhost:5000/health`.
- **Root Cause**: `GET /health` is an unversioned infrastructure health check mounted directly at root (`app.get('/health')`) outside `/api/v1`. Swagger documentation mapped `/health` under the default `/api/v1` server scope.
- **Correction**: Configured explicit path-level server override in OpenAPI spec: `/health` sets `servers: [{ url: '/', description: 'Root URL' }]`, ensuring Swagger UI calls `http://localhost:5000/health`. Updated frontend integration guides to specify root health checking.
- **Verification**: Tested `GET /health` returns 200 with `{ status: 'UP', database: { connected: true } }`, and confirmed `GET /api/v1/health` returns 404 without duplicating routes.

### 3. Missing OpenAPI Route Definitions
- **Initial Flaw Discovered**: Several existing endpoints (`/statements/:accountId`, `/admin/users`, `/admin/accounts`, `/admin/users/:userId/status`, `/admin/accounts/:accountId/status`) were completely missing from `swagger.js`, making them undocumented and untestable in Swagger UI.
- **Correction**: Added complete OpenAPI documentation with schemas, path parameters, and query parameters for all registered Express endpoints.
- **Verification**: Complete 25-endpoint route verification table passed with 100% success rate.

### 4. PostgreSQL SSL Mode Deprecation Warning
- **Initial Flaw Discovered**: On connecting to Neon PostgreSQL, the driver logged `WARNING: sslmode=require is treated as verify-full`.
- **Root Cause**: `pg-connection-string` deprecated `sslmode=require` as an ambiguous alias in favor of explicit `verify-full`.
- **Correction**: Updated `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, and `TEST_DIRECT_URL` in `.env` and `.env.example` to explicitly use `sslmode=verify-full&channel_binding=require`. Added regex normalization in `src/config/env.js` `sanitizeUrl()` so any `sslmode=require` is automatically upgraded to `sslmode=verify-full` while maintaining strict `rejectUnauthorized: true` certificate validation.
- **Verification**: Database connection test runs with zero deprecation warnings.

---

## Session 5: 2026-11-06 — Implement Account Number-Based Transfers (Source & Destination)

### 1. Dual Identification Support & Backward Compatibility
- **Initial Suggestion**: Replace `sourceAccountId` and `destinationAccountId` with `sourceAccountNumber` and `destinationAccountNumber` exclusively in validation schemas.
- **Flaw Discovered**: Completely breaking backward compatibility would fail existing automated tests, external integrations, and legacy clients sending internal UUIDs.
- **Correction**: Configured Zod `.superRefine` validation in `transaction.validation.js` allowing either pair:
  1. Primary: `sourceAccountNumber` and `destinationAccountNumber`
  2. Legacy: `sourceAccountId` and `destinationAccountId`
  If neither or partial parameters are provided, a descriptive validation error is returned.
- **Verification**: Tested in `account_number_transfer.test.js` asserting successful execution for both account-number and UUID-based requests.

### 2. Idempotency Request Hash Normalization
- **Initial Suggestion**: Hash whatever payload keys were provided by the caller directly.
- **Flaw Discovered**: If a caller retries a transfer using the account number instead of the UUID, a raw payload hash would differ, bypassing the idempotency check and potentially executing the transfer twice.
- **Correction**: In `transactionService.transfer()`, both account numbers are resolved to their persistent logical IDs, and the SHA-256 idempotency request hash is computed deterministically across resolved accounts: `{ op: 'TRANSFER', sourceAccountId, destinationAccountId, amountPaise: amountPaise.toString() }`.
- **Verification**: Verified with `account_number_transfer.test.js` (`Duplicate transfer request with same Idempotency-Key returns cached response without duplicate execution`).

### 3. Zod Error Formatting in Integration Assertions
- **Actual Mistake Encountered**: In `tests/integration/account_number_transfer.test.js` Scenario 7 (same account transfer), the assertion `expect(res.body.message).toMatch(/Source and destination accounts must be different/i)` failed because `validateRequest` middleware formats top-level `message: "Validation failed"` and puts the custom rule message in `res.body.errors[0].message`.
- **Correction**: Updated the test assertion to inspect the response errors structure `expect(JSON.stringify(res.body)).toMatch(/Source and destination accounts must be different/i)`.
- **Verification**: All 20 integration tests passed in `account_number_transfer.test.js`.

---

## Human Correction: Account Number-Based Transfers

**Context:** During the implementation of the transfer functionality, the AI initially suggested using internal database account IDs (`sourceAccountId` and `destinationAccountId`) in the transfer request.

**My review and correction:**

I reviewed the suggested API design and identified that requiring users to enter internal database IDs is not user-friendly. Users should identify their accounts using account numbers instead.

I therefore corrected the proposed implementation to use:

- `sourceAccountNumber`
- `destinationAccountNumber`

**Expected implementation:**

1. The frontend must use account numbers for source and destination account selection.
2. The transfer API must accept account numbers instead of exposing internal UUIDs.
3. The backend must resolve both account numbers to their corresponding internal account UUIDs.
4. All existing database relationships, transaction processing, row-level locking, and ledger entries must continue using internal UUIDs.
5. Source account ownership must be verified against the authenticated user.
6. Existing authorization, idempotency, concurrency, double-entry accounting, and append-only ledger protections must remain unchanged.

**Reason for the correction:**

This improves usability without compromising the existing database design or financial transaction security.

**Human contribution:** I reviewed the AI-generated recommendation, identified the API usability limitation, decided on the account-number-based interface, and instructed the AI to modify the implementation while preserving internal UUID-based processing.

**Implementation status:** Completed and verified. The transfer API accepts `sourceAccountNumber` and `destinationAccountNumber` (with backward compatibility for legacy UUIDs), resolves them to internal account UUIDs, validates ownership against authenticated users, preserves deterministic row locking (`findTwoForUpdate`), enforces append-only double-entry ledger postings, and passed all 20 automated integration scenarios in `backend/tests/integration/account_number_transfer.test.js`.

---

## Session 6: 2026-11-07 — Registration Security & Privilege Escalation Prevention

### 1. Public Registration Schema Vulnerability & Role Injection
- **Context & User Request**:
  Audit and secure the public registration flow to prevent privilege escalation. A normal user must not be able to register as `ADMIN` or `AUDITOR` by modifying the HTTP request payload. Public registration must always create an `ACCOUNT_HOLDER`.
- **Flaws Discovered During Security Audit**:
  1. **Schema Vulnerability**: In `backend/src/modules/auth/auth.validation.js`, `registerSchema` explicitly included `role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).default('ACCOUNT_HOLDER').optional()` and omitted `.strict()`. This permitted clients to send `{"role": "ADMIN"}` or `{"role": "AUDITOR"}`, which passed validation successfully.
  2. **Service Parameter Passthrough**: In `backend/src/modules/auth/auth.service.js`, `register({ fullName, email, password, role = 'ACCOUNT_HOLDER' }, context)` unpacked the client-supplied `role` and passed it directly to `userRepository.create()`.
  3. **Controller Passthrough**: In `backend/src/modules/auth/auth.controller.js`, `authController.register` passed `req.body` without field filtering.
  4. **PostgreSQL Insertion**: In `backend/src/repositories/user.repository.js`, the parameterized query `INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, true)` inserted `$4` directly. Because the PostgreSQL `CHECK (role IN ('ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'))` constraint accepts `ADMIN` and `AUDITOR`, the injected role was committed to the database.
  5. **JWT & Identity Escalation**: The issued JWT and `req.user` in `authenticate` middleware loaded `user.role` from the database row, giving the attacker full administrative access across `authorize('ADMIN')` endpoints.
- **Architectural Corrections (Defense-in-Depth)**:
  1. **Strict Zod Validation (Layer 1)**: Removed `role` entirely from `registerSchema` in `auth.validation.js` and appended `.strict()`. Any client payload containing unexpected or privileged fields (`role`, `isAdmin`, `permissions`, `isVerified`, etc.) fails validation immediately with `400 Bad Request` (`Validation failed`).
  2. **Controller Whitelisting (Layer 2)**: Modified `auth.controller.js` to explicitly destructure only `{ fullName, email, password }` from `req.body` and pass only those fields to the service layer.
  3. **Authoritative Server-Side Role Enforcement (Layer 3)**: Updated `auth.service.js` to unconditionally bind `const role = 'ACCOUNT_HOLDER'`. The service ignores any client-supplied role parameter, eliminating any mechanism for public registration to assign `ADMIN` or `AUDITOR` roles.
  4. **API Documentation Alignment**: Removed the `role` property from the `UserRegister` schema in `swagger.js`.
  5. **Comprehensive Automated Test Suite**: Expanded `tests/integration/auth.test.js` from 7 tests to 18 tests covering:
     - Test A: Normal registration assigns `ACCOUNT_HOLDER`, hashes password with bcrypt, and profile verification via `GET /api/v1/auth/me` returns `ACCOUNT_HOLDER`.
     - Test B: `ADMIN` role injection rejected with 400 and no user created in the database.
     - Test C: `AUDITOR` role injection rejected with 400 and no user created in the database.
     - Test D: Alternative/lowercase role strings (`admin`, `auditor`, `ACCOUNT_HOLDER`, `SUPER_ADMIN`, `ROOT`) rejected with 400.
     - Test E: Privilege fields (`isAdmin`, `permissions`, `isVerified`) rejected with 400.
     - Service Defense-in-Depth: Direct invocation of `authService.register` with `role: 'ADMIN'` strictly forces `ACCOUNT_HOLDER` in the database.
     - JWT Tampering Protection: Client-forged JWT with tampered role claim rejected with 401.
     - Privileged Route Access: Verified that regular users and auditors cannot access admin endpoints (`403 Forbidden`).
- **Verification**: Executed automated test suite against Neon PostgreSQL test database (`TEST_DATABASE_URL`). All 18 auth tests and 30 API verification tests passed with 100% success rate.





