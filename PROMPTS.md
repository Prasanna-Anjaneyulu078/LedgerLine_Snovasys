# LedgerLine – AI Engineering Log (PROMPTS.md)

This document records how AI tools were used during LedgerLine development, including the original prompts, AI suggestions, human review, implementation decisions, and verification.

---

## Session 1: Project Foundation and Architecture

**Date:** 2026-11-05

### 1. Objective
Establish the architectural foundations of the LedgerLine backend: select the database access pattern (evaluating ORM vs raw SQL), design concurrency control and row locking to prevent deadlocks in two-account transfers, handle 64-bit integer paise serialization safely in Node.js, and design atomic idempotency key storage.

### 2. Original AI Prompt
`[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
*Instruction context:* Initialize the LedgerLine project with Express.js and PostgreSQL. Provide database models, connection management, transfer transaction locking, money handling, and idempotency key persistence.

### 3. AI Suggestion
- Suggested using an ORM (Prisma or Sequelize) for database schemas and migrations.
- In transfer transactions, suggested locking the source account row first, checking balance, and then locking the destination account row.
- Suggested returning native JavaScript `BigInt` directly from database queries into Express `res.json()`.
- Suggested storing idempotency keys in Redis or an in-memory cache with TTL.

### 4. Human Review and Correction
- **ORM Elimination:** Financial accounting engines require strict, fine-grained control over PostgreSQL transaction isolation, explicit row-level locking (`SELECT ... FOR UPDATE`), deterministic multi-row locking to prevent deadlocks, and exact SQL execution plans without ORM query generation overhead or hidden sub-queries. Furthermore, ORMs historically introduce impedance mismatches with native 64-bit integer (`BIGINT`) minor currency units and advisory locks during migrations. Replaced ORMs with native `pg` (`node-postgres`) using raw, parameterized SQL.
- **Multi-Account Deadlock Elimination:** Locking Account A then Account B causes circular wait deadlocks (`40P01`) when Account A and Account B simultaneously transfer to each other. Mandated deterministic global lock ordering by sorting account UUIDs lexicographically (`[id1, id2].sort()`) before row acquisition (`ORDER BY id ASC FOR UPDATE`).
- **BigInt JSON Serialization:** Express `res.json()` relies on `JSON.stringify()`, which throws `TypeError: Do not know how to serialize a BigInt`. Patched `BigInt.prototype.toJSON = function() { return this.toString(); }` and configured `pg.types.setTypeParser(20, ...)` to parse `BIGINT` columns into JavaScript `BigInt`.
- **Idempotency Key Atomic Lifecycle:** Caches can drop keys during partitions, and placing the key outside the primary database transaction creates a split-brain vulnerability where money moves but the idempotency key fails to save. Enforced database-backed idempotency inside the primary PostgreSQL transaction with `UNIQUE (user_id, idempotency_key)`.

### 5. Final Implementation
- `backend/src/config/database.js`: Configured `node-postgres` connection pool, BigInt type parsers, and JSON serialization.
- `backend/src/database/migrate.js`: Custom transactional migration runner acquiring PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`).
- `backend/src/database/migrations/001_create_users.sql` to `006_create_audit_events.sql`: Raw SQL DDL with primary/foreign keys and check constraints.
- `backend/src/repositories/account.repository.js`: Implemented `findTwoForUpdate(accountId1, accountId2, client)` sorting account UUIDs.
- `backend/src/repositories/idempotency.repository.js`: Database-backed idempotency lifecycle.

### 6. Verification
- Automated migration execution: `npm run migrate` executes transactional DDL with advisory locks. Verified in `tests/helpers/testDb.js`.
- Unit tests: `tests/unit/money.test.js` (8 tests passing for paise conversion and rupee formatting).
- Concurrency tests: `tests/integration/concurrency.test.js` (deterministic locking eliminates deadlocks under simultaneous bidirectional transfers).
- Idempotency tests: `tests/integration/idempotency.test.js` (atomic key persistence and retry handling).

