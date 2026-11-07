# LedgerLine: AI-Assisted Engineering & Architecture Log (PROMPTS.md)

## Documentation Purpose & AI Collaboration Methodology

This document tracks genuine AI engineering interactions, architectural proposals, identified trade-offs, critical flaws detected during human code reviews, and subsequent architectural corrections throughout the implementation of **LedgerLine** (Secure Financial Transaction and Immutable Ledger System).

### Human-in-the-Loop Engineering Principles
1. **Human Ownership & Architectural Authority**: AI tools (such as Claude and DeepMind Antigravity) were utilized as intelligent pair-programming accelerators for drafting boilerplate, identifying edge cases, and generating test permutations. All architectural decisions, security boundaries, and schema invariants were directed, audited, and approved by the human engineer.
2. **Rigorous Verification Over Blind Trust**: No AI suggestion was merged without independent verification against financial engineering constraints (double-entry invariants, ACID transaction isolation, deterministic concurrency locking, and least-privilege security).
3. **Defense-in-Depth Security**: Whenever AI suggested single-layer protections (such as application-level validation alone), the human engineer mandated multi-layered defenses (e.g., combining database triggers, restricted PostgreSQL runtime roles, controller whitelisting, and strict Zod schema rejection).
4. **Authentic Git Traceability**: Every session correlates directly to verified commits in the project's Git history (`https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys.git`).

---

## Session 1: 2026-11-05 — Foundation, Driver Selection & Concurrency Design

- **Git Commits**:
  - `3e747ccba96e16f14b2f218aa7145392787b1b54` — `chore: initialize LedgerLine project` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3e747ccba96e16f14b2f218aa7145392787b1b54))
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` — `feat: initialize backend database infrastructure and integration test suite` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

### 1. ORM Elimination in Favor of Raw SQL
- **Context & Requirement**:
  Establish the database access layer and migration mechanism for a double-entry ledger system.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Use an Object-Relational Mapper (ORM) such as Prisma or Sequelize to model database entities, manage relationships, and execute automated database migrations.
- **Flaw / Limitation Identified During Human Review**:
  Financial accounting engines require explicit, deterministic control over PostgreSQL transaction boundaries (`BEGIN ... COMMIT / ROLLBACK`), row-level locking (`SELECT ... FOR UPDATE`), multi-table advisory locking during migrations, and exact SQL execution plans without ORM overhead or hidden sub-queries. Furthermore, ORMs historically introduce impedance mismatches with native 64-bit integer (`BIGINT`) minor currency units and custom PostgreSQL row locks.
- **Human Review, Decision & Architectural Correction**:
  Rejected ORMs completely. Selected native `pg` (`node-postgres`) using raw, parameterized SQL queries. Designed isolated repository classes (`accountRepository`, `transactionRepository`, `ledgerRepository`, `idempotencyRepository`) and created explicit, sequential migration scripts (`001_create_users.sql` to `006_create_audit_events.sql`) wrapped in PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`).
- **Technical Verification & Test Evidence**:
  `npm run migrate` successfully acquires transactional advisory locks and executes all DDL definitions atomically. Verified in `tests/helpers/testDb.js`.

### 2. Multi-Account Deadlock Elimination
- **Context & Requirement**:
  Design row-level locking strategy for internal transfers moving funds between two accounts.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  In transfer transactions, lock the source account row first, validate its balance, and subsequently lock the destination account row.
- **Flaw / Limitation Identified During Human Review**:
  If User A transfers money to User B while User B simultaneously transfers money to User A, Thread 1 acquires `Lock(Account_A)` and awaits `Lock(Account_B)`, while Thread 2 acquires `Lock(Account_B)` and awaits `Lock(Account_A)`. This creates a classic circular wait deadlock condition in PostgreSQL, resulting in error `40P01 (deadlock_detected)` and aborted transactions.
- **Human Review, Decision & Architectural Correction**:
  Mandated deterministic lock ordering. Implemented `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`: account UUIDs are sorted lexicographically (`[accountId1, accountId2].sort()`) before querying with `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`. Regardless of transfer direction, all concurrent threads acquire row locks in the exact same global order.
