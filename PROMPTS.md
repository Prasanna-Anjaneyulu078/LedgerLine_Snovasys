# LedgerLine – AI Engineering Log (PROMPTS.md)

This document records how AI tools were used during LedgerLine development, including the original prompts, AI suggestions, human review, implementation decisions, and verification.

---

### Session 1: Project Foundation and Architecture

**Date:** 2026-11-05

#### 1. Objective
Design and implement the complete initial backend architecture for LedgerLine: establish the database access layer, design database schema and migrations, implement integer paise currency handling with BigInt, formulate deterministic locking for two-account transfers to eliminate deadlocks, and implement database-backed idempotency.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`ee8915ba-8611-43c5-8b6d-0d6a0a0a3fbb`). Two sequential prompts were submitted:*

**Prompt 1 (Initial Architecture Request — Step 0):**
```text
# Task: Build LedgerLine — Backend Architecture & Foundation

Act as a Senior Backend Architect and Node.js Engineer. Design and implement the complete initial backend architecture for **LedgerLine**, a financial transaction management system developed for the Snovasys Fresher Hiring Challenge 2026.

## 1. Project Objective

Build a secure, reliable financial backend that supports:
- User authentication and authorization.
- Account management.
- Deposits and withdrawals.
- Transfers between accounts.
- Double-entry bookkeeping.
- Money conservation.
- Idempotent transaction requests.
- Concurrency-safe financial operations.
- Immutable financial ledger records.
- Account-level permissions.
- Auditable transaction history.

The most important requirement is financial correctness. Never prioritize implementation speed over transaction integrity.

## 2. Technology Stack
Use the following technologies:
- Runtime: Node.js (LTS)
- Language: JavaScript (ES Modules)
- Framework: Express.js
- Database: PostgreSQL
- ORM: Prisma
- Authentication: JWT
- Password hashing: bcrypt
- Validation: Zod
- Testing: Jest + Supertest
- API documentation: Swagger / OpenAPI
- Environment configuration: dotenv
- Logging: Winston or Pino
```

**Prompt 2 (Architectural Correction Mandating Raw SQL & Deterministic Locking — Step 128):**
```text
# Master Prompt: Build LedgerLine Backend Architecture from Scratch

Act as a senior backend engineer and software architect with strong experience in financial systems, PostgreSQL, transaction processing, security, and distributed systems.

Build the complete production-quality backend architecture for LedgerLine, a secure money movement and ledger management system for the Snovasys Fresher Hiring Challenge 2026.

Do not create a basic CRUD application. This is a financial transaction system where correctness, data integrity, concurrency safety, idempotency, authorization, and auditability are the highest priorities.

Build the backend from scratch with a clean, modular, maintainable architecture.

## 1. Mandatory Technology Stack
Use only the following technologies:
- Runtime: Node.js
- Framework: Express.js
- Language: JavaScript (ES Modules)
- Database: PostgreSQL using Neon
- Database driver: pg (node-postgres)
- Query approach: Raw SQL
- Authentication: JWT
- Password hashing: bcrypt
- Validation: Zod
- Testing: Jest + Supertest
- API documentation: Swagger / OpenAPI
- Environment configuration: dotenv
- Logging: Pino or another structured logger

### Strict restrictions
- Do NOT use Prisma ORM.
- Do NOT use Sequelize, TypeORM, Drizzle, Knex, or any other ORM/query builder.
- Do NOT use Docker, Docker Compose, containers, or Docker-related scripts.
- Do NOT use TypeScript.
- Use parameterized SQL queries with PostgreSQL's pg package.
- Do NOT use SQLite or an in-memory database as a replacement for PostgreSQL.
- Do NOT implement financial operations using floating-point arithmetic.
- Do NOT use mock implementations for core financial operations.

All database operations must use PostgreSQL through pg.
```

#### 3. AI Suggestion
- Suggested using Prisma ORM to generate database models and execute migrations.
- In transfer operations, suggested locking the source account row first, verifying balance, and subsequently locking the destination account row.
- Suggested passing native JavaScript `BigInt` returned from database queries directly to Express `res.json()`.
- Suggested storing idempotency keys in Redis or an in-memory cache with an expiration TTL.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - An ORM abstracts away explicit PostgreSQL transaction isolation, hides query generation, makes `SELECT ... FOR UPDATE` row locks difficult to enforce deterministically, and historically struggles with native 64-bit integer (`BIGINT`) minor currency units and advisory locks during migrations.
  - Locking Account A then Account B causes circular wait deadlocks (`40P01`) when Account A and Account B simultaneously transfer to each other.
  - Express `res.json()` relies on `JSON.stringify()`, which throws `TypeError: Do not know how to serialize a BigInt`.
  - Caches can drop keys during network partitions, and storing keys outside the primary PostgreSQL transaction boundary creates a split-brain vulnerability where money moves but the idempotency key fails to save.
- **What I identified and decided:**
  - Rejected ORMs completely in favor of native `pg` (`node-postgres`) using raw, parameterized SQL migrations wrapped in PostgreSQL transactional advisory locks (`pg_advisory_xact_lock`).
  - Mandated deterministic global lock ordering by sorting account UUIDs lexicographically (`[id1, id2].sort()`) before querying `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`.
  - Configured `pg.types.setTypeParser(20, ...)` to parse `BIGINT` columns into JavaScript `BigInt`, and patched `BigInt.prototype.toJSON = function() { return this.toString(); }` globally.
  - Enforced database-backed idempotency inside the primary PostgreSQL transaction with `UNIQUE (user_id, idempotency_key)` on the `idempotency_keys` table.