### 7. Related Commit
- `3e747ccba96e16f14b2f218aa7145392787b1b54` – `chore: initialize LedgerLine project` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3e747ccba96e16f14b2f218aa7145392787b1b54))
- `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

## Session 2: Backend Integration and API Design

**Date:** 2026-11-05

### 1. Objective
Audit pre-frontend integration architecture, establish statement reporting for refused/failed transactions while preserving double-entry ledger invariants, and formulate the immutability enforcement strategy.

### 2. Original AI Prompt
`[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
*Instruction context:* Review the integration architecture and define how account statements should display transaction rejections, and how ledger immutability should be guaranteed.

### 3. AI Suggestion
- Suggested logging failed and refused transaction attempts (e.g., insufficient funds, authorization failures) directly into the `ledger_entries` table with a status flag (`status = 'REFUSED'`).
- Suggested relying exclusively on application repository encapsulation (omitting `UPDATE`/`DELETE` methods) to guarantee append-only ledger immutability.

### 4. Human Review and Correction
- **Statement Refusal Tracking vs. Ledger Separation:** Double-entry accounting principles dictate that the financial ledger must strictly reflect executed, committed balance movements. Polluting the immutable ledger with rejected attempts breaks accounting balance calculations and historical reconciliation (`SUM(credit) - SUM(debit) == balance`). Directed that rejected attempts be written to the `audit_events` table (`TRANSACTION_WITHDRAW_REFUSED`, `TRANSACTION_TRANSFER_REFUSED`). In `/api/v1/statements/:accountId`, committed postings are retrieved from `ledger_entries`, while refused attempts are pulled dynamically from `audit_events`.
- **Append-Only Protection:** Application-level encapsulation is insufficient for financial compliance; it provides no defense against direct SQL execution, accidental scripts, or compromised administrative credentials. Mandated a two-layer database defense: a PostgreSQL trigger preventing modification, and SQL privilege revocation (`REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries`) on the runtime role.

### 5. Final Implementation
- `CHALLENGE_CHECKLIST.md`: Formalized compliance requirements for database-level immutability and statement separation.
- `FRONTEND_INTEGRATION_PLAN.md`: Documented API contracts for statements, accounts, and audit events.
- `backend/src/database/migrations/006_create_audit_events.sql`: Audit event schema tracking refused actions, actor IDs, and IP addresses.
- `backend/src/modules/statements/statement.service.js`: Dedicated statement aggregation pulling committed records from `ledger_entries` and refused events from `audit_events`.

### 6. Verification
- Verified in `tests/integration/transactions.test.js` and `tests/integration/authorization.test.js` that failed attempts generate `audit_events` records without creating orphaned `ledger_entries`.

### 7. Related Commit
- `036328e13415335c05bf5bc48f314e3200158159` – `docs: add challenge compliance checklist, frontend integration plan, and AI prompt logs` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/036328e13415335c05bf5bc48f314e3200158159))

---

## Session 3: Database Security and Append-Only Ledger

**Date:** 2026-11-06

### 1. Objective
Implement database-level immutability for `ledger_entries`, configure a restricted runtime PostgreSQL role with least-privilege permissions, isolate test harness truncation cleanup, and fix precision bugs in double-entry verification.

