# LedgerLine: AI-Assisted Engineering & Architecture Log (PROMPTS.md)

## Documentation Purpose & AI Collaboration Methodology

This document provides a comprehensive, chronological record of AI-assisted engineering sessions during the development of **LedgerLine** (Secure Financial Transaction and Immutable Ledger System). It is structured to adhere to technical hiring challenge standards for AI collaboration, demonstrating how AI coding assistants were leveraged while engineering leadership, critical reviews, security audits, and architectural decisions remained strictly with the human engineer.

### Human-in-the-Loop Engineering Principles
1. **Human Ownership & Architectural Authority**: AI tools (such as Claude and DeepMind Antigravity) were utilized as intelligent pair-programming accelerators for drafting boilerplate, identifying edge cases, and generating test permutations. All architectural decisions, security boundaries, and schema invariants were directed, audited, and approved by the human engineer.
2. **Rigorous Verification Over Blind Trust**: No AI suggestion was merged without independent verification against financial engineering constraints (double-entry invariants, ACID transaction isolation, deterministic concurrency locking, and least-privilege security).
3. **Defense-in-Depth Security**: Whenever AI suggested single-layer protections (such as application-level validation alone), the human engineer mandated multi-layered defenses (e.g., combining database triggers, restricted PostgreSQL runtime roles, controller whitelisting, and strict Zod schema rejection).
4. **Authentic Git Traceability**: Every engineering interaction is linked to verified commits in the project's Git repository (`https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys.git`).
5. **Transparency & Evidence Integrity**: Verbatim prompts are included where recovered from session transcripts. Where historical verbatim text was not captured in repository history, it is explicitly noted as unavailable rather than fabricated.

---

## Session 1: 2026-11-05 — Foundation, Driver Selection & Concurrency Design

### Interaction 1. ORM Elimination in Favor of Raw SQL