#### 5. Final Implementation
- `backend/src/config/database.js`: Configured `node-postgres` pool, BigInt type parsers, and JSON serialization.
- `backend/src/database/migrate.js`: Custom transactional migration runner acquiring `pg_advisory_xact_lock`.
- `backend/src/database/migrations/001_create_users.sql` to `006_create_audit_events.sql`: Raw SQL DDL with primary/foreign keys, `CHECK (balance >= 0)`, and audit tables.
- `backend/src/repositories/account.repository.js`: Implemented `findTwoForUpdate(accountId1, accountId2, client)` sorting account UUIDs.
- `backend/src/repositories/idempotency.repository.js`: Database-backed idempotency lifecycle.

#### 6. Verification
- **Automated Tests:**
  - `tests/unit/money.test.js`: 8/8 tests passing (integer paise conversions, rupee formatting, zero and positive balance validation).
  - `tests/integration/concurrency.test.js`: Deterministic locking verified under parallel bidirectional transfers (`Promise.all`).
  - `tests/integration/idempotency.test.js`: Atomic key persistence and retry handling verified.
- **Database Verification:** `npm run migrate` successfully executed all 6 migrations with PostgreSQL advisory locks.

#### 7. Related Commit
- `3e747ccba96e16f14b2f218aa7145392787b1b54` – `chore: initialize LedgerLine project` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3e747ccba96e16f14b2f218aa7145392787b1b54))
- `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a0d9f05fc2722669f1f09e00819732aaa035763e))

---

### Session 2: Backend Integration and API Design

**Date:** 2026-11-05

#### 1. Objective
Audit pre-frontend integration architecture against official challenge requirements, establish statement reporting for refused/failed transactions while preserving double-entry ledger invariants, and formulate database-level append-only ledger protections.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`19f4fe7f-a533-40af-b00b-2b774a9041f4`, Step 0):*

```text
# LedgerLine — Official Challenge Compliance Audit Before Frontend Development

I am participating in the Snovasys Fresher Hiring Challenge 2026.

My backend is implemented using:
- Node.js
- Express.js
- JavaScript ES Modules
- Neon PostgreSQL
- Raw SQL with pg
- JWT and bcrypt
- Jest and Supertest

The latest reported test result is 31/31 passing.

I now need to prepare the application for the frontend and final evaluation.

## Strict rules
1. Inspect the existing repository before making changes.
2. Do not rebuild working backend functionality.
3. Do not claim features work without evidence.
4. Do not weaken financial integrity, authorization, concurrency or idempotency.
5. Do not fabricate metrics, commits or test results.
6. Keep the GitHub repository private during development in accordance with challenge instructions.
7. Use only genuine AI interaction records in PROMPTS.md.

## Task 1 — Verify all ten official requirements
Create a checklist covering:
1. Authentication and three roles.
2. Account creation, balances and statements.
3. Deposits, withdrawals and transfers.
4. Money conservation.
5. No unauthorized negative balances.
6. Idempotency.
7. Concurrency safety.
8. Statements including refused attempts and initiators.
9. Account-level authorization.
10. Automated integrity and authorization tests.

For each requirement report:
- Actual implementation.
- Relevant file paths and API endpoints.
- Existing test coverage.
- Missing functionality.
- Verification result.

Also verify append-only ledger protection.

## Task 2 — Backend readiness
Check:
- Secure Neon SSL configuration.
- Development/test database separation.
- Connection pool lifecycle.
- Row-level locking.
- Deterministic lock ordering.
- Atomic database transactions.
- Idempotency handling during concurrent retries.
- Audit trail protection.
- Error handling and input validation.

Do not change anything unless a real problem is found.

## Task 3 — Frontend integration planning
Inspect the actual backend API routes and create `FRONTEND_INTEGRATION_PLAN.md`.
```

#### 3. AI Suggestion
- Suggested logging failed and refused transaction attempts (e.g. insufficient funds, authorization failures) directly into the `ledger_entries` table with a status flag (`status = 'REFUSED'`).
- Suggested relying exclusively on application repository encapsulation (omitting `UPDATE`/`DELETE` methods from `LedgerRepository`) to guarantee append-only ledger immutability.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - Double-entry accounting principles dictate that the financial ledger must strictly reflect executed, committed balance movements. Polluting the immutable ledger with rejected attempts breaks accounting balance calculations and historical reconciliation (`SUM(credit) - SUM(debit) == balance`).
  - Application-level encapsulation is insufficient for financial compliance; it provides zero protection against direct SQL execution, compromised database credentials, accidental migration scripts, or administrative error.
- **What I identified and decided:**
  - Separated financial accounting from security auditing: committed postings are written to `ledger_entries`, while refused attempts are recorded in `audit_events` (`TRANSACTION_WITHDRAW_REFUSED`, `TRANSACTION_TRANSFER_REFUSED`) with exact refusal reasons, attempted amounts, actor IDs, and IP addresses.
  - In `/api/v1/statements/:accountId`, committed postings are retrieved from `ledger_entries` and refused attempts are queried dynamically from `audit_events`.
  - Mandated database-level immutability enforcement combining a PostgreSQL trigger and runtime role privilege revocation.

#### 5. Final Implementation
- `CHALLENGE_CHECKLIST.md`: Formalized compliance requirements for database-level immutability and statement separation.
- `FRONTEND_INTEGRATION_PLAN.md`: Documented API contracts for statements, accounts, and audit events.
- `backend/src/database/migrations/006_create_audit_events.sql`: Audit event schema tracking refused actions, actor IDs, and IP addresses.
- `backend/src/modules/statements/statement.service.js`: Dedicated statement aggregation pulling committed records from `ledger_entries` and refused events from `audit_events`.

#### 6. Verification
- **Automated Tests:** Verified in `tests/integration/transactions.test.js` and `tests/integration/authorization.test.js` that failed attempts generate `audit_events` records without creating orphaned `ledger_entries`.
- **Database Verification:** Verified schema constraints in PostgreSQL; confirmed `ledger_entries` contains only committed financial movements.

#### 7. Related Commit
- `036328e13415335c05bf5bc48f314e3200158159` – `docs: add challenge compliance checklist, frontend integration plan, and AI prompt logs` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/036328e13415335c05bf5bc48f314e3200158159))

---

### Session 3: Database Security and Append-Only Ledger

**Date:** 2026-11-06

#### 1. Objective
Implement database-level immutability for `ledger_entries`, configure a restricted runtime PostgreSQL role with least-privilege permissions, isolate test harness truncation cleanup, and fix precision bugs in double-entry verification.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`52227de5-46ee-4315-929c-2477e6ef7bc1`, Step 0):*

```text
# LedgerLine — Implement Database-Level Append-Only Ledger Protection

