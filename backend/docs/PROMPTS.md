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