- **Context & Requirement:** Establish the database access layer and migration mechanism for a high-integrity, double-entry financial accounting ledger.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to evaluate database access layers (Prisma vs Sequelize vs raw SQL) for handling strict PostgreSQL transaction isolation, explicit row-level locks, and integer paise currency units.
- **AI Proposal / Initial Suggestion:** Recommended using an Object-Relational Mapper (ORM) such as Prisma or Sequelize to model database entities, manage relations, and run automated database migrations.
- **Flaw / Limitation Identified During Human Review:** Financial accounting engines require strict, fine-grained control over PostgreSQL transaction isolation, explicit row-level locking (`SELECT ... FOR UPDATE`), deterministic multi-row locking to prevent deadlocks, and exact SQL execution plans without ORM query generation overhead or hidden sub-queries. Furthermore, ORMs frequently introduce impedance mismatches with native 64-bit BigInt minor currency units and transactional advisory locks during migrations.
- **Human Review, Decision & Architectural Correction:** Rejected ORMs entirely in favor of native `pg` (`node-postgres`) using raw, parameterized SQL queries. Designed isolated repository classes (`accountRepository`, `transactionRepository`, `ledgerRepository`, `idempotencyRepository`) and created explicit, sequential migration scripts (`001_create_users.sql` to `006_create_audit_events.sql`) wrapped in PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`).
- **Implementation Details:**
  - Files created: `backend/src/config/database.js`, `backend/src/database/migrate.js`, `backend/src/database/migrations/001_create_users.sql` through `006_create_audit_events.sql`.
  - Modules: `node-postgres` connection pool, transactional DDL runner.
- **Technical Verification & Test Evidence:** `npm run migrate` executes transactional DDL with PostgreSQL advisory locks. Verified in `tests/helpers/testDb.js`.
- **Related Git Commit:** `a0d9f05fc2722669f1f09e00819732aaa035763e` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

### Interaction 2. Multi-Account Deadlock Elimination

- **Context & Requirement:** Design row-level locking strategy for internal transfers moving funds between two accounts.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to implement balance verification and transfer execution between two bank accounts under concurrent access.
- **AI Proposal / Initial Suggestion:** In transfer transactions, acquire a lock on the source account row first, check its balance, and subsequently acquire a lock on the destination account row.
- **Flaw / Limitation Identified During Human Review:** If User A transfers money to User B while User B simultaneously transfers money to User A, Thread 1 acquires `Lock(Account_A)` and awaits `Lock(Account_B)`, while Thread 2 acquires `Lock(Account_B)` and awaits `Lock(Account_A)`. This creates a classic circular wait deadlock condition in PostgreSQL, resulting in error `40P01 (deadlock_detected)` and aborted transactions.
- **Human Review, Decision & Architectural Correction:** Mandated deterministic global lock ordering. Implemented `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`: account UUIDs are sorted lexicographically (`[accountId1, accountId2].sort()`) before querying with `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`. Regardless of transfer direction, all concurrent threads acquire row locks in the exact same global order.
- **Implementation Details:**
  - Files modified: `backend/src/repositories/account.repository.js`, `backend/src/modules/transactions/transaction.service.js`.
  - Method: `findTwoForUpdate` with lexicographical array sorting and parameterized `ANY($1::uuid[])` query.
- **Technical Verification & Test Evidence:** Verified with parallel requests in `tests/integration/concurrency.test.js` (`Test E: Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks`). Zero deadlocks occurred under simultaneous execution.
- **Related Git Commit:** `a0d9f05fc2722669f1f09e00819732aaa035763e` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

### Interaction 3. BigInt JSON Serialization in Node.js

- **Context & Requirement:** Safely handle and return financial calculations in integer paise without floating-point precision loss.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to store currency amounts as integer paise (`BIGINT`) in PostgreSQL and map them into Node.js Express API responses.
- **AI Proposal / Initial Suggestion:** Return integer paise as native JavaScript `BigInt` directly from database queries and pass them to Express `res.json()`.
- **Flaw / Limitation Identified During Human Review:** Express's underlying `res.json()` relies on `JSON.stringify()`, which throws a `TypeError: Do not know how to serialize a BigInt` when encountering modern 64-bit integers.
- **Human Review, Decision & Architectural Correction:** Configured `pg.types.setTypeParser(20, (val) => val === null ? null : BigInt(val))` so PostgreSQL `BIGINT` columns parse directly into JavaScript `BigInt`. Added global `BigInt.prototype.toJSON = function() { return this.toString(); };` in database initialization to prevent runtime serialization crashes. In API responses, amounts are returned with both `amountPaise` (string representation of minor units) and `amountFormatted` (human-readable Rupee string).
- **Implementation Details:**
  - Files modified: `backend/src/config/database.js`, `backend/src/utils/money.js`.
  - Utilities: `toPaise`, `formatRupees`, `isPositivePaise`.
- **Technical Verification & Test Evidence:** Unit tests in `tests/unit/money.test.js` (8 tests passing) and all integration API tests.
- **Related Git Commit:** `a0d9f05fc2722669f1f09e00819732aaa035763e` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

### Interaction 4. Idempotency Key Atomic Lifecycle

- **Context & Requirement:** Prevent duplicate financial transactions caused by client network retries or repeated form submissions.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to design an idempotency mechanism ensuring that retried payment operations execute exactly once.
- **AI Proposal / Initial Suggestion:** Store incoming idempotency keys in an external distributed cache (such as Redis) or memory cache with an expiration TTL.
- **Flaw / Limitation Identified During Human Review:** Distributed caches can drop keys during network partitions or node failovers. Furthermore, placing the idempotency reservation outside the primary PostgreSQL transaction boundary creates a split-brain vulnerability: the financial transaction might commit in PostgreSQL while the cache write fails, allowing duplicate subsequent executions.
- **Human Review, Decision & Architectural Correction:** Enforced database-backed idempotency inside the primary PostgreSQL transaction. Created the `idempotency_keys` table with `UNIQUE (user_id, idempotency_key)`. The key reservation, transaction record, and double-entry ledger postings commit atomically. If any step fails, the entire transaction rolls back cleanly.
- **Implementation Details:**
  - Files created: `backend/src/database/migrations/005_create_idempotency_keys.sql`, `backend/src/repositories/idempotency.repository.js`.
  - Service integration: `transaction.service.js` `checkIdempotency()` with SHA-256 request hashing.
- **Technical Verification & Test Evidence:** Verified in `tests/integration/idempotency.test.js` covering both identical payload replay and payload tampering conflict (409).
- **Related Git Commit:** `a0d9f05fc2722669f1f09e00819732aaa035763e` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

## Session 2: 2026-11-05 — Pre-Frontend Compliance Audit & Integration Architecture

### Interaction 5. Statement Refusal Tracking vs. Ledger Separation

- **Context & Requirement:** Track refused and failed transaction attempts (e.g., insufficient funds, account status violations, authorization rejections) so account holders and auditors can inspect rejection history.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to formulate how failed transaction attempts should be surfaced in account statements.
- **AI Proposal / Initial Suggestion:** Insert failed transactions directly into the `ledger_entries` table with a status flag (`status = 'REFUSED'` or `'FAILED'`).
- **Flaw / Limitation Identified During Human Review:** Double-entry accounting principles dictate that the financial ledger must strictly reflect executed, committed balance movements. Polluting the immutable ledger with rejected attempts breaks accounting balance calculations and historical reconciliation (`SUM(credit) - SUM(debit) == balance`).
- **Human Review, Decision & Architectural Correction:** Separated financial accounting from security auditing:
  1. Immutable financial ledger (`ledger_entries`) records only committed balance movements.
  2. Security audit trail (`audit_events`) records refused operations (`TRANSACTION_WITHDRAW_REFUSED`, `TRANSACTION_TRANSFER_REFUSED`) with exact refusal reasons, attempted amounts, actor IDs, and IP addresses.
  3. The dedicated statement service (`src/modules/statements/statement.service.js`) pulls committed postings from `ledger_entries` and queries refused attempts dynamically from `audit_events`.
- **Implementation Details:**
  - Files created: `backend/src/database/migrations/006_create_audit_events.sql`, `backend/src/repositories/audit.repository.js`, `backend/src/modules/statements/statement.service.js`.
  - Endpoints: `GET /api/v1/statements/:accountId` and `GET /api/v1/audit-events`.
- **Technical Verification & Test Evidence:** Verified in `tests/integration/transactions.test.js`, `tests/integration/authorization.test.js`, and `src/modules/statements/statement.service.js`.
- **Related Git Commit:** `036328e13415335c05bf5bc48f314e3200158159` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/036328e13415335c05bf5bc48f314e3200158159))

---

### Interaction 6. Append-Only Protection: Database Engine vs. Application Layer

- **Context & Requirement:** Ensure financial ledger records cannot be altered, forged, or deleted once written.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to specify how ledger immutability should be enforced in compliance with financial regulations.
- **AI Proposal / Initial Suggestion:** Rely exclusively on application-level repository encapsulation (omitting `UPDATE` and `DELETE` methods from `LedgerRepository`) to guarantee append-only immutability.
- **Flaw / Limitation Identified During Human Review:** Application-level encapsulation is insufficient for financial compliance. It provides zero protection against direct SQL execution, compromised database credentials, accidental migration scripts, or internal administrative errors.
- **Human Review, Decision & Architectural Correction:** Mandated database-level immutability enforcement. Formulated a two-layer security posture:
  1. A PostgreSQL database trigger prohibiting modifications on `ledger_entries`.
  2. SQL privilege revocation (`REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries`) for the runtime database user.
- **Implementation Details:**
  - Architectural requirements codified in `CHALLENGE_CHECKLIST.md` under Section 2 ("Ledger Immutability").
  - Implementation queued for Session 3 migrations.
- **Technical Verification & Test Evidence:** Reflected in `CHALLENGE_CHECKLIST.md` and subsequently implemented in `007_prevent_ledger_modification_trigger.sql`.
- **Related Git Commit:** `036328e13415335c05bf5bc48f314e3200158159` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/036328e13415335c05bf5bc48f314e3200158159))

---

## Session 3: 2026-11-06 — Database-Level Append-Only Ledger Hardening & Role Separation

### Interaction 7. Dual-Layer Defense-in-Depth vs. Single Layer

- **Context & Requirement:** Implement concrete database-level protections preventing `UPDATE`, `DELETE`, and `TRUNCATE` operations on `ledger_entries`.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to execute the database-level immutability plan formulated in Session 2.
- **AI Proposal / Initial Suggestion:** Implement either a PostgreSQL trigger OR configure PostgreSQL role permissions alone to guard the table.
- **Flaw / Limitation Identified During Human Review:** A trigger alone allows the runtime connection to hold table modification privileges; if the trigger is disabled, dropped, or bypassed during an outage, rows become vulnerable. Conversely, role permissions alone leave the table unprotected when queries execute under table-owner or administrative connections.
- **Human Review, Decision & Architectural Correction:** Implemented both layers simultaneously (Defense-in-Depth):
  1. **PostgreSQL Trigger (`trg_prevent_ledger_modification`)**: Fires `BEFORE UPDATE OR DELETE ON ledger_entries` and raises SQLSTATE `23000 (integrity_constraint_violation)`.
  2. **Dedicated Restricted Runtime Role (`ledgerline_runtime`)**: Table permissions explicitly grant `SELECT` and `INSERT` while revoking `UPDATE`, `DELETE`, and `TRUNCATE` (triggering SQLSTATE `42501 insufficient_privilege`).
- **Implementation Details:**
  - Migrations: `backend/src/database/migrations/007_prevent_ledger_modification_trigger.sql`.
  - Scripts: `backend/src/database/setup-runtime-role.js`.
  - Roles created: `ledgerline_runtime` with least-privilege table grants.
- **Technical Verification & Test Evidence:** Verified in `tests/integration/ledger_immutability.test.js`: both the trigger violation (SQLSTATE `23000`) and the insufficient privilege error (SQLSTATE `42501`) are asserted independently.
- **Related Git Commit:** `a5502e115a06298a620e8e2ccf53fed012a5eb8b` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a5502e115a06298a620e8e2ccf53fed012a5eb8b))

---

### Interaction 8. Test Harness Truncation Isolation

- **Context & Requirement:** Execute automated integration test suites under the restricted runtime database role while maintaining test suite isolation.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to run Jest integration tests under `ledgerline_runtime` to verify least-privilege operation.
- **Flaw / Limitation Identified During Human Review:** Running integration tests under the restricted runtime role broke test isolation because `cleanDatabase()` calls `TRUNCATE TABLE ... ledger_entries CASCADE`, which requires table ownership or `TRUNCATE` privileges that the restricted runtime role intentionally does not possess.
- **Human Review, Decision & Architectural Correction:** Separated test harness administrative cleanup from runtime application execution. Architected dual connection pools in `tests/helpers/testDb.js`:
  1. `adminPool` connects via `TEST_DIRECT_URL` (database owner) strictly for administrative test setup, schema migrations, and `cleanDatabase()` truncation.
  2. `testPool` connects via `TEST_DATABASE_URL` (the restricted runtime user `ledgerline_runtime`) for executing all application routes, repositories, and integration assertions.
- **Implementation Details:**
  - Files modified: `backend/tests/helpers/testDb.js`.
  - Configuration: `TEST_DIRECT_URL` for admin pool, `TEST_DATABASE_URL` for application pool.
- **Technical Verification & Test Evidence:** Verified with `npm test` passing 39/39 tests across unit and 6 integration test suites.
- **Related Git Commit:** `e56267c6fe8cb289b0ff6f0166551097f870950b` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b))

---

### Interaction 9. BigInt Comparison on PostgreSQL SUM() Result

- **Context & Requirement:** Verify the double-entry accounting equation by calculating `SUM(credit) - SUM(debit)` from `ledger_entries` and asserting equivalence with `accounts.balance`.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Requirement was to write automated assertion verifying that ledger transaction sums equal account balances.
- **Flaw / Limitation Identified During Human Review:** In `tests/integration/ledger_immutability.test.js`, the test asserted `expect(aliceCalculated).toBe(aliceDbAcc.rows[0].balance)` expecting `9000n`. The test failed with `Expected: 9000n, Received: "9000"`.
- **Root Cause & Architectural Correction:** PostgreSQL's `SUM()` aggregate returns a `NUMERIC` type when summing integers to prevent overflow, which `node-postgres` parses as a string to prevent precision loss. `accounts.balance` is a `BIGINT` column parsed into JavaScript native `BigInt` (OID 20 parser). Comparing string to BigInt via strict equality failed. Wrapped the returned value with `BigInt(aliceCalculated)` and `BigInt(bobCalculated)` to compare numeric values safely without precision loss.
- **Implementation Details:**
  - Files modified: `backend/tests/integration/ledger_immutability.test.js`.
- **Technical Verification & Test Evidence:** Test re-run succeeded; assertions confirmed calculated sum matches stored `BigInt` balance exactly.
- **Related Git Commit:** `e56267c6fe8cb289b0ff6f0166551097f870950b` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b))

---

## Session 4: 2026-11-06 — Fix Backend Startup Logs, API Routing, and 404 Errors

### Interaction 10. API Base URL Duplication (`/api/v1/api/v1/auth/register`)

- **Context & Requirement:** Ensure Swagger UI and client API callers successfully reach backend endpoints without path concatenation errors.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Debugging why Swagger UI requests returned 404 errors during manual API testing.
- **Flaw / Limitation Identified During Human Review:** Requests sent from Swagger UI produced `404 Endpoint not found: [POST] /api/v1/api/v1/auth/register`. In `swagger.js`, OpenAPI `servers` had `url: '/api/v1'`, while route path keys were also declared starting with `/api/v1` (e.g., `'/api/v1/auth/register'`). When Swagger UI dispatched requests, it joined the server root and route path, yielding `/api/v1/api/v1/...`.
- **Human Review, Decision & Architectural Correction:** Established a strict, unified convention:
  1. Base URL: `http://localhost:5000/api/v1` (for Axios and Swagger v1 server definition).
  2. Service / Swagger paths: Strictly relative to base URL (e.g. `/auth/register`, `/accounts`, `/transactions`).
  3. Express mounting: Versioned router mounted under `/api/v1` exactly once in `src/app.js`.