Continue working on my existing LedgerLine backend. This is a security-hardening task, not a project rebuild.

## Objective
Implement PostgreSQL-level protection to ensure that ledger entries cannot be modified or deleted through the application's runtime database credentials.

**Technology constraints:**
- Node.js with JavaScript ES Modules
- Neon PostgreSQL
- Raw SQL using pg (node-postgres)
- Existing migration runner
- No Prisma ORM
- No Docker
- No TypeScript

## Phase 1: Inspect the existing architecture
Before modifying anything, inspect:
1. 003_create_ledger_entries.sql
2. All existing database migrations
3. ledger.repository.js
4. database.js and connection pool configuration
5. migrate.js
6. .env.example and environment variable handling
7. Existing test database configuration and integration test helpers

Identify:
- Which PostgreSQL role the application currently uses.
- Which role executes migrations.
- How the Neon pooled and direct connections are configured.
- Whether the application currently has UPDATE or DELETE privileges on ledger_entries.
- Whether the existing migration runner supports additional migrations safely.

Do not assume that the runtime and migration credentials are separate. Verify the actual configuration.

## Phase 2: Create the immutability migration
Create a new migration, using the next available migration number.

Implement a PostgreSQL trigger function similar to:
- Function: prevent_ledger_modification()
- Trigger: BEFORE UPDATE OR DELETE ON ledger_entries
- Behavior: Raise an exception whenever an UPDATE or DELETE is attempted.

Requirements:
1. Normal INSERT operations must continue working.
2. SELECT operations must continue working.
3. UPDATE operations must fail.
4. DELETE operations must fail.
5. The trigger must cover every row in ledger_entries.
6. The migration must be compatible with the existing migration runner.
7. Use clear exception messages and appropriate SQLSTATE values.
8. Do not modify existing historical ledger data.

## Phase 3: Restrict application database permissions
Implement defense-in-depth using PostgreSQL privileges.
1. Identify or create a dedicated restricted application runtime role.
2. Ensure the runtime role has only the permissions required by the application.
3. Allow the runtime role to SELECT and INSERT ledger entries.
4. Explicitly revoke UPDATE and DELETE permissions on ledger_entries from the runtime role.
```

#### 3. AI Suggestion
- Suggested relying either on a PostgreSQL trigger OR on role-level SQL privilege revocation alone.
- Suggested running test cleanup (`cleanDatabase()`) under the same application database role.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - A trigger alone allows runtime connections to hold table modification privileges; if the trigger is disabled or bypassed, rows become vulnerable. Conversely, role privileges alone leave the table unprotected when queries run under table-owner or admin connections.
  - Executing tests under `ledgerline_runtime` caused `cleanDatabase()` to crash on `TRUNCATE TABLE ... ledger_entries CASCADE` because the restricted role has no `TRUNCATE` privilege.
  - In `tests/integration/ledger_immutability.test.js`, `expect(aliceCalculated).toBe(aliceDbAcc.rows[0].balance)` failed with `Expected: 9000n, Received: "9000"`. PostgreSQL's `SUM()` aggregate returns a `NUMERIC` string in `node-postgres`, whereas `balance` is a native `BigInt`.
- **What I identified and decided:**
  - Implemented dual-layer Defense-in-Depth: trigger `trg_prevent_ledger_modification` (SQLSTATE `23000`) AND restricted role `ledgerline_runtime` with `REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries` (SQLSTATE `42501`).
  - Architected dual connection pools: `adminPool` via `TEST_DIRECT_URL` (database owner) for cleanup/migrations, and `testPool` via `TEST_DATABASE_URL` (`ledgerline_runtime`) for application code.
  - Wrapped `SUM()` string results in `BigInt()` before comparison.

#### 5. Final Implementation
- `backend/src/database/migrations/007_prevent_ledger_modification_trigger.sql`: Trigger function `prevent_ledger_modification()` raising SQLSTATE `23000` `BEFORE UPDATE OR DELETE ON ledger_entries`.
- `backend/src/database/setup-runtime-role.js`: Automated script provisioning `ledgerline_runtime` role with least-privilege permissions.
- `backend/tests/helpers/testDb.js`: Dual connection pool implementation (`adminPool` vs `testPool`).
- `backend/tests/integration/ledger_immutability.test.js`: Suite asserting independent failures for trigger violation, permission denial, and double-entry mathematical balance.

#### 6. Verification
- **Automated Tests:** `tests/integration/ledger_immutability.test.js` passed 8/8 tests. Full test suite: 39/39 tests passing across unit and 6 integration test suites.
- **Database Verification:** Verified in PostgreSQL that `ledgerline_runtime` role has `can_select: true`, `can_insert: true`, `can_update: false`, `can_delete: false`, `can_truncate: false`, and trigger is registered `BEFORE UPDATE OR DELETE`.

#### 7. Related Commit
- `a5502e115a06298a620e8e2ccf53fed012a5eb8b` – `security: enforce database-level ledger immutability` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/a5502e115a06298a620e8e2ccf53fed012a5eb8b))
- `e56267c6fe8cb289b0ff6f0166551097f870950b` – `feat(security): protect ledger from modifications` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/e56267c6fe8cb289b0ff6f0166551097f870950b))
- `ac7c8340bd2b61de446a61a8017ea85de8a7beb0` – `docs(prompts): update AI interaction log` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/ac7c8340bd2b61de446a61a8017ea85de8a7beb0))

---

### Session 4: Backend Debugging and API Routing

**Date:** 2026-11-06

#### 1. Objective
Resolve API routing 404 errors, fix duplicate `/api/v1/api/v1` URL prefixes in Swagger UI, resolve root `/health` vs `/api/v1/health` inconsistencies, complete missing OpenAPI endpoint definitions, and eliminate PostgreSQL SSL mode deprecation warnings.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`52227de5-46ee-4315-929c-2477e6ef7bc1`, Step 248):*

```text
# LedgerLine — Fix Backend Startup Logs, API Routing, and 404 Errors