### 2. Original AI Prompt
`[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
*Instruction context:* Implement PostgreSQL database trigger and role permissions to prevent modification or deletion of ledger records, and configure integration tests under the restricted role.

### 3. AI Suggestion
- Suggested relying either on a PostgreSQL trigger OR on role-level SQL privilege revocation alone.
- Suggested running test cleanup (`cleanDatabase()`) under the same application database role.

### 4. Human Review and Correction
- **Dual-Layer Defense-in-Depth:** A trigger alone allows runtime connections to hold table modification privileges; if the trigger is disabled or bypassed, rows become vulnerable. Conversely, role privileges alone leave the table unprotected when queries run under table-owner or admin connections. Implemented both simultaneously: trigger `trg_prevent_ledger_modification` (SQLSTATE `23000`) and restricted role `ledgerline_runtime` with `REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries` (SQLSTATE `42501`).
- **Test Harness Truncation Isolation:** Executing tests under `ledgerline_runtime` caused `cleanDatabase()` to crash on `TRUNCATE TABLE ... ledger_entries CASCADE` because the restricted role has no `TRUNCATE` privilege. Architected dual connection pools: `adminPool` via `TEST_DIRECT_URL` (database owner) for cleanup/migrations, and `testPool` via `TEST_DATABASE_URL` (`ledgerline_runtime`) for all application code.
- **BigInt Comparison Bug:** In `tests/integration/ledger_immutability.test.js`, `expect(aliceCalculated).toBe(aliceDbAcc.rows[0].balance)` failed with `Expected: 9000n, Received: "9000"`. Discovered that PostgreSQL's `SUM()` aggregate returns a `NUMERIC` string in `node-postgres`, whereas `balance` is a native `BigInt`. Wrapped the returned string with `BigInt()` before comparison.

### 5. Final Implementation
- `backend/src/database/migrations/007_prevent_ledger_modification_trigger.sql`: Trigger function `prevent_ledger_modification()` raising SQLSTATE `23000` `BEFORE UPDATE OR DELETE ON ledger_entries`.
- `backend/src/database/setup-runtime-role.js`: Automated script provisioning `ledgerline_runtime` role with least-privilege permissions.
- `backend/tests/helpers/testDb.js`: Dual connection pool implementation (`adminPool` vs `testPool`).
- `backend/tests/integration/ledger_immutability.test.js`: Suite asserting independent failures for trigger violation, permission denial, and double-entry mathematical balance.

### 6. Verification
- `tests/integration/ledger_immutability.test.js`: 8/8 tests passing. Verified trigger raises `23000`, `UPDATE`/`DELETE` raises `42501`, and `SUM(credit) - SUM(debit) == balance`.
- Full suite: 39/39 tests passing across unit and 6 integration test suites.

### 7. Related Commit
- `a5502e115a06298a620e8e2ccf53fed012a5eb8b` – `security: enforce database-level ledger immutability` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a5502e115a06298a620e8e2ccf53fed012a5eb8b))
- `e56267c6fe8cb289b0ff6f0166551097f870950b` – `feat(security): protect ledger from modifications` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b))
- `ac7c8340bd2b61de446a61a8017ea85de8a7beb0` – `docs(prompts): update AI interaction log` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/ac7c8340bd2b61de446a61a8017ea85de8a7beb0))

---

## Session 4: Backend Debugging and API Routing

**Date:** 2026-11-06

### 1. Objective
Resolve API routing 404 errors, fix duplicate `/api/v1/api/v1` URL prefixes in Swagger UI, resolve root `/health` vs `/api/v1/health` inconsistencies, complete missing OpenAPI endpoint definitions, and eliminate PostgreSQL SSL mode deprecation warnings.

### 2. Original AI Prompt
`[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
*Instruction context:* Debug why Swagger UI and frontend callers receive 404 errors on `/auth/register` and `/health`, document missing admin routes in Swagger, and fix Neon SSL connection warnings.

### 3. AI Suggestion
- Suggested altering Express route definitions to mount routes without `/api/v1` prefixes.
- Suggested duplicating `/health` route definition inside the versioned router.

### 4. Human Review and Correction
- **Base URL Duplication:** Discovered that `swagger.js` configured `servers: [{ url: '/api/v1' }]`, while route path keys also declared `/api/v1/...` (e.g. `'/api/v1/auth/register'`). When Swagger UI dispatched requests, it joined the server root and route path, yielding `/api/v1/api/v1/...`. Enforced strict convention: Base URL is `http://localhost:5000/api/v1`, Swagger route keys are relative to base URL (e.g. `/auth/register`), and Express mounts the versioned router under `/api/v1` exactly once in `src/app.js`.
- **Health-Check Inconsistency:** Discovered `/health` is an unversioned infrastructure endpoint mounted at root (`app.get('/health')`). Overriding `/health` in Swagger using path-level server override `servers: [{ url: '/', description: 'Root URL' }]` fixed Swagger dispatching without duplicating route handlers.
- **Missing OpenAPI Routes:** Added complete OpenAPI 3.0 documentation for missing endpoints: `/statements/:accountId`, `/admin/users`, `/admin/accounts`, `/admin/users/:userId/status`, `/admin/accounts/:accountId/status`.
- **PostgreSQL SSL Warning:** Driver warned `WARNING: sslmode=require is treated as verify-full`. Updated connection strings to `sslmode=verify-full&channel_binding=require` and added regex normalization in `src/config/env.js` `sanitizeUrl()`.

### 5. Final Implementation
- `backend/src/config/swagger.js`: Corrected path keys, added server overrides for root health check, and documented all 25 registered endpoints.
- `backend/src/config/env.js`: URL sanitizer upgrading `sslmode=require` to `sslmode=verify-full`.
- `backend/.env` & `backend/.env.example`: Explicit `sslmode=verify-full&channel_binding=require`.
- `backend/src/server.js`: Formatted startup console table displaying available endpoints and test credentials.

### 6. Verification
- Automated route audit test in `tests/integration/api_verification_audit.test.js`: Verified all 25 Express endpoints return valid HTTP responses (200, 201, 400, 401, or 403) and 0 endpoints return 404.
- Verified `GET /health` returns 200 `{ status: 'UP', database: { connected: true } }` while `GET /api/v1/health` returns 404.

### 7. Related Commit
- `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` – `fix(backend): resolve API routing and startup issues` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))
- `3bcaf3f6f102cf85119de028040097c40daa08b8` – `feat: updated to display the default user credentials at runtime.` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3bcaf3f6f102cf85119de028040097c40daa08b8))