- **Implementation Details:**
  - Files modified: `backend/src/config/swagger.js`, `backend/src/app.js`.
- **Technical Verification & Test Evidence:** Verified via automated route verification script asserting `POST /api/v1/auth/register` returns 201/400 while `POST /api/v1/api/v1/auth/register` returns 404.
- **Related Git Commit:** `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))

---

### Interaction 11. Health-Check Endpoint Inconsistency (`/api/v1/health` vs `/health`)

- **Context & Requirement:** Expose infrastructure health monitoring for container orchestrators and load balancers.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Resolving discrepancy between startup log announcement and Swagger UI health check paths.
- **Flaw / Limitation Identified During Human Review:** Frontend health polling attempted `GET /api/v1/health` resulting in 404, while startup logs announced `GET http://localhost:5000/health`. In Swagger, `/health` was grouped under `/api/v1`.
- **Human Review, Decision & Architectural Correction:** Configured an explicit path-level server override in OpenAPI spec: `/health` sets `servers: [{ url: '/', description: 'Root URL' }]`, ensuring Swagger UI calls `http://localhost:5000/health`. Updated documentation to confirm that `/health` is an unversioned infrastructure endpoint.
- **Implementation Details:**
  - Files modified: `backend/src/config/swagger.js`, `backend/src/app.js`.