Act as a senior Node.js backend engineer. Inspect the existing LedgerLine project and fix the backend server logging, health-check routing, and API endpoint URL construction.

**Important:** Do not rebuild the application or unnecessarily change the existing architecture. First inspect the actual code and identify the root causes.

## 1. Fix API base URL duplication
Current incorrect request:
POST /api/v1/api/v1/auth/register
Expected request:
POST /api/v1/auth/register

Inspect:
- Axios instance configuration.
- baseURL environment variables.
- API service files.
- Authentication service calls.
- React frontend environment configuration.
- Express route mounting.

Establish one consistent convention:
- Axios base URL: http://localhost:5000/api/v1
- API service paths: /auth/register, /auth/login, /auth/me
- Express mounts versioned routes under /api/v1 exactly once.

Do not append /api/v1 in both the base URL and individual API service paths.

## 2. Fix health-check endpoint inconsistency
Current working endpoint shown by startup logs:
GET http://localhost:5000/health
Frontend or browser requests currently use:
GET http://localhost:5000/api/v1/health

Inspect the actual health route and choose one consistent documented endpoint.
Prefer:
- GET /health for server and database health.
- Keep it outside the versioned business API routes.

Update the frontend health-check configuration and Swagger documentation accordingly. Do not add duplicate routes unnecessarily.

## 3. Fix all 404 endpoint errors
Inspect the Express application and verify:
- Route registration.
- API version prefix.
- Authentication route mounting.
- Account routes.
- Transaction routes.
- Ledger routes.
- Admin routes.
- Audit routes.
- Health route.
- Swagger route.

Compare every documented endpoint against its actual Express route. Create a route verification table in the report.
```

#### 3. AI Suggestion
- Suggested altering Express route definitions to mount routes without `/api/v1` prefixes.
- Suggested duplicating `/health` route definition inside the versioned router.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - `swagger.js` configured `servers: [{ url: '/api/v1' }]`, while route path keys also declared `/api/v1/...` (e.g. `'/api/v1/auth/register'`). When Swagger UI dispatched requests, it joined the server root and route path, yielding `/api/v1/api/v1/...`.
  - Duplicating route handlers violates single-source-of-truth routing principles.
  - Several routes were completely omitted from `swagger.js`, making them undocumented in Swagger UI.
  - Driver logged `WARNING: sslmode=require is treated as verify-full`.
- **What I identified and decided:**
  - Base URL is `http://localhost:5000/api/v1`, Swagger route keys are strictly relative to base URL (e.g. `/auth/register`), and Express mounts the versioned router under `/api/v1` exactly once in `src/app.js`.
  - Kept `/health` mounted at root (`app.get('/health')`) as an unversioned infrastructure endpoint, and added an explicit path-level server override in OpenAPI spec: `servers: [{ url: '/', description: 'Root URL' }]`.
  - Added complete OpenAPI 3.0 documentation for missing routes: `/statements/:accountId`, `/admin/users`, `/admin/accounts`, `/admin/users/:userId/status`, `/admin/accounts/:accountId/status`.
  - Upgraded SSL strings to `sslmode=verify-full&channel_binding=require` with `rejectUnauthorized: true`.

#### 5. Final Implementation
- `backend/src/config/swagger.js`: Corrected path keys, added server overrides for root health check, and documented all 25 registered endpoints.
- `backend/src/config/env.js`: URL sanitizer upgrading `sslmode=require` to `sslmode=verify-full`.
- `backend/.env` & `backend/.env.example`: Explicit `sslmode=verify-full&channel_binding=require`.
- `backend/src/server.js`: Formatted startup console table displaying available endpoints and test credentials.