---

## Session 5: Account Number-Based Transactions

**Date:** 2026-11-06

### 1. Objective
Transition public money transfer API from internal database UUIDs to human-readable account numbers (`LL-ACC-1001`), preserve backward compatibility for UUIDs, normalize idempotency request hashing, and fix Zod validation assertion formatting in integration tests.

### 2. Original AI Prompt
`[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
*Instruction context:* Update transfer API endpoints to accept account numbers instead of UUIDs, maintain backward compatibility, and ensure idempotency hashing works consistently across both formats.

### 3. AI Suggestion
- Suggested replacing `sourceAccountId` and `destinationAccountId` with `sourceAccountNumber` and `destinationAccountNumber` exclusively in validation schemas, dropping UUID parameters.
- Suggested hashing raw request JSON payloads directly for idempotency verification.

### 4. Human Review and Correction
- **Human Architectural Correction:** Requiring end users to enter 36-character internal database UUIDs is poor banking UX and exposes internal primary keys. Mandated 6 architectural rules:
  1. Frontend must present and require account numbers.
  2. Transfer API must accept `sourceAccountNumber` and `destinationAccountNumber`.
  3. Backend must resolve account numbers to internal UUIDs before locking or updating.
  4. All database foreign keys, row locks (`SELECT FOR UPDATE`), and immutable ledger entries continue using UUIDs.
  5. Source account ownership must be verified against the authenticated user (`req.user.id`).
  6. Double-entry accounting, concurrency, idempotency, and immutability must remain unchanged.
- **Backward Compatibility:** Completely dropping UUIDs breaks legacy clients and automated tests. Configured Zod `.superRefine` accepting either pair (`sourceAccountNumber`/`destinationAccountNumber` OR `sourceAccountId`/`destinationAccountId`).
- **Idempotency Hash Normalization:** Directly hashing raw payload keys causes a cache bypass if a client retries using an account number instead of a UUID (or vice versa), risking double execution. In `transactionService.transfer()`, account numbers are resolved to UUIDs first, and the SHA-256 hash is computed deterministically across resolved UUIDs.
- **Test Assertion Correction:** In `account_number_transfer.test.js`, `expect(res.body.message).toMatch(...)` failed because `validateRequest` puts top-level `message: "Validation failed"` and nests the custom rule in `res.body.errors[0].message`. Updated assertion to check `JSON.stringify(res.body)`.

### 5. Final Implementation
- `backend/src/modules/transactions/transaction.validation.js`: `.superRefine` dual-pair schema validation.
- `backend/src/modules/transactions/transaction.service.js`: Resolves account numbers to UUIDs before locking, computes canonical hash across resolved IDs, and enforces source account ownership.
- `backend/src/repositories/account.repository.js`: Added `findByIdOrAccountNumber()` and `findByAccountNumber()`.
- `backend/src/config/swagger.js`: Updated transfer schema documentation to reflect primary account number fields and legacy UUID support.

### 6. Verification
- Automated integration suite `tests/integration/account_number_transfer.test.js`: All 20 scenarios passed (account-number transfers, UUID transfers, insufficient funds, same-account rejection, non-existent account, inactive account, ownership verification, and cached idempotency replays).

### 7. Related Commit
- `07403060c2b04426384c0e3608f1e32d23e0a770` – `feat: implement account number-based transfers with backward compatibility and swagger docs(use account numbers instead of UUIDs for source and destination accounts)` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))
- `1437e9d509179c58294cbf227d8ab8801abb068c` – `feat: add swagger api documentation configuration` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1437e9d509179c58294cbf227d8ab8801abb068c))
- `b5dc36bd0da945c3d9bf5be7467092c342316ca7` – `feat: add core financial ledger modules, validation, and API documentation` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/b5dc36bd0da945c3d9bf5be7467092c342316ca7))
- `27710507e2c490adc07ee59bca81ad0d7ddcb203` – `feat: implement account service and integration test suites with jest` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/27710507e2c490adc07ee59bca81ad0d7ddcb203))

---

## Session 6: Registration Security and Role Authorization

**Date:** 2026-11-07

### 1. Objective
Audit and secure the public registration flow to prevent privilege escalation. Ensure that a normal user cannot register as `ADMIN` or `AUDITOR` by injecting fields into the HTTP request payload, enforce server-side role assignment, and add automated security tests.

### 2. Original AI Prompt
```text
LedgerLine — Registration Security & Role Escalation Prevention
Act as a senior backend security engineer specializing in authentication, authorization and secure financial applications.
1. Project context
Project: LedgerLine — Secure Financial Transaction and Immutable Ledger System.
Existing technology stack:
Node.js, Express.js, JavaScript ES Modules, Express.js REST APIs, Neon PostgreSQL, PostgreSQL pg library with raw SQL (no ORM), JWT authentication, bcrypt password hashing, Zod request validation, Jest and Supertest.
Existing user roles: ADMIN, ACCOUNT_HOLDER, AUDITOR.
Important architectural rules:
Public registration must always create an ACCOUNT_HOLDER.
ADMIN and AUDITOR accounts must never be created through public registration.
Role assignment must be controlled exclusively by the backend.
Do not trust client-supplied role values.
Preserve existing authentication and authorization architecture.
2. Main objective: Audit and secure the public registration flow to prevent privilege escalation. A normal user must not be able to register as ADMIN or AUDITOR by modifying the HTTP request payload.
3. Inspect the existing implementation first: Registration route, controller, service, user model/database insertion SQL, Zod validation schema, password hashing, JWT generation, authentication middleware, existing tests. Identify exactly where the role is assigned and whether any client-provided role can reach the database insertion query. Do not rebuild the registration module.
4. Secure the registration validation schema: Required public registration fields: fullName, email, password. Public registration must not accept a trusted role from the client. Reject unexpected fields using Zod .strict().
5. Enforce server-side role assignment: Assign ACCOUNT_HOLDER explicitly inside trusted backend service. Never read role from req.body. Never pass a client-provided role into the SQL INSERT query. Use parameterized SQL queries.
6. Prevent role escalation: Test normal registration (ACCOUNT_HOLDER) and test role injection (ADMIN, AUDITOR, lowercase roles, privilege fields like isAdmin).
```

### 3. AI Suggestion
Initial audit identified 5 critical privilege escalation vulnerabilities:
1. `registerSchema` explicitly permitted `role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'])` and omitted `.strict()`.
2. `auth.controller.js` passed unfiltered `req.body` to the service.
3. `auth.service.js` accepted `role` from the arguments and defaulted to `'ACCOUNT_HOLDER'` only if missing.
4. `userRepository.create()` passed `$4` (the client role) directly into SQL `INSERT INTO users (..., role)`.
5. JWT tokens minted upon registration embedded `user.role` from the DB row, giving injected admins full access to `authorize('ADMIN')` routes.