- **Technical Verification & Test Evidence**:
  Simultaneous bidirectional transfers tested in `tests/integration/concurrency.test.js` (`Test E: Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks`). Zero deadlocks occurred under parallel execution.

### 3. BigInt JSON Serialization in Node.js
- **Context & Requirement**:
  Safely handle and return financial calculations in integer paise without floating-point precision loss.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Return integer paise as native JavaScript `BigInt` directly from database queries and pass them to Express `res.json()`.
- **Flaw / Limitation Identified During Human Review**:
  Express's underlying `res.json()` relies on `JSON.stringify()`, which throws `TypeError: Do not know how to serialize a BigInt` when encountering modern 64-bit integers.
- **Human Review, Decision & Architectural Correction**:
  Configured `pg.types.setTypeParser(20, (val) => val === null ? null : BigInt(val))` so PostgreSQL `BIGINT` columns parse directly into JavaScript `BigInt`. Added global `BigInt.prototype.toJSON = function() { return this.toString(); };` in database initialization to prevent runtime serialization crashes. In API responses, amounts are returned with both `amountPaise` (string representation of minor units) and `amountFormatted` (human-readable Rupee string).
- **Technical Verification & Test Evidence**:
  Verified via unit tests in `tests/unit/money.test.js` and all integration API tests.

### 4. Idempotency Key Atomic Lifecycle
- **Context & Requirement**:
  Prevent duplicate financial transactions caused by network retries or double form submissions.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Store incoming idempotency keys in an external distributed cache (such as Redis) or memory cache with an expiration TTL.
- **Flaw / Limitation Identified During Human Review**:
  Distributed caches can drop keys during network partitions or node failovers. Furthermore, placing the idempotency reservation outside the primary PostgreSQL transaction boundary creates a split-brain vulnerability: the financial transaction might commit in PostgreSQL while the cache write fails, allowing duplicate subsequent executions.
- **Human Review, Decision & Architectural Correction**:
  Enforced database-backed idempotency inside the primary PostgreSQL transaction. Created the `idempotency_keys` table with `UNIQUE (user_id, idempotency_key)`. The key reservation, transaction record, and double-entry ledger postings commit atomically. If any step fails, the entire transaction rolls back cleanly.
- **Technical Verification & Test Evidence**:
  Verified in `tests/integration/idempotency.test.js` covering both identical payload replay and payload tampering conflict (409).

---

## Session 2: 2026-11-05 — Pre-Frontend Compliance Audit & Integration Architecture

- **Git Commit**:
  - `036328e13415335c05bf5bc48f314e3200158159` — `docs: add challenge compliance checklist, frontend integration plan, and AI prompt logs` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/036328e13415335c05bf5bc48f314e3200158159))

### 1. Statement Refusal Tracking vs. Ledger Separation
- **Context & Requirement**:
  Track refused and failed transaction attempts (e.g., insufficient funds, account status violations, authorization rejections) so account holders and auditors can inspect rejection history.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Insert failed transactions directly into the `ledger_entries` table with a status flag (`status = 'REFUSED'` or `'FAILED'`).
- **Flaw / Limitation Identified During Human Review**:
  Double-entry accounting principles dictate that the financial ledger must strictly reflect executed, committed balance movements. Polluting the immutable ledger with rejected attempts breaks accounting balance calculations and historical reconciliation (`SUM(credit) - SUM(debit) == balance`).
- **Human Review, Decision & Architectural Correction**:
  Separated financial accounting from security auditing:
  1. Immutable financial ledger (`ledger_entries`) records only committed balance movements.
  2. Security audit trail (`audit_events`) records refused operations (`TRANSACTION_WITHDRAW_REFUSED`, `TRANSACTION_TRANSFER_REFUSED`) with exact refusal reasons, attempted amounts, actor IDs, and IP addresses.
  3. The dedicated statement service (`src/modules/statements/statement.service.js`) pulls committed postings from `ledger_entries` and queries refused attempts dynamically from `audit_events`.
- **Technical Verification & Test Evidence**:
  Verified in `tests/integration/transactions.test.js`, `tests/integration/authorization.test.js`, and `src/modules/statements/statement.service.js`.