- **Technical Verification & Test Evidence:** Tested `GET /health` returns 200 with `{ status: 'UP', database: { connected: true } }`, and confirmed `GET /api/v1/health` returns 404 without duplicating routes.
- **Related Git Commit:** `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))

---

### Interaction 12. Missing OpenAPI Route Definitions

- **Context & Requirement:** Provide interactive Swagger documentation for all administrative and statement endpoints.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Audit endpoints registered in Express routers against definitions present in `swagger.js`.
- **Flaw / Limitation Identified During Human Review:** Several existing endpoints (`/statements/:accountId`, `/admin/users`, `/admin/accounts`, `/admin/users/:userId/status`, `/admin/accounts/:accountId/status`) were completely missing from `swagger.js`, making them undocumented and untestable in Swagger UI.
- **Human Review, Decision & Architectural Correction:** Added complete OpenAPI 3.0 documentation with schemas, path parameters, and query parameters for all registered Express endpoints.
- **Implementation Details:**
  - Files modified: `backend/src/config/swagger.js`.
- **Technical Verification & Test Evidence:** Complete 25-endpoint route verification table passed with 100% success rate in `tests/integration/api_verification_audit.test.js`.
- **Related Git Commit:** `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))

---

### Interaction 13. PostgreSQL SSL Mode Deprecation Warning