### 4. Human Review and Correction
Mandated a 3-layer Defense-in-Depth architectural correction:
- **Layer 1 (Schema Rejection):** Removed `role` entirely from `registerSchema` and added `.strict()`. Any unexpected field (`role`, `isAdmin`, `permissions`) immediately triggers `400 Bad Request`.
- **Layer 2 (Controller Destructuring):** Modified `authController.register` to destructure only `{ fullName, email, password }` from `req.body`, discarding any extra fields.
- **Layer 3 (Authoritative Service Enforcement):** In `authService.register()`, hardcoded `const role = 'ACCOUNT_HOLDER'`. The backend is the sole authority for role assignment.
- **Documentation & Tests:** Removed `role` from `swagger.js` `UserRegister` schema. Expanded `tests/integration/auth.test.js` from 7 tests to 18 automated security tests.

### 5. Final Implementation
- `backend/src/modules/auth/auth.validation.js`: Strict registration schema omitting `role`.
- `backend/src/modules/auth/auth.controller.js`: Explicit field whitelisting.
- `backend/src/modules/auth/auth.service.js`: Unconditional server-side `ACCOUNT_HOLDER` role assignment.
- `backend/src/config/swagger.js`: Aligned OpenAPI register request schema.
- `backend/tests/integration/auth.test.js`: 18 automated security integration tests.