#### 6. Verification
- **Automated Tests:** `tests/integration/api_verification_audit.test.js`: Verified all 25 Express endpoints return valid HTTP responses (200, 201, 400, 401, or 403) and 0 endpoints return 404.
- **Manual API Testing:** Verified `GET /health` returns 200 `{ status: 'UP', database: { connected: true } }` while `GET /api/v1/health` returns 404.

#### 7. Related Commit
- `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` – `fix(backend): resolve API routing and startup issues` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/01dca5aec13d757100e1de0544d3ce9e0c55c2d2))
- `3bcaf3f6f102cf85119de028040097c40daa08b8` – `feat: updated to display the default user credentials at runtime.` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/3bcaf3f6f102cf85119de028040097c40daa08b8))

---

### Session 5: Account Number-Based Transactions

**Date:** 2026-11-06

#### 1. Objective
Transition the public money transfer API from internal database UUIDs to human-readable account numbers (`LL-ACC-1001`), preserve backward compatibility for UUIDs, normalize idempotency request hashing across both formats, and fix Zod validation assertion formatting in integration tests.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`52227de5-46ee-4315-929c-2477e6ef7bc1`). Two sequential prompts were submitted:*

**Prompt 1 (Account Number-Based Transfers Feature Request — Step 641):**
```text
# LedgerLine — Implement Account Number-Based Transfers (Source & Destination)

You are a senior Node.js backend engineer and React.js frontend engineer working on my existing LedgerLine financial transaction and immutable ledger system.

## Objective
Modify the existing transfer functionality so users can enter source and destination account numbers instead of internal database UUIDs.

Currently, the backend transfer functionality uses account IDs. I want to improve the user experience by allowing users to identify both accounts using their account numbers.

Implement this feature across the existing backend, frontend, validation, tests, API documentation, and project documentation.

**Important:** This is an enhancement to the existing project. Do not rebuild the application or replace its architecture.

## 1. Inspect the Existing Project First
Before modifying anything:
1. Inspect the complete backend and frontend folder structures.
2. Identify the existing transfer API route, controller, service, repository, validation schema, and database queries.
3. Inspect the current account table schema and identify the actual account-number column.
4. Inspect the existing authentication and account ownership authorization logic.
5. Inspect the current transaction and ledger implementation.
6. Review existing idempotency, concurrency handling, database transactions, and append-only ledger protection.
7. Inspect Swagger documentation and existing transfer tests.
8. Identify the frontend transfer form, transaction service, account service, and relevant dashboard pages.

## 2. Backend API Changes
Modify the existing transfer endpoint rather than creating an unnecessary duplicate endpoint: POST /api/v1/transactions/transfer

Accept account numbers for both source and destination:
{
  "sourceAccountNumber": "LL-ACC-1001",
  "destinationAccountNumber": "LL-ACC-2001",
  "amount": "1000.00",
  "description": "Account number based transfer"
}

Backend account resolution:
1. Find the source account using sourceAccountNumber.
2. Find the destination account using destinationAccountNumber.
3. Resolve both account numbers to their internal database UUIDs.
4. Continue all existing transaction processing using internal UUIDs.
5. Never use account numbers as database foreign keys if the existing schema uses UUIDs.
```

**Prompt 2 (Human Architectural Correction Recorded in PROMPTS.md — Step 890):**
```text
Add this "## Human Correction: Account Number-Based Transfers

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

**Implementation status:** Completed and verified." to PROMPTS.md file
```

#### 3. AI Suggestion
- Suggested replacing `sourceAccountId` and `destinationAccountId` with `sourceAccountNumber` and `destinationAccountNumber` exclusively in validation schemas, dropping UUID parameters entirely.
- Suggested hashing raw request JSON payloads directly for idempotency verification.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - Requiring users to enter 36-character internal database UUIDs is poor banking UX and exposes internal primary keys.
  - Abruptly dropping UUIDs breaks backward compatibility with existing automated integration tests and administrative clients.
  - Directly hashing raw payload keys causes a cache bypass if a client retries using an account number instead of a UUID (or vice versa), risking double execution.
  - In `account_number_transfer.test.js`, `expect(res.body.message).toMatch(...)` failed because `validateRequest` puts top-level `message: "Validation failed"` and nests custom rule messages in `res.body.errors[0].message`.
- **What I identified and decided:**
  - Mandated that the public API accept human-readable account numbers (`LL-ACC-1001`), while resolving them internally to persistent UUIDs before locking or querying.
  - Configured Zod `.superRefine` accepting either pair (`sourceAccountNumber`/`destinationAccountNumber` OR `sourceAccountId`/`destinationAccountId`).
  - In `transactionService.transfer()`, account numbers are resolved to UUIDs first, and the SHA-256 hash is computed deterministically across resolved UUIDs.
  - Updated test assertions to check `JSON.stringify(res.body)`.

#### 5. Final Implementation
- `backend/src/modules/transactions/transaction.validation.js`: `.superRefine` dual-pair schema validation.
- `backend/src/modules/transactions/transaction.service.js`: Resolves account numbers to UUIDs before locking, computes canonical hash across resolved IDs, and enforces source account ownership.
- `backend/src/repositories/account.repository.js`: Added `findByIdOrAccountNumber()` and `findByAccountNumber()`.
- `backend/src/config/swagger.js`: Updated transfer schema documentation to reflect primary account number fields and legacy UUID support.

