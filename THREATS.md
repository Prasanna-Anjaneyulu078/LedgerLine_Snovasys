# LedgerLine: Threat Model & Financial Security Mitigations (THREATS.md)

This document analyzes security, integrity, and concurrency threats to LedgerLine, their implemented architectural mitigations, residual risks, and the automated test suites verifying their prevention.

---

## 1. Threat Scenarios & Mitigations

### Threat 1: Race Condition Overdraft (Double-Spending)
- **Threat Vector**: A malicious user or malfunctioning client simultaneously submits two separate withdrawal requests (e.g. ₹60 each) against an account with only ₹100 balance. If checks and balance deductions execute non-atomically, both check `balance >= 60` before either deducts, resulting in ₹120 withdrawn and a negative account balance (-₹20).
- **Mitigation**:
  1. Transaction isolation with `BEGIN ... COMMIT`.
  2. Immediate row-level locking via `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE`.
  3. Re-checking balance inside the lock boundary.
  4. Database-level `CHECK (balance >= 0)` constraint guaranteeing that no PostgreSQL query can commit a negative balance under any circumstance.
- **Residual Risk**: High contention on a single high-frequency account can introduce queue latency.
- **Automated Verification**: `tests/integration/concurrency.test.js` (`Concurrent Withdrawals - Two simultaneous withdrawals exceeding available balance cannot overdraw account`).

---

### Threat 2: Deadlock on Concurrent Opposite Transfers
- **Threat Vector**: Alice transfers money to Bob while Bob simultaneously transfers money to Alice. Thread 1 locks Alice then attempts to lock Bob. Thread 2 locks Bob then attempts to lock Alice. PostgreSQL aborts one transaction with error `40P01 (deadlock_detected)`.
- **Mitigation**:
  1. Deterministic lock acquisition order: In `accountRepository.findTwoForUpdate(accountId1, accountId2, client)`, accounts are sorted lexicographically by UUID before acquiring row locks (`SELECT ... WHERE id = ANY($1) ORDER BY id ASC FOR UPDATE`).
  2. Both concurrent transfers attempt to acquire locks in the exact same sequence, preventing circular wait conditions.
- **Residual Risk**: In cross-system integrations spanning multiple databases, distributed deadlocks must be handled with timeout backoffs.
- **Automated Verification**: `tests/integration/concurrency.test.js` (`Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks`).

---

### Threat 3: Network Retries & Duplicate Money Movement
- **Threat Vector**: A mobile app initiates a ₹500 transfer. The server commits the transfer, but the network drops before the 200 OK response reaches the client. The client automatically retries the transfer, debiting the sender an additional ₹500.
- **Mitigation**:
  1. Mandatory `Idempotency-Key` header on all financial endpoints (`POST /api/v1/transactions/*`).
  2. SHA-256 hash calculated over the normalized request payload and operation type.
  3. Unique database constraint `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)`.
  4. If an identical key with identical payload is received, the original committed response is replayed immediately without re-executing any ledger entries.
  5. If an identical key with a *different* payload is received, the server rejects it with `409 Conflict`.
- **Residual Risk**: Storage growth in `idempotency_keys` table over years; mitigated by documented 24-hour expiration indexing.
- **Automated Verification**: `tests/integration/idempotency.test.js` (`Idempotent Retry` & `Idempotency Conflict`).

---

### Threat 4: Partial Financial Ledger Postings (Unbalanced Books)
- **Threat Vector**: A transaction successfully debits the sender, but an unhandled exception or database connection crash occurs before crediting the receiver, leaving the books permanently out of balance.
- **Mitigation**:
  1. Invariant 1: Internal transfers must produce balanced double-entry postings (DEBIT = CREDIT).
  2. Both ledger entries and account balance projections are executed on the same checked-out client within a single atomic PostgreSQL transaction (`BEGIN ... COMMIT`).
  3. If any step fails, the entire transaction is rolled back with `ROLLBACK`.
- **Residual Risk**: Manual rogue SQL modifications directly on the database by a DBA; mitigated through least-privilege database user credentials and audit logs.
- **Automated Verification**: `tests/integration/transactions.test.js` (`Internal Transfer - Money Conservation`).

---

### Threat 5: Broken Account-Level Access Control (IDOR)
- **Threat Vector**: User Alice (Account Holder) changes the `accountId` in a withdrawal or statement URL from her account to Bob's account ID.
- **Mitigation**:
  1. `authorizeAccountAccess('accountId')` middleware verifies account ownership against `req.user.id`.
  2. If the user is not an `ADMIN` or `AUDITOR`, any attempt to inspect or transact against an account owned by another user is aborted with `403 Forbidden`.
  3. Refusal is logged to `audit_events`.
- **Residual Risk**: Shared accounts or multi-user corporate permissions require future permission-matrix expansion.
- **Automated Verification**: `tests/integration/authorization.test.js` (`User cannot view balance of another user account` & `User cannot withdraw from another user account`).

---

### Threat 6: Auditor Privilege Escalation
- **Threat Vector**: An auditor user attempts to call financial money-movement endpoints (e.g. deposit, withdraw, transfer) or admin modification routes.
- **Mitigation**:
  1. Strict role checks on money-moving routes prohibiting `AUDITOR` from initiating transactions (`403 Forbidden`).
  2. `AUDITOR` has strictly read-only access to `/accounts`, `/transactions`, `/ledger`, `/statements`, and `/audit-events`.
- **Residual Risk**: Auditor credentials compromised; mitigated by short JWT expiration and audit logging.
- **Automated Verification**: `tests/integration/authorization.test.js` (`Auditor Role - Auditor is restricted from initiating financial transactions`).

---

### Threat 7: Floating-Point Math Rounding Drift
- **Threat Vector**: Representing ₹100.10 as JavaScript `100.1` IEEE-754 floating-point number, accumulating fractional cent/paise rounding errors over millions of transactions.
- **Mitigation**:
  1. Minor units (paise) used exclusively across application, API, and database.
  2. Stored as PostgreSQL `BIGINT`.
  3. Manipulated in JavaScript exclusively using `BigInt` (zero floating-point math).
- **Residual Risk**: None for INR paise accounting.
- **Automated Verification**: `tests/unit/money.test.js`.