### 6. Verification
- Automated tests in `tests/integration/auth.test.js`: All 18 tests passed (normal registration, uppercase `ADMIN`/`AUDITOR` rejection, lowercase `admin`/`auditor` rejection, privilege fields `isAdmin` rejection, direct service call role enforcement, JWT tampering rejection, and admin endpoint RBAC protection).
- Overall suite: 106/106 tests passing.

### 7. Related Commit
- `1e54086d7941f5b73752296da57b1faa39426fce` – `fix: prevent privilege escalation in public registration with strict validation and server-side role enforcement` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1e54086d7941f5b73752296da57b1faa39426fce))

---

## Session 7: Concurrency, Idempotency and Authorization

**Date:** 2026-11-07

### 1. Objective
Complete Day 2 concurrency, idempotency, and authorization hardening: eliminate balance race conditions on withdrawals (`SELECT FOR UPDATE`), verify deterministic deadlock elimination on opposite transfers, enforce idempotency key scoping per user with concurrent retry serialization, verify IDOR account protection and auditor money-movement denial, and fix test harness runtime issues.

### 2. Original AI Prompt
```text
# LedgerLine — Day 2: Concurrency, Idempotency & Authorization Hardening
Act as a senior backend engineer, PostgreSQL specialist and application security engineer.
Your task is to complete the remaining Day 2 work for LedgerLine based on the existing implementation.
1. Project technology stack: Node.js, Express.js, JavaScript ES Modules, Neon PostgreSQL, PostgreSQL pg library with raw SQL, JWT authentication, bcrypt, Zod validation, Jest and Supertest, Swagger API documentation.
Important architecture decisions:
- UUIDs remain internal database identifiers.
- Account numbers such as LL-ACC-1001 are used in public API requests.
- Money is stored as integer paise using PostgreSQL BIGINT and JavaScript BigInt.
- Transactions use PostgreSQL database transactions.
- Ledger entries are append-only.
- The runtime database role follows least-privilege permissions.
- No ORM, Docker, TypeScript or unnecessary dependencies.
2. Existing progress: Manual endpoint testing was performed for idempotency, same key with same payload, same key with changed payload, transaction failure, account ownership/IDOR, RBAC, registration role escalation. Manual tests do not prove concurrent safety; inspect implementation and add automated tests for remaining scenarios.
3. BUILD — Review transaction and idempotency implementation:
- Unique constraints: Idempotency key uniqueness, duplicate transaction protection, account number uniqueness, foreign keys.
- Idempotency keys and request hashes: Verify 1 key per logical transaction; retries reuse original key; same key + payload returns original result; changed payload returns 409 conflict; concurrent requests cannot create duplicate transactions; failed transactions roll back cleanly.
- SELECT FOR UPDATE: Concurrency-safe balance checks; row-level locking on accounts; prevent negative balance overdrafts under racing withdrawals.
- Deadlock elimination: Opposite-direction concurrent transfers; deterministic row lock ordering (lexicographical order).
- Authorization & IDOR: Verify cross-user account access denial; auditor role read-only restriction (cannot deposit, withdraw, transfer).
```