### 2. Append-Only Protection: Database Engine vs. Application Layer
- **Context & Requirement**:
  Ensure ledger records cannot be altered, forged, or deleted once written.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Rely exclusively on application-level repository encapsulation (omitting `UPDATE` and `DELETE` methods from `LedgerRepository`) to guarantee append-only immutability.
- **Flaw / Limitation Identified During Human Review**:
  Application-level encapsulation is insufficient for financial compliance. It provides zero protection against direct SQL execution, compromised database credentials, accidental migration scripts, or internal administrative errors.
- **Human Review, Decision & Architectural Correction**:
  Mandated database-level immutability enforcement. Designed a two-layer security posture:
  1. A PostgreSQL database trigger prohibiting modifications on `ledger_entries`.
  2. SQL privilege revocation (`REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries`) for the runtime database user.
- **Technical Verification & Test Evidence**:
  Formulated requirements documented in `CHALLENGE_CHECKLIST.md` and implemented in Session 3.

---

## Session 3: 2026-11-06 — Database-Level Append-Only Ledger Hardening & Role Separation

- **Git Commits**:
  - `a5502e115a06298a620e8e2ccf53fed012a5eb8b` — `security: enforce database-level ledger immutability` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a5502e115a06298a620e8e2ccf53fed012a5eb8b))
  - `e56267c6fe8cb289b0ff6f0166551097f870950b` — `feat(security): protect ledger from modifications` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b))
  - `ac7c8340bd2b61de446a61a8017ea85de8a7beb0` — `docs(prompts): update AI interaction log` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/ac7c8340bd2b61de446a61a8017ea85de8a7beb0))

### 1. Dual-Layer Defense-in-Depth vs. Single Layer
- **Context & Requirement**:
  Implement concrete database-level protections preventing `UPDATE`, `DELETE`, and `TRUNCATE` operations on `ledger_entries`.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Implement either a PostgreSQL trigger OR configure PostgreSQL role permissions alone to guard the table.
- **Flaw / Limitation Identified During Human Review**:
  A trigger alone allows the runtime connection to hold table modification privileges; if the trigger is disabled, dropped, or bypassed during an outage, rows become vulnerable. Conversely, role permissions alone leave the table unprotected when queries execute under table-owner or administrative connections.
- **Human Review, Decision & Architectural Correction**:
  Implemented both layers simultaneously (Defense-in-Depth):
  1. **PostgreSQL Trigger (`trg_prevent_ledger_modification`)**: Fires `BEFORE UPDATE OR DELETE ON ledger_entries` and raises SQLSTATE `23000 (integrity_constraint_violation)`.
  2. **Dedicated Restricted Runtime Role (`ledgerline_runtime`)**: Table permissions explicitly grant `SELECT` and `INSERT` while revoking `UPDATE`, `DELETE`, and `TRUNCATE` (triggering SQLSTATE `42501 insufficient_privilege`).
- **Technical Verification & Test Evidence**:
  Verified in `tests/integration/ledger_immutability.test.js`: both the trigger violation and the insufficient privilege error are asserted independently.

### 2. Test Harness Truncation Isolation
- **Context & Requirement**:
  Execute automated integration test suites under the restricted runtime database role while maintaining test suite isolation.
- **Flaw Encountered**:
  Executing tests directly under `ledgerline_runtime` caused `cleanDatabase()` to crash because it calls `TRUNCATE TABLE ... ledger_entries CASCADE`. `TRUNCATE` requires table ownership or explicit privilege, which `ledgerline_runtime` intentionally does not possess.
- **Human Review, Decision & Architectural Correction**:
  Architected dual connection pools in the test harness (`tests/helpers/testDb.js`):
  1. `adminPool` connects via `TEST_DIRECT_URL` (database owner) strictly for administrative test setup, schema migrations, and `cleanDatabase()` truncation.
  2. `testPool` connects via `TEST_DATABASE_URL` (the restricted runtime user `ledgerline_runtime`) for executing all application routes, repositories, and integration assertions.
- **Technical Verification & Test Evidence**:
  Verified with `npm test` running 8 dedicated immutability tests and 39 overall tests passing with complete isolation.

### 3. BigInt Comparison on PostgreSQL SUM() Result
- **Context & Requirement**:
  Verify the double-entry accounting equation by calculating `SUM(credit) - SUM(debit)` from `ledger_entries` and asserting equivalence with `accounts.balance`.