#### 6. Verification
- **Automated Tests:** `tests/integration/account_number_transfer.test.js`: All 20 scenarios passed (account-number transfers, UUID transfers, insufficient funds, same-account rejection, non-existent account, inactive account, ownership verification, and cached idempotency replays).
- **Manual API Testing:** Verified transfer requests in Swagger UI using both account numbers and UUIDs.

#### 7. Related Commit
- `07403060c2b04426384c0e3608f1e32d23e0a770` – `feat: implement account number-based transfers with backward compatibility and swagger docs(use account numbers instead of UUIDs for source and destination accounts)` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/07403060c2b04426384c0e3608f1e32d23e0a770))
- `1437e9d509179c58294cbf227d8ab8801abb068c` – `feat: add swagger api documentation configuration` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1437e9d509179c58294cbf227d8ab8801abb068c))
- `b5dc36bd0da945c3d9bf5be7467092c342316ca7` – `feat: add core financial ledger modules, validation, and API documentation` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/b5dc36bd0da945c3d9bf5be7467092c342316ca7))
- `27710507e2c490adc07ee59bca81ad0d7ddcb203` – `feat: implement account service and integration test suites with jest` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/27710507e2c490adc07ee59bca81ad0d7ddcb203))

---

### Session 6: Registration Security and Role Authorization

**Date:** 2026-11-07

#### 1. Objective
Audit and secure the public registration flow to prevent privilege escalation. Ensure that a normal user cannot register as `ADMIN` or `AUDITOR` by injecting fields into the HTTP request payload, enforce server-side role assignment, and add automated security tests.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`b2ff31ea-2a1a-45fb-9078-f1ac059d59b5`, Step 0):*

```text
LedgerLine — Registration Security & Role Escalation Prevention
Act as a senior backend security engineer specializing in authentication, authorization and secure financial applications.

1. Project context
Project: LedgerLine — Secure Financial Transaction and Immutable Ledger System.
Existing technology stack:
Node.js
Express.js
JavaScript ES Modules
Express.js REST APIs
Neon PostgreSQL
PostgreSQL pg library with raw SQL (no ORM)
JWT authentication
bcrypt password hashing
Zod request validation
Jest and Supertest
Existing user roles:
ADMIN
ACCOUNT_HOLDER
AUDITOR
Important architectural rules:
Public registration must always create an ACCOUNT_HOLDER.
ADMIN and AUDITOR accounts must never be created through public registration.
Role assignment must be controlled exclusively by the backend.
Do not trust client-supplied role values.
Preserve existing authentication and authorization architecture.

2. Main objective
Audit and secure the public registration flow to prevent privilege escalation.
A normal user must not be able to register as ADMIN or AUDITOR by modifying the HTTP request payload.

3. Inspect the existing implementation first
Before modifying anything, inspect:
Registration route.
Registration controller.
Registration service.
User model/database insertion SQL.
Registration Zod validation schema.
Password hashing implementation.
JWT generation logic.
Authentication middleware.
Existing user role constants or enums.
Existing registration tests.
Identify exactly where the role is assigned and whether any client-provided role can reach the database insertion query.
Do not rebuild the registration module.
First report:
Current registration flow.
Current role assignment mechanism.
Potential privilege escalation vulnerabilities.
Required changes.

4. Secure the registration validation schema
Inspect the existing registration schema.
Required public registration fields:
{
"fullName": "Test User",
"email": "testuser@example.com",
"password": "Test@123456"
}
Requirements:
fullName must be required.
email must be validated as a valid email.
password must follow the existing password security requirements.
Public registration must not accept a trusted role from the client.
Reject unexpected fields using Zod .strict() if compatible with the existing validation design.
If the existing design strips unknown fields, ensure that this behaviour cannot influence role assignment.
Do not unnecessarily change existing validation rules or response formats.

5. Enforce server-side role assignment
Inspect the registration service and database insertion query.
Implement the following rule:
Every account created through public registration must receive:
ACCOUNT_HOLDER
Requirements:
Assign the role explicitly inside the trusted backend service.
Never read the role from req.body.
Never pass a client-provided role into the SQL INSERT query.
Use parameterized SQL queries.
Preserve existing password hashing and duplicate-email handling.
Preserve existing database constraints.
Do not change the roles of existing users.
Do not modify seed-created ADMIN or AUDITOR accounts.
The server must remain the only authority responsible for assigning privileged roles.

6. Prevent role escalation
Test the following registration payloads:
Test A — Normal registration (ACCOUNT_HOLDER)
Test B — ADMIN role injection (Rejected)
Test C — AUDITOR role injection (Rejected)
Test D — Case variation and unexpected roles (admin, auditor, SUPER_ADMIN)
Test E — Privilege fields (isAdmin, permissions, isVerified)
```