### 3. AI Suggestion
- Confirmed `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)` protects key scoping.
- Evaluated withdrawal race condition: without `SELECT FOR UPDATE`, racing withdrawals read stale balance simultaneously, producing negative balances (-₹200).
- Evaluated bidirectional transfers: arbitrary row locking order triggers PostgreSQL circular wait deadlock `40P01`.
- Identified 3 runtime test harness issues during test suite execution:
  1. Seed fixture collision: Alice had an initial seeded deposit transaction (`INIT-ALICE`), throwing off generic transaction counts.
  2. Query parameter placeholder mismatch: `concurrency.test.js` passed 1 argument with `$2` placeholder, causing a PostgreSQL parameter error.
  3. Total ledger entry count failure in authorization tests due to initial seeded account credit entries.

### 4. Human Review and Correction
- **Racing Withdrawals:** Enforced `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE` within an active transaction. Balance validation occurs exclusively while holding the row lock. Engine-level `CHECK (balance >= 0)` serves as the ultimate safety barrier.
- **Opposite Transfers:** Verified `accountRepository.findTwoForUpdate()` acquires locks in global lexicographical order (`ORDER BY id ASC FOR UPDATE`), eliminating circular wait.
- **Idempotency Concurrency:** When identical requests race in parallel (`Promise.all`), the PostgreSQL unique constraint on `idempotency_keys` ensures exactly one thread creates the pending key reservation and commits. Concurrent requests receive `409 Conflict` or await the committed replay. Failed transactions roll back and release the key for clean client retries.
- **Authorization & IDOR:** Verified `authorizeAccountAccess` middleware blocks unauthorized cross-user balance queries, statements, and transfers with 403 Forbidden. Verified auditor role is strictly read-only and blocked from `/deposit`, `/withdraw`, `/transfer`.
- **Runtime Bugfixes:** Corrected SQL parameter placeholder to `$1`, filtered transaction assertions by `transaction_type = 'TRANSFER'`, and asserted `0` unauthorized debit/credit entries created.

### 5. Final Implementation
- `backend/src/repositories/account.repository.js`: Concurrency-safe `findByIdForUpdate` and `findTwoForUpdate`.
- `backend/src/modules/transactions/transaction.service.js`: Transaction boundary management (`BEGIN ... COMMIT / ROLLBACK`), idempotency lifecycle, and account ownership enforcement.
- `backend/src/middlewares/auth.middleware.js`: RBAC and `authorizeAccountAccess` middleware.
- `backend/tests/integration/idempotency.test.js`: 4 automated idempotency tests (sequential retry, concurrent retry via `Promise.all`, changed payload conflict, and cleanup rollback).
- `backend/tests/integration/concurrency.test.js`: 2 parallel race tests (racing withdrawals preventing overdraft, and opposite-direction transfers eliminating deadlocks).
- `backend/tests/integration/authorization.test.js`: 12 automated authorization tests (cross-user IDOR access denial, auditor money-movement denial, and auditor read-only inspection).

### 6. Verification
- `tests/integration/idempotency.test.js`: 4/4 tests passing.
- `tests/integration/concurrency.test.js`: 2/2 tests passing with zero deadlocks and zero overdrafts.
- `tests/integration/authorization.test.js`: 12/12 tests passing.
- Full backend test suite: 106/106 tests passing across all 9 test suites.

### 7. Related Commit
- `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

## Documentation Notes

- Original prompts must be genuine and preserved as written.
- Never present reconstructed or paraphrased prompts as verbatim.
- If an original prompt cannot be recovered, state that honestly.
- Record only implemented changes and tests that were actually performed.
- Include real Git commit references wherever available.
- Clearly distinguish AI suggestions from human decisions.
