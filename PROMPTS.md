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