- **Actual Mistake Encountered**:
  In `tests/integration/ledger_immutability.test.js`, the test assertion `expect(aliceCalculated).toBe(aliceDbAcc.rows[0].balance)` failed with `Expected: 9000n, Received: "9000"`.
- **Root Cause Analysis**:
  PostgreSQL's `SUM()` aggregate returns a `NUMERIC` type when summing integers to guard against overflow. The `node-postgres` driver returns `NUMERIC` as a JavaScript string to avoid precision loss. In contrast, `accounts.balance` is a `BIGINT` column parsed into native JavaScript `BigInt` (OID 20 parser). Comparing string to BigInt via strict equality failed.
- **Human Review, Decision & Architectural Correction**:
  Wrapped the aggregated result with `BigInt(aliceCalculated)` and `BigInt(bobCalculated)` to compare numeric values safely without precision loss.
- **Fixing Commit URL**:
  `https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b`

---

## Session 4: 2026-11-06 — Fix Backend Startup Logs, API Routing, and 404 Errors

- **Git Commits**:
  - `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` — `fix(backend): resolve API routing and startup issues` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))
  - `3bcaf3f6f102cf85119de028040097c40daa08b8` — `feat: updated to display the default user credentials at runtime.` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3bcaf3f6f102cf85119de028040097c40daa08b8))

### 1. API Base URL Duplication (`/api/v1/api/v1/auth/register`)
- **Context & Requirement**:
  Ensure Swagger UI and client API callers successfully reach backend endpoints without path concatenation errors.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaw Discovered**:
  Requests dispatched from Swagger UI produced `404 Endpoint not found: [POST] /api/v1/api/v1/auth/register`. In `swagger.js`, OpenAPI `servers` configured `url: '/api/v1'`, while route definitions also included `/api/v1` in path strings (e.g., `'/api/v1/auth/register'`). Swagger UI concatenated both, resulting in doubled paths.
- **Human Review, Decision & Architectural Correction**:
  Established a strict route structure convention:
  1. Base URL: `http://localhost:5000/api/v1` for Axios clients and OpenAPI server definition.
  2. Swagger route paths: strictly relative to `/api/v1` (e.g. `/auth/register`, `/accounts`, `/transactions`).
  3. Express mounting: versioned router mounted under `/api/v1` exactly once in `src/app.js`.
- **Technical Verification & Test Evidence**:
  Verified via automated route verification test asserting `POST /api/v1/auth/register` returns 201/400 while `POST /api/v1/api/v1/auth/register` returns 404.

### 2. Health-Check Endpoint Inconsistency (`/api/v1/health` vs `/health`)
- **Context & Requirement**:
  Expose infrastructure health monitoring for container orchestrators and load balancers.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaw Discovered**:
  Frontend health polling attempted `GET /api/v1/health` resulting in 404, while startup logs announced `GET http://localhost:5000/health`. In Swagger, `/health` was grouped under `/api/v1`.
- **Human Review, Decision & Architectural Correction**:
  Added an explicit path-level server override in OpenAPI specification: `/health` sets `servers: [{ url: '/', description: 'Root URL' }]`, ensuring Swagger UI targets root `/health`. Updated documentation to confirm that `/health` is an unversioned infrastructure endpoint.
- **Technical Verification & Test Evidence**:
  `GET /health` returns 200 `{ status: 'UP', database: { connected: true } }`, and confirmed `GET /api/v1/health` returns 404 without duplicating routes.

### 3. Missing OpenAPI Route Definitions
- **Context & Requirement**:
  Document all administrative and statement endpoints in Swagger.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaw Discovered**:
  Several endpoints (`/statements/:accountId`, `/admin/users`, `/admin/accounts`, `/admin/users/:userId/status`, `/admin/accounts/:accountId/status`) were completely missing from `swagger.js`, leaving them untestable via the interactive documentation.
- **Human Review, Decision & Architectural Correction**:
  Added complete OpenAPI 3.0 documentation for all missing routes, including request schemas, query parameters, status codes, and error response models.