- **Context & Requirement:** Establish secure TLS/SSL connectivity with Neon Cloud PostgreSQL.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Eliminate runtime driver deprecation warnings during backend startup.
- **Flaw / Limitation Identified During Human Review:** On connecting to Neon PostgreSQL, the driver logged `WARNING: sslmode=require is treated as verify-full`. `pg-connection-string` deprecated `sslmode=require` as an ambiguous alias in favor of explicit `verify-full`.
- **Human Review, Decision & Architectural Correction:** Updated `DATABASE_URL`, `DIRECT_URL`, `TEST_DATABASE_URL`, and `TEST_DIRECT_URL` in `.env` and `.env.example` to explicitly use `sslmode=verify-full&channel_binding=require`. Added regex normalization in `src/config/env.js` `sanitizeUrl()` so any `sslmode=require` is automatically upgraded to `sslmode=verify-full` while maintaining strict `rejectUnauthorized: true` certificate validation.
- **Implementation Details:**
  - Files modified: `backend/src/config/env.js`, `backend/.env`, `backend/.env.example`.
- **Technical Verification & Test Evidence:** Database connection tests run with zero deprecation warnings.
- **Related Git Commit:** `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))

---

## Session 5: 2026-11-06 — Implement Account Number-Based Transfers & Core Ledger Modules

### Interaction 14. Dual Identification Support & Backward Compatibility

- **Context & Requirement:** Support human-readable account numbers (`LL-ACC-1001`) in transfer endpoints while preserving backwards compatibility for internal UUIDs.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Mandating that the transfer API transition from exposing internal UUIDs to accepting account numbers.
- **AI Proposal / Initial Suggestion:** Replace `sourceAccountId` and `destinationAccountId` with `sourceAccountNumber` and `destinationAccountNumber` exclusively in validation schemas, dropping UUID parameters.
- **Flaw / Limitation Identified During Human Review:** Completely breaking backward compatibility would fail existing automated tests, external integrations, and legacy clients sending internal UUIDs.
- **Human Review, Decision & Architectural Correction:** Configured Zod `.superRefine` validation in `transaction.validation.js` allowing either pair:
  1. Primary: `sourceAccountNumber` and `destinationAccountNumber`
  2. Legacy: `sourceAccountId` and `destinationAccountId`  
  If neither or partial parameters are provided, a descriptive validation error is returned.
- **Implementation Details:**
  - Files modified: `backend/src/modules/transactions/transaction.validation.js`, `backend/src/modules/transactions/transaction.service.js`.
- **Technical Verification & Test Evidence:** Tested in `tests/integration/account_number_transfer.test.js` asserting successful execution for both account-number and UUID-based requests.
- **Related Git Commit:** `07403060c2b04426384c0e3608f1e32d23e0a770` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))

---

### Interaction 15. Idempotency Request Hash Normalization

- **Context & Requirement:** Compute SHA-256 request hashes to detect idempotency key reuse conflicts across transfer retries.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Integrating account number resolution with the idempotency key hashing pipeline.
- **AI Proposal / Initial Suggestion:** Directly hash whatever payload keys were provided by the caller in the raw incoming JSON.
- **Flaw / Limitation Identified During Human Review:** If a caller retries a transfer using the account number instead of the UUID (or vice versa), the raw payload hash would differ, bypassing the idempotency check and executing the transfer twice.
- **Human Review, Decision & Architectural Correction:** In `transactionService.transfer()`, both account numbers are resolved to their persistent logical IDs first, and the SHA-256 idempotency request hash is computed deterministically across resolved accounts: `{ op: 'TRANSFER', sourceAccountId, destinationAccountId, amountPaise: amountPaise.toString() }`.
- **Implementation Details:**
  - Files modified: `backend/src/modules/transactions/transaction.service.js`.
- **Technical Verification & Test Evidence:** Verified with `tests/integration/account_number_transfer.test.js` (`Duplicate transfer request with same Idempotency-Key returns cached response without duplicate execution`).
- **Related Git Commit:** `07403060c2b04426384c0e3608f1e32d23e0a770` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))

---

### Interaction 16. Zod Error Formatting in Integration Assertions

- **Context & Requirement:** Verify that transfers between the same source and destination account are rejected.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Writing integration tests for same-account transfer validation rejection.
- **Flaw / Limitation Identified During Human Review:** In `tests/integration/account_number_transfer.test.js` Scenario 7, the assertion `expect(res.body.message).toMatch(/Source and destination accounts must be different/i)` failed because `validateRequest` middleware formats top-level `message: "Validation failed"` and puts the custom rule message in `res.body.errors[0].message`.
- **Human Review, Decision & Architectural Correction:** Updated the test assertion to inspect the response errors structure `expect(JSON.stringify(res.body)).toMatch(/Source and destination accounts must be different/i)`.
- **Implementation Details:**
  - Files modified: `backend/tests/integration/account_number_transfer.test.js`.
- **Technical Verification & Test Evidence:** All 20 integration tests passed in `tests/integration/account_number_transfer.test.js`.
- **Related Git Commit:** `07403060c2b04426384c0e3608f1e32d23e0a770` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))

---

### Interaction 17. Human Architectural Correction: Account Number-Based Transfers

- **Context & Requirement:** Banking and fintech users identify accounts using structured account numbers (`LL-ACC-1001`), not internal database primary keys.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — requires manual recovery from chat history.]`  
  *Context:* Human engineering correction instructing the AI to restructure transfer inputs while preserving internal database integrity.