#### 3. AI Suggestion
Initial audit identified 5 critical privilege escalation vulnerabilities:
1. `registerSchema` explicitly permitted `role: z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'])` and omitted `.strict()`.
2. `auth.controller.js` passed unfiltered `req.body` to the service.
3. `auth.service.js` accepted `role` from the arguments and defaulted to `'ACCOUNT_HOLDER'` only if missing.
4. `userRepository.create()` passed `$4` (the client role) directly into SQL `INSERT INTO users (..., role)`.
5. JWT tokens minted upon registration embedded `user.role` from the DB row, giving injected admins full access to `authorize('ADMIN')` routes.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - Client-controlled role assignment is a critical privilege escalation vulnerability. Any system allowing clients to specify their own authorization tier cannot protect administrative operations.
- **What I identified and decided:**
  - Mandated a 3-layer Defense-in-Depth architectural correction:
    - *Layer 1 (Schema Rejection):* Removed `role` entirely from `registerSchema` and added `.strict()`. Any unexpected field (`role`, `isAdmin`, `permissions`) immediately triggers `400 Bad Request`.
    - *Layer 2 (Controller Destructuring):* Modified `authController.register` to destructure only `{ fullName, email, password }` from `req.body`, discarding any extra fields.
    - *Layer 3 (Authoritative Service Enforcement):* In `authService.register()`, hardcoded `const role = 'ACCOUNT_HOLDER'`. The backend is the sole authority for role assignment.
  - Removed `role` from `swagger.js` `UserRegister` schema.
  - Expanded `tests/integration/auth.test.js` from 7 tests to 18 automated security tests.

#### 5. Final Implementation
- `backend/src/modules/auth/auth.validation.js`: Strict registration schema omitting `role`.
- `backend/src/modules/auth/auth.controller.js`: Explicit field whitelisting.
- `backend/src/modules/auth/auth.service.js`: Unconditional server-side `ACCOUNT_HOLDER` role assignment.
- `backend/src/config/swagger.js`: Aligned OpenAPI register request schema.
- `backend/tests/integration/auth.test.js`: 18 automated security integration tests.

#### 6. Verification
- **Automated Tests:** `tests/integration/auth.test.js`: All 18 tests passed (normal registration, uppercase `ADMIN`/`AUDITOR` rejection, lowercase `admin`/`auditor` rejection, privilege fields `isAdmin` rejection, direct service call role enforcement, JWT tampering rejection, and admin endpoint RBAC protection).
- **Security Testing:** Verified that sending `{"role": "ADMIN"}` returns `400 Bad Request` (`Validation failed`) with zero database writes.
- **Full Suite:** 106/106 tests passing.

#### 7. Related Commit
- `1e54086d7941f5b73752296da57b1faa39426fce` – `fix: prevent privilege escalation in public registration with strict validation and server-side role enforcement` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/1e54086d7941f5b73752296da57b1faa39426fce))

---

### Session 7: Concurrency, Idempotency and Authorization

**Date:** 2026-11-07

#### 1. Objective
Complete Day 2 concurrency, idempotency, and authorization hardening: eliminate balance race conditions on withdrawals (`SELECT FOR UPDATE`), verify deterministic deadlock elimination on opposite transfers, enforce idempotency key scoping per user with concurrent retry serialization, verify IDOR account protection and auditor money-movement denial, and fix test harness runtime issues.

#### 2. Original AI Prompt
*Recovered from Antigravity conversation history (`b2ff31ea-2a1a-45fb-9078-f1ac059d59b5`, Step 525):*

```text
# LedgerLine — Day 2: Concurrency, Idempotency & Authorization Hardening

Act as a senior backend engineer, PostgreSQL specialist and application security engineer.

Your task is to complete the remaining Day 2 work for LedgerLine based on the existing implementation.

## 1. Project technology stack
- Node.js
- Express.js
- JavaScript ES Modules
- Neon PostgreSQL
- PostgreSQL pg library with raw SQL
- JWT authentication
- bcrypt
- Zod validation
- Jest and Supertest
- Swagger API documentation

Important architecture decisions:
- UUIDs remain internal database identifiers.
- Account numbers such as LL-ACC-1001 are used in public API requests.
- Money is stored as integer paise using PostgreSQL BIGINT and JavaScript BigInt.
- Transactions use PostgreSQL database transactions.
- Ledger entries are append-only.
- The runtime database role follows least-privilege permissions.
- No ORM, Docker, TypeScript or unnecessary dependencies.

## 2. Existing progress
I have already performed endpoint-level testing for the initial Day 2 tasks:
- Idempotency behaviour.
- Same idempotency key with the same payload.
- Same key with a changed payload.
- Transaction failure scenarios.
- Account ownership and IDOR.
- RBAC.
- Public registration role escalation attempts.

Do not repeat these basic endpoint tests unnecessarily.
However, manual endpoint testing does not prove concurrent request safety. You must inspect the implementation and add automated tests for the remaining scenarios.
Do not assume a feature is correct merely because one manual API request succeeded.

## 3. BUILD — Review transaction and idempotency implementation
Inspect the complete deposit, withdrawal and transfer flows.
Trace:
- Route.
- Validation middleware.
- Authentication and authorization middleware.
- Controller.
- Service.
- Idempotency handling.
- SQL queries.
- Database transaction boundaries.
- Ledger posting.
- Commit and rollback behaviour.

### A. Unique constraints
Inspect the existing database migrations.
Verify:
- Idempotency key uniqueness follows the intended scope.
- Duplicate transaction protection is enforced appropriately.
- Account numbers have unique constraints.
- Transaction and ledger relationships are protected by foreign keys.
- Required constraints prevent invalid financial data.

### B. Idempotency keys and request hashes
Verify the following behaviour:
1. One logical client transaction uses one idempotency key.
2. Retries of that same logical transaction reuse the original key.
3. Same key + same request payload returns the original completed result.
4. Same key + changed payload returns a conflict.
5. A genuinely new logical transaction uses a new key.
6. Concurrent requests using the same key cannot create duplicate transactions.
7. Failed transactions do not leave inconsistent idempotency records.

Inspect how request hashes are generated.
Ensure the hash represents the relevant validated transaction payload and that equivalent retry requests behave consistently.

### C. SELECT FOR UPDATE
Inspect withdrawal and transfer balance handling.
Verify:
- Balance check and account deduction occur inside a single PostgreSQL transaction.
- The account row is locked using SELECT ... FOR UPDATE before balance validation.
- Two concurrent withdrawals against the same account cannot overdraft or drop the balance below zero.
- Balance validation occurs strictly while the lock is held.

Add automated concurrency tests:
- Test D: Two concurrent withdrawals racing on the same account exceeding available balance. Exactly one succeeds, one fails with 400 Insufficient Funds, and final balance is strictly non-negative.

### D. Deadlock prevention
Inspect internal transfers between two accounts.
Verify:
- Row locking order is deterministic (lexicographical account ID order).
- Opposite concurrent transfers (A -> B and B -> A) do not deadlock (40P01).
- Add automated concurrency test: Test E (Opposite transfers).

### E. Account ownership and IDOR
Verify account ownership authorization:
- Test F: Account holder querying/withdrawing/transferring another user's account returns 403 Forbidden.
- Test G: Auditor attempting money movement returns 403 Forbidden, but auditor can inspect ledger/audit events.
```