- **Technical Verification & Test Evidence**:
  Verified across all 25 registered endpoints in `tests/integration/api_verification_audit.test.js`.

### 4. PostgreSQL SSL Mode Deprecation Warning
- **Context & Requirement**:
  Connect securely to Neon Cloud PostgreSQL over TLS/SSL.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaw Discovered**:
  The PostgreSQL driver printed `WARNING: sslmode=require is treated as verify-full` upon server startup due to recent changes in `pg-connection-string`.
- **Human Review, Decision & Architectural Correction**:
  Updated `.env` and `.env.example` connection strings to explicitly declare `sslmode=verify-full&channel_binding=require`. Added regex normalization in `src/config/env.js` `sanitizeUrl()` so any legacy `sslmode=require` is upgraded to `sslmode=verify-full` while maintaining strict `rejectUnauthorized: true` certificate verification.
- **Technical Verification & Test Evidence**:
  Database connections established with zero deprecation warnings.

---

## Session 5: 2026-11-06 — Implement Account Number-Based Transfers & Core Ledger Modules

- **Git Commits**:
  - `07403060c2b04426384c0e3608f1e32d23e0a770` — `feat: implement account number-based transfers with backward compatibility and swagger docs` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))
  - `1437e9d509179c58294cbf227d8ab8801abb068c` — `feat: add swagger api documentation configuration` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1437e9d509179c58294cbf227d8ab8801abb068c))
  - `b5dc36bd0da945c3d9bf5be7467092c342316ca7` — `feat: add core financial ledger modules, validation, and API documentation` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/b5dc36bd0da945c3d9bf5be7467092c342316ca7))
  - `27710507e2c490adc07ee59bca81ad0d7ddcb203` — `feat: implement account service and integration test suites with jest` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/27710507e2c490adc07ee59bca81ad0d7ddcb203))

### 1. Dual Identification Support & Backward Compatibility
- **Context & Requirement**:
  Support human-readable account numbers (`LL-ACC-1001`) in transfer endpoints while preserving backwards compatibility for internal UUIDs.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Replace `sourceAccountId` and `destinationAccountId` with `sourceAccountNumber` and `destinationAccountNumber` exclusively in validation schemas, removing UUID support.
- **Flaw / Limitation Identified During Human Review**:
  Abruptly removing UUID support would break backward compatibility with existing automated integration tests, legacy clients, and administrative endpoints.
- **Human Review, Decision & Architectural Correction**:
  Configured Zod `.superRefine` validation in `transaction.validation.js` accepting either pair:
  1. Primary: `sourceAccountNumber` and `destinationAccountNumber`
  2. Legacy: `sourceAccountId` and `destinationAccountId`
  If neither pair or a mismatched mix is provided, a clear validation error is returned.
- **Technical Verification & Test Evidence**:
  Verified in `tests/integration/account_number_transfer.test.js` covering both account-number and UUID payloads.

### 2. Idempotency Request Hash Normalization
- **Context & Requirement**:
  Compute SHA-256 request hashes to detect idempotency key reuse conflicts.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **AI Proposal / Initial Suggestion**:
  Directly hash the raw incoming JSON payload keys provided by the client.
- **Flaw / Limitation Identified During Human Review**:
  If a client retried a transfer using an account number instead of a UUID (or vice versa), the raw JSON payload hash would differ. This would bypass the idempotency check and execute the financial transfer twice.
- **Human Review, Decision & Architectural Correction**:
  In `transactionService.transfer()`, account numbers are resolved to their persistent UUIDs first. The canonical SHA-256 idempotency request hash is then computed across the resolved logical transfer: `{ op: 'TRANSFER', sourceAccountId, destinationAccountId, amountPaise: amountPaise.toString() }`.
- **Technical Verification & Test Evidence**:
  Verified in `tests/integration/account_number_transfer.test.js` (`Duplicate transfer request with same Idempotency-Key returns cached response without duplicate execution`).

### 3. Zod Error Formatting in Integration Assertions
- **Context & Requirement**:
  Validate identical source and destination account rejection in transfer requests.
- **Actual Mistake Encountered**:
  In `tests/integration/account_number_transfer.test.js` Scenario 7, the assertion `expect(res.body.message).toMatch(/Source and destination accounts must be different/i)` failed because `validateRequest` middleware formats top-level `message: "Validation failed"` and nests the custom rule message in `res.body.errors[0].message`.