- **AI Proposal / Initial Suggestion:** Expose database primary key UUIDs in public transfer API endpoints (`sourceAccountId`, `destinationAccountId`).
- **Flaw / Limitation Identified During Human Review:** Exposing internal database primary key UUIDs is poor API design and a potential information disclosure risk. Users cannot easily remember or copy 36-character UUIDs.
- **Human Review, Decision & Architectural Correction:** Formulated and enforced a 6-point architectural requirement:
  1. Frontend must present and require account numbers for source and destination account selection.
  2. Transfer API must accept account numbers instead of exposing internal UUIDs.
  3. Backend must resolve both account numbers to their corresponding internal account UUIDs before locking.
  4. All existing database relationships, transaction processing, row-level locking, and ledger entries must continue using internal UUIDs.
  5. Source account ownership must be verified against the authenticated user.
  6. Existing authorization, idempotency, concurrency, double-entry accounting, and append-only ledger protections must remain unchanged.
- **Implementation Details:**
  - Files modified: `backend/src/modules/transactions/transaction.controller.js`, `backend/src/modules/transactions/transaction.service.js`, `backend/src/repositories/account.repository.js`.
- **Technical Verification & Test Evidence:** Completed and verified across all 20 automated integration scenarios in `backend/tests/integration/account_number_transfer.test.js`.
- **Related Git Commit:** `07403060c2b04426384c0e3608f1e32d23e0a770` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))

---

## Session 6: 2026-11-07 — Registration Security & Role Escalation Prevention

### Interaction 18. Public Registration Schema Vulnerability & Role Injection

- **Context & Requirement:** Audit and secure the public registration flow to prevent privilege escalation. A normal user must not be able to register as `ADMIN` or `AUDITOR` by modifying the HTTP request payload. Public registration must always create an `ACCOUNT_HOLDER`.
- **Actual AI Prompt (Verbatim):**
  ```text
  LedgerLine — Registration Security & Role Escalation Prevention
  Act as a senior backend security engineer specializing in authentication, authorization and secure financial applications.
  1. Project context
  Project: LedgerLine — Secure Financial Transaction and Immutable Ledger System.
  Existing technology stack: Node.js, Express.js, JavaScript ES Modules, Express.js REST APIs, Neon PostgreSQL, PostgreSQL pg library with raw SQL (no ORM), JWT authentication, bcrypt password hashing, Zod request validation, Jest and Supertest.
  Existing user roles: ADMIN, ACCOUNT_HOLDER, AUDITOR.
  Important architectural rules:
  - Public registration must always create an ACCOUNT_HOLDER.
  - ADMIN and AUDITOR accounts must never be created through public registration.
  - Role assignment must be controlled exclusively by the backend.
  - Do not trust client-supplied role values.
  - Preserve existing authentication and authorization architecture.
  2. Main objective: Audit and secure the public registration flow to prevent privilege escalation. A normal user must not be able to register as ADMIN or AUDITOR by modifying the HTTP request payload.
  3. Inspect the existing implementation first: Registration route, controller, service, database insertion SQL, Zod validation schema, password hashing, JWT generation, authentication middleware, existing tests. Identify exactly where the role is assigned and whether any client-provided role can reach the database insertion query.
  4. Secure the registration validation schema: Required fields { fullName, email, password }. Public registration must not accept a trusted role from the client. Reject unexpected fields using Zod .strict().
  5. Enforce server-side role assignment: Assign ACCOUNT_HOLDER explicitly inside trusted backend service. Never read role from req.body or pass into SQL INSERT query.
  6. Prevent role escalation: Test normal registration (ACCOUNT_HOLDER) and test role injection (ADMIN, AUDITOR, lowercase, privilege fields like isAdmin).
  ```
- **Flaws Discovered During Security Audit:**
  1. **Schema Vulnerability**: In `backend/src/modules/auth/auth.validation.js`, `registerSchema` explicitly included `role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).default('ACCOUNT_HOLDER').optional()` and omitted `.strict()`. This permitted clients to send `{"role": "ADMIN"}` or `{"role": "AUDITOR"}`, which passed validation successfully.
  2. **Service Parameter Passthrough**: In `backend/src/modules/auth/auth.service.js`, `register({ fullName, email, password, role = 'ACCOUNT_HOLDER' }, context)` unpacked the client-supplied `role` and passed it directly to `userRepository.create()`.
  3. **Controller Passthrough**: In `backend/src/modules/auth/auth.controller.js`, `authController.register` passed `req.body` without field filtering.
  4. **PostgreSQL Insertion**: In `backend/src/repositories/user.repository.js`, the parameterized query `INSERT INTO users (full_name, email, password_hash, role, is_active) VALUES ($1, $2, $3, $4, true)` inserted `$4` directly. Because the PostgreSQL `CHECK (role IN ('ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'))` constraint accepts `ADMIN` and `AUDITOR`, the injected role was committed to the database.
  5. **JWT & Identity Escalation**: The issued JWT and `req.user` in `authenticate` middleware loaded `user.role` from the database row, giving the attacker full administrative access across `authorize('ADMIN')` endpoints.