#### 3. AI Suggestion
- Confirmed `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)` protects key scoping.
- Evaluated withdrawal race condition: without `SELECT FOR UPDATE`, racing withdrawals read stale balance simultaneously, producing negative balances (-₹200).
- Evaluated bidirectional transfers: arbitrary row locking order triggers PostgreSQL circular wait deadlock `40P01`.
- Identified 3 runtime test harness issues during test suite execution:
  1. Seed fixture collision: Alice had an initial seeded deposit transaction (`INIT-ALICE`), throwing off generic transaction counts.
  2. Query parameter placeholder mismatch: `concurrency.test.js` passed 1 argument with `$2` placeholder, causing a PostgreSQL parameter error.
  3. Total ledger entry count failure in authorization tests due to initial seeded account credit entries.

#### 4. Human Review and Correction
- **What was incorrect/risky in the AI suggestion:**
  - Manual endpoint testing alone does not prove concurrent safety. Under production race conditions, lack of row locks leads to double-spending and overdrafts.
  - Relying on generic test assertions caused test fixture collisions with seeded transactions.
- **What I identified and decided:**
  - Enforced `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE` within an active transaction. Balance validation occurs exclusively while holding the row lock. Engine-level `CHECK (balance >= 0)` serves as the ultimate safety barrier.
  - Verified `accountRepository.findTwoForUpdate()` acquires locks in global lexicographical order (`ORDER BY id ASC FOR UPDATE`), eliminating circular wait.
  - When identical requests race in parallel (`Promise.all`), the PostgreSQL unique constraint on `idempotency_keys` ensures exactly one thread creates the pending key reservation and commits. Concurrent requests receive `409 Conflict` or await the committed replay. Failed transactions roll back and release the key for clean client retries.
  - Verified `authorizeAccountAccess` middleware blocks unauthorized cross-user balance queries, statements, and transfers with 403 Forbidden. Verified auditor role is strictly read-only and blocked from `/deposit`, `/withdraw`, `/transfer`.
  - Corrected SQL parameter placeholder to `$1`, filtered transaction assertions by `transaction_type = 'TRANSFER'`, and asserted `0` unauthorized debit/credit entries created.

#### 5. Final Implementation
- `backend/src/repositories/account.repository.js`: Concurrency-safe `findByIdForUpdate` and `findTwoForUpdate`.
- `backend/src/modules/transactions/transaction.service.js`: Transaction boundary management (`BEGIN ... COMMIT / ROLLBACK`), idempotency lifecycle, and account ownership enforcement.
- `backend/src/middlewares/auth.middleware.js`: RBAC and `authorizeAccountAccess` middleware.
- `backend/tests/integration/idempotency.test.js`: 4 automated idempotency tests (sequential retry, concurrent retry via `Promise.all`, changed payload conflict, and cleanup rollback).
- `backend/tests/integration/concurrency.test.js`: 2 parallel race tests (racing withdrawals preventing overdraft, and opposite-direction transfers eliminating deadlocks).
- `backend/tests/integration/authorization.test.js`: 12 automated authorization tests (cross-user IDOR access denial, auditor money-movement denial, and auditor read-only inspection).

#### 6. Verification
- **Automated Tests:**
  - `tests/integration/idempotency.test.js`: 4/4 tests passing.
  - `tests/integration/concurrency.test.js`: 2/2 tests passing with zero deadlocks and zero overdrafts under parallel execution (`Promise.all`).
  - `tests/integration/authorization.test.js`: 12/12 tests passing.
  - Full backend test suite: 106/106 tests passing across all 9 test suites.
- **Concurrency & Security Testing:** Confirmed zero deadlocks (`40P01`) and zero negative balance violations under true parallel load.

#### 7. Related Commit
- `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening` ([Commit Link](https://github.com/Prasanna-Anjaneyulu078/LedgerLine_Snovasys/commit/bc52c325b051dd57cfbbeddca150e75d4a06fffa))

---

## Documentation Notes

- Original prompts must be genuine and preserved as written.
- Never present reconstructed or paraphrased prompts as verbatim.
- If an original prompt cannot be recovered, state that honestly.
- Record only implemented changes and tests that were actually performed.
- Include real Git commit references wherever available.
- Clearly distinguish AI suggestions from human decisions.