- **Human Review, Decision & Architectural Correction**:
  Updated the test assertion to inspect the structured errors array: `expect(JSON.stringify(res.body)).toMatch(/Source and destination accounts must be different/i)`.
- **Technical Verification & Test Evidence**:
  All 20 integration tests passed in `tests/integration/account_number_transfer.test.js`.

---

## Human Architectural Correction: Account Number-Based Transfers

- **Context**: During the initial design of the money transfer API, the AI suggested using internal database account UUIDs (`sourceAccountId` and `destinationAccountId`) as the public request parameters.
- **Human Review & Architectural Correction**:
  Requiring end users to discover and submit internal 36-character database UUIDs is poor API design and exposes internal primary keys. Banking and fintech users identify accounts using structured account numbers (`LL-ACC-1001`).
  The human engineer instructed the AI to restructure the transfer API:
  1. The frontend must present and require account numbers for source and destination selection.
  2. The transfer API must accept account numbers (`sourceAccountNumber`, `destinationAccountNumber`) as first-class inputs.
  3. The backend resolves both account numbers to internal UUIDs before locking or querying.
  4. All internal database relationships, foreign keys, row locks (`SELECT FOR UPDATE`), and immutable ledger entries continue using UUIDs.
  5. Source account ownership must be strictly verified against `req.user.id`.
  6. Existing authorization, idempotency, concurrency, and double-entry ledger invariants must remain intact.
- **Human Contribution**: Reviewed the AI proposal, rejected UUID-only endpoints, designed the dual-identification resolution architecture, and mandated backwards compatibility.
- **Implementation Status**: Completed and verified. Passed all 20 automated integration scenarios in `tests/integration/account_number_transfer.test.js`.
- **Associated Commit**: `07403060c2b04426384c0e3608f1e32d23e0a770` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))

---

## Session 6: 2026-11-07 — Registration Security & Role Escalation Prevention

- **Git Commit**:
  - `1e54086d7941f5b73752296da57b1faa39426fce` — `fix: prevent privilege escalation in public registration with strict validation and server-side role enforcement` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1e54086d7941f5b73752296da57b1faa39426fce))

### 1. Public Registration Schema Vulnerability & Role Injection
- **Context & User Request**:
  Audit and secure the public registration flow to prevent privilege escalation. A normal user must not be able to register as `ADMIN` or `AUDITOR` by modifying the HTTP request payload. Public registration must always create an `ACCOUNT_HOLDER`.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
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
- **Technical Verification & Test Evidence**:
  Executed automated test suite against Neon PostgreSQL test database (`TEST_DATABASE_URL`). All 18 auth tests and 30 API verification tests passed with 100% success rate.

---

## Session 7: 2026-11-07 — Day 2: Concurrency, Idempotency & Authorization Hardening

- **Git Commit**:
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` — `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

### 1. Idempotency Key Scoping & Concurrent Retry Serialization
- **Context & Requirement**:
  Review idempotency key mechanics across financial endpoints (`POST /api/v1/transactions/*`). Verify behavior for sequential retries, concurrent retries, tampered payloads, and failed attempts.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Architectural Findings & Hardening**:
  1. **Key Uniqueness & Scope**: Protected by PostgreSQL unique constraint `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)`. Keys are strictly scoped per authenticated user, preventing cross-user collision.
  2. **Canonical Payload Hash**: A SHA-256 hash is computed across normalized operation parameters (`op`, `sourceAccountId`, `destinationAccountId`, `amountPaise`). Retrying with modified amount or destination triggers `409 Conflict` (`Idempotency key reuse conflict: request payload differs from original request`).
  3. **Concurrent Retry Race Serialization**: When identical requests race in parallel (`Promise.all`), the PostgreSQL unique constraint on `idempotency_keys` allows exactly one thread to insert the pending key reservation and execute the transaction. Racing concurrent requests either receive `409 Conflict` (due to active in-flight lock or unique violation) or await and retrieve the committed replay. Under no circumstance can a duplicate transaction or duplicate ledger entry be created.
  4. **Failed Transaction Rollback**: If balance validation fails, the entire transaction rolls back, releasing the in-flight key so the client can retry cleanly.