- **Architectural Corrections (Defense-in-Depth):**
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
- **Implementation Details:**
  - Files modified: `backend/src/modules/auth/auth.validation.js`, `backend/src/modules/auth/auth.controller.js`, `backend/src/modules/auth/auth.service.js`, `backend/src/config/swagger.js`, `backend/tests/integration/auth.test.js`.
- **Technical Verification & Test Evidence:** Executed automated test suite against Neon PostgreSQL test database (`TEST_DATABASE_URL`). All 18 auth tests and 30 API verification tests passed with 100% success rate.
- **Related Git Commit:** `1e54086d7941f5b73752296da57b1faa39426fce` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1e54086d7941f5b73752296da57b1faa39426fce))

---

## Session 7: 2026-11-07 — Concurrency, Idempotency & Authorization Hardening

### Interaction 19. Idempotency Key Scoping & Concurrent Retry Serialization

- **Context & Requirement:** Review idempotency key mechanics across financial endpoints (`POST /api/v1/transactions/*`). Verify behavior for sequential retries, concurrent retries, tampered payloads, and failed attempts.
- **Actual AI Prompt (Verbatim):**
  ```text
  # LedgerLine — Day 2: Concurrency, Idempotency & Authorization Hardening
  Act as a senior backend engineer, PostgreSQL specialist and application security engineer.
  Your task is to complete the remaining Day 2 work for LedgerLine based on the existing implementation.
  [Inspect transaction and idempotency implementation]
  Verify the following behaviour:
  1. One logical client transaction uses one idempotency key.
  2. Retries of that same logical transaction reuse the original key.
  3. Same key + same request payload returns the original completed result.
  4. Same key + changed payload returns a conflict.
  5. A genuinely new logical transaction uses a new key.
  6. Concurrent requests using the same key cannot create duplicate transactions.
  7. Failed transactions do not leave inconsistent idempotency records.
  Inspect how request hashes are generated. Ensure the hash represents the relevant validated transaction payload.
  ```
- **Architectural Findings & Hardening:**
  1. **Key Uniqueness & Scope**: Protected by PostgreSQL unique constraint `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)`. Keys are strictly scoped per authenticated user, preventing cross-user collision.
  2. **Canonical Payload Hash**: A SHA-256 hash is computed across normalized operation parameters (`op`, `sourceAccountId`, `destinationAccountId`, `amountPaise`). Retrying with modified amount or destination triggers `409 Conflict` (`Idempotency key reuse conflict: request payload differs from original request`).
  3. **Concurrent Retry Race Serialization**: When identical requests race in parallel (`Promise.all`), the PostgreSQL unique constraint on `idempotency_keys` allows exactly one thread to insert the pending key reservation and execute the transaction. Racing concurrent requests either receive `409 Conflict` (due to active in-flight lock or unique violation) or await and retrieve the committed replay. Under no circumstance can a duplicate transaction or duplicate ledger entry be created.
  4. **Failed Transaction Rollback**: If balance validation fails, the entire transaction rolls back, releasing the in-flight key so the client can retry cleanly.
- **Implementation Details:**
  - Files modified: `backend/src/modules/transactions/transaction.service.js`, `backend/src/repositories/idempotency.repository.js`, `backend/tests/integration/idempotency.test.js`.
- **Technical Verification & Test Evidence:** Automated tests in `tests/integration/idempotency.test.js` (Test A sequential retry, Test B concurrent retry with `Promise.all`, Test C changed payload conflict, and failed cleanup retry).
- **Related Git Commit:** `bc52c325b051dd57cfbbeddca150e75d4a06fffa` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

### Interaction 20. Balance Race Conditions & `SELECT FOR UPDATE`

- **Context & Requirement:** Investigate balance check atomicity under racing withdrawal requests.
- **Actual AI Prompt (Verbatim):**
  ```text
  Inspect withdrawal and transfer balance handling.
  Verify:
  - Account rows are locked using SELECT ... FOR UPDATE before balance checks.
  - Concurrent withdrawals from the same account cannot overdraft or drop balance below zero.
  - Balance validation occurs strictly within the lock boundary.
  - Add automated concurrency tests executing truly simultaneous requests via Promise.all.
  ```
- **Flaws Evaluated:** Without row-level locks, two concurrent withdrawals (e.g. ₹400 and ₹300 against a ₹500 balance) read `balance >= amount` simultaneously before either updates, causing negative balance overdraft (-₹200).
- **Mitigation Architecture:**
  1. Transaction isolation with `BEGIN ... COMMIT`.
  2. Immediate row-level locking via `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE`.
  3. Balance validation occurs exclusively while the row lock is held.
  4. Engine-level `CHECK (balance >= 0)` constraint as an absolute safety barrier.
- **Implementation Details:**
  - Files modified: `backend/src/repositories/account.repository.js`, `backend/src/modules/transactions/transaction.service.js`, `backend/tests/integration/concurrency.test.js`.
- **Technical Verification & Test Evidence:** `tests/integration/concurrency.test.js` (Test D racing withdrawals: exactly one succeeds, the other fails with 400 Insufficient Funds, final balance is either 10,000 or 20,000 paise, and balance never drops below zero).
- **Related Git Commit:** `bc52c325b051dd57cfbbeddca150e75d4a06fffa` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