- **Technical Verification & Test Evidence**:
  Automated tests in `tests/integration/idempotency.test.js` (Test A sequential retry, Test B concurrent retry with `Promise.all`, Test C changed payload conflict, and failed cleanup retry).

### 2. Balance Race Conditions & `SELECT FOR UPDATE`
- **Context & Requirement**:
  Investigate balance check atomicity under racing withdrawal requests.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaws Evaluated**:
  Without row-level locks, two concurrent withdrawals (e.g. ₹400 and ₹300 against a ₹500 balance) read `balance >= amount` simultaneously before either updates, causing negative balance overdraft (-₹200).
- **Mitigation Architecture**:
  1. Transaction isolation with `BEGIN ... COMMIT`.
  2. Immediate row-level locking via `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE`.
  3. Balance validation occurs exclusively while the row lock is held.
  4. Engine-level `CHECK (balance >= 0)` constraint as an absolute safety barrier.
- **Technical Verification & Test Evidence**:
  `tests/integration/concurrency.test.js` (Test D racing withdrawals: exactly one succeeds, the other fails with 400 Insufficient Funds, final balance is either 10,000 or 20,000 paise, and balance never drops below zero).

### 3. Multi-Account Deadlock Elimination (Deterministic Lock Ordering)
- **Context & Requirement**:
  Investigate simultaneous opposite-direction transfers: Account A transfers to Account B while Account B concurrently transfers to Account A.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Flaws Evaluated**:
  Arbitrary lock order locks Account A on thread 1 and Account B on thread 2, causing circular wait and PostgreSQL deadlock exception `40P01 (deadlock_detected)`.
- **Mitigation Architecture**:
  In `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`, the two account UUIDs are sorted lexicographically (`[accountId1, accountId2].sort()`) and queried via `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`. Both transactions acquire locks in identical global order.
- **Technical Verification & Test Evidence**:
  `tests/integration/concurrency.test.js` (Test E opposite transfers: zero deadlocks, both transfers commit, double-entry ledger is balanced: 2 debits = 2 credits = 4,000 paise, and money is conserved).

### 4. Cross-User Account Access (IDOR Prevention) & Auditor Denial
- **Context & Requirement**:
  Verify authorization boundaries preventing regular users from accessing other accounts, and ensuring auditors cannot move money.
  > *[Pending Human Input: Insert exact verbatim user prompt text if exported from chat history]*
- **Mitigation Architecture**:
  1. `authorizeAccountAccess` middleware and `transactionService` verify account ownership against `req.user.id`.
  2. Any cross-user attempt to query balance, view statements, withdraw, or transfer returns `403 Forbidden` with zero database modifications.
  3. Auditor role has strictly read-only access to `/ledger`, `/audit-events`, `/accounts`, and `/statements`. Any attempt to call `/deposit`, `/withdraw`, or `/transfer` returns `403 Forbidden`.
- **Technical Verification & Test Evidence**:
  `tests/integration/authorization.test.js` (Test F cross-user IDOR access denial, and Test G auditor money-movement denial with read-only inspection verified).

### 5. Discovered Errors and Runtime Corrections
- **Seed Fixture Collision**:
  - *Error*: Initial test assertions checking `transactions WHERE initiated_by = $1` received count `2` instead of `1`.
  - *Root Cause*: `seedTestFixtures()` seeds an initial deposit transaction (`INIT-ALICE`).
  - *Fix*: Filtered transaction assertions with `transaction_type = 'TRANSFER'` or checked explicit transaction IDs.
- **Query Parameter Placeholder Mismatch**:
  - *Error*: In `concurrency.test.js`, an account balance update query passed 1 parameter with `$2` placeholder, triggering `error: could not determine data type of parameter $1`.
  - *Fix*: Corrected the placeholder to `$1`.
- **Ledger Invariant Verification**:
  - *Error*: In `authorization.test.js`, total ledger entries assertion failed because both Alice and Bob have initial seeded credit entries.
  - *Fix*: Verified that 0 `DEBIT` entries and 0 `TRANSFER` transactions were created during unauthorized attempts, proving complete database isolation.