### Interaction 21. Multi-Account Deadlock Elimination (Deterministic Lock Ordering)

- **Context & Requirement:** Investigate simultaneous opposite-direction transfers: Account A transfers to Account B while Account B concurrently transfers to Account A.
- **Actual AI Prompt (Verbatim):**
  ```text
  Inspect transfers between accounts for deadlock prevention.
  Verify:
  - Multi-account row locking uses a deterministic global order (e.g. sorting account IDs).
  - Simultaneous opposite transfers (A -> B and B -> A) do not cause deadlock exceptions (40P01).
  - Add automated concurrency tests executing bidirectional transfers in parallel.
  ```
- **Flaws Evaluated:** Arbitrary lock order locks Account A on thread 1 and Account B on thread 2, causing circular wait and PostgreSQL deadlock exception `40P01 (deadlock_detected)`.
- **Mitigation Architecture:** In `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`, the two account UUIDs are sorted lexicographically (`[accountId1, accountId2].sort()`) and queried via `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`. Both transactions acquire locks in identical global order.
- **Implementation Details:**
  - Files modified: `backend/src/repositories/account.repository.js`, `backend/src/modules/transactions/transaction.service.js`, `backend/tests/integration/concurrency.test.js`.
- **Technical Verification & Test Evidence:** `tests/integration/concurrency.test.js` (Test E opposite transfers: zero deadlocks, both transfers commit, double-entry ledger is balanced: 2 debits = 2 credits = 4,000 paise, and money is conserved).
- **Related Git Commit:** `bc52c325b051dd57cfbbeddca150e75d4a06fffa` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

### Interaction 22. Cross-User Account Access (IDOR Prevention) & Auditor Denial

- **Context & Requirement:** Verify authorization boundaries preventing regular users from accessing other accounts, and ensuring auditors cannot move money.
- **Actual AI Prompt (Verbatim):**
  ```text
  Verify account ownership and authorization controls:
  - Account access: Account holders can only view their own accounts, balances, transactions and statements.
  - Cross-user attempts to access another user's account must return 403 Forbidden.
  - Auditor access: AUDITOR role has strictly read-only access to accounts, ledger and audit logs.
  - Any attempt by an AUDITOR to deposit, withdraw, or transfer must return 403 Forbidden.
  - Add automated integration tests for IDOR and auditor permission boundaries.
  ```
- **Mitigation Architecture:**
  1. `authorizeAccountAccess` middleware and `transactionService` verify account ownership against `req.user.id`.
  2. Any cross-user attempt to query balance, view statements, withdraw, or transfer returns `403 Forbidden` with zero database modifications.
  3. Auditor role has strictly read-only access to `/ledger`, `/audit-events`, `/accounts`, and `/statements`. Any attempt to call `/deposit`, `/withdraw`, or `/transfer` returns `403 Forbidden`.
- **Implementation Details:**
  - Files modified: `backend/src/middlewares/auth.middleware.js`, `backend/src/modules/transactions/transaction.service.js`, `backend/tests/integration/authorization.test.js`.
- **Technical Verification & Test Evidence:** `tests/integration/authorization.test.js` (Test F cross-user IDOR access denial, and Test G auditor money-movement denial with read-only inspection verified across 12 automated tests).
- **Related Git Commit:** `bc52c325b051dd57cfbbeddca150e75d4a06fffa` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

### Interaction 23. Discovered Errors and Runtime Corrections

- **Context & Requirement:** Resolve test harness collisions and runtime errors encountered during Day 2 hardening test development.
- **Actual AI Prompt (Verbatim):** `[Original verbatim prompt unavailable — interactive terminal error debugging.]`  
  *Context:* Runtime debugging of Jest integration test assertion errors against live PostgreSQL test database.
- **Discovered Errors and Runtime Corrections:**
  1. **Seed Fixture Collision**:
     - *Error*: Initial test assertions checking `transactions WHERE initiated_by = $1` received count `2` instead of `1`.
     - *Root Cause*: `seedTestFixtures()` seeds an initial deposit transaction (`INIT-ALICE`).
     - *Fix*: Filtered transaction assertions with `transaction_type = 'TRANSFER'` or checked explicit transaction IDs.
  2. **Query Parameter Placeholder Mismatch**:
     - *Error*: In `concurrency.test.js`, an account balance update query passed 1 parameter with `$2` placeholder, triggering `error: could not determine data type of parameter $1`.
     - *Fix*: Corrected the placeholder to `$1`.
  3. **Ledger Invariant Verification**:
     - *Error*: In `authorization.test.js`, total ledger entries assertion failed because both Alice and Bob have initial seeded credit entries.
     - *Fix*: Verified that 0 `DEBIT` entries and 0 `TRANSFER` transactions were created during unauthorized attempts, proving complete database isolation.
- **Implementation Details:**
  - Files modified: `backend/tests/integration/concurrency.test.js`, `backend/tests/integration/authorization.test.js`.
- **Technical Verification & Test Evidence:** Full test suite execution: 106 automated tests passing across 9 test suites with zero failures.
- **Related Git Commit:** `bc52c325b051dd57cfbbeddca150e75d4a06fffa` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))
