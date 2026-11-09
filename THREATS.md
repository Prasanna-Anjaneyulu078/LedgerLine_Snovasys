# LedgerLine: Threat Model & Application Security Assessment (THREATS.md)

This document provides a systematic threat model, vulnerability analysis, and security control evaluation for **LedgerLine** (Secure Financial Transaction and Immutable Ledger System). It assesses realistic attack vectors across authentication, access control, transaction processing, concurrency, database immutability, and operational resilience based on the actual codebase implementation.

---

## Security Verification Matrix

| Threat ID | Threat Name | Severity | Primary Mitigation Control | Verification Method & Evidence | Status |
| :--- | :--- | :---: | :--- | :--- | :---: |
| **THREAT-001** | Race Condition Overdraft via Racing Withdrawals | **CRITICAL** | `SELECT ... FOR UPDATE` row locks + `CHECK (balance >= 0)` | Automated Test (`concurrency.test.js` Test D) | **VERIFIED (TEST)** |
| **THREAT-002** | Deadlock on Concurrent Opposite-Direction Transfers | **MEDIUM** | Deterministic UUID lock ordering (`ORDER BY id ASC FOR UPDATE`) | Automated Test (`concurrency.test.js` Test E) | **VERIFIED (TEST)** |
| **THREAT-003** | Duplicate Financial Execution via Network Retries | **CRITICAL** | PostgreSQL `uq_user_idempotency_key` + SHA-256 canonical hashing | Automated Test (`idempotency.test.js` Tests A, B, C) | **VERIFIED (TEST)** |
| **THREAT-004** | Inconsistent Ledger State & Atomicity Failure | **CRITICAL** | Atomic `BEGIN...COMMIT` + dual-entry debit/credit ledger creation | Automated Test (`transactions.test.js`, `ledger_immutability.test.js`) | **VERIFIED (TEST)** |
| **THREAT-005** | Broken Account-Level Access Control (IDOR) | **HIGH** | `authorizeAccountAccess` middleware + source account owner checks | Automated Test (`authorization.test.js` Test F) | **VERIFIED (TEST)** |
| **THREAT-006** | Auditor Privilege Abuse (Unauthorized Money Movement) | **HIGH** | Strict RBAC (`authorize('ACCOUNT_HOLDER', 'ADMIN')`) | Automated Test (`authorization.test.js` Test G) | **VERIFIED (TEST)** |
| **THREAT-007** | Floating-Point Math Rounding Drift | **HIGH** | Minor units (integer paise) with PostgreSQL `BIGINT` & JS `BigInt` | Automated Test (`money.test.js` 8 tests) | **VERIFIED (TEST)** |
| **THREAT-008** | Unauthorized Modification of Ledger Records | **CRITICAL** | Dual-layer: `trg_prevent_ledger_modification` + `ledgerline_runtime` role | Automated Test (`ledger_immutability.test.js` 8 tests) | **VERIFIED (TEST)** |
| **THREAT-009** | Privilege Escalation via Registration Role Injection | **CRITICAL** | Strict Zod schema (`.strict()`) + controller filter + hardcoded role | Automated Test (`auth.test.js` 18 tests) | **VERIFIED (TEST)** |
| **THREAT-010** | SQL Injection via Raw SQL Parameter Interpolation | **CRITICAL** | 100% Parameterized queries (`$1, $2`) across all repositories | Code Inspection & Integration Test Suite | **VERIFIED (INSPECTION)** |
| **THREAT-011** | Negative or Zero Transaction Amount Tampering | **HIGH** | Zod positive decimal regex + `CHECK (amount > 0)` DB constraint | Automated Test (`transactions.test.js`, `money.test.js`) | **VERIFIED (TEST)** |
| **THREAT-012** | Token Tampering & Deactivated User Access | **HIGH** | Server-side JWT signature verification + active user DB check | Automated Test (`auth.test.js`) | **VERIFIED (TEST)** |
| **THREAT-013** | Denial of Service via Request Flooding | **MEDIUM** | Multi-tier `express-rate-limit` + 1MB JSON body payload limit | Code Inspection & Manual Verification | **VERIFIED (INSPECTION)** |
| **THREAT-014** | Sensitive Credential Exposure via Logs or Errors | **MEDIUM** | Production error masking + `sanitizeUrl` + bcrypt (12 rounds) | Code Inspection & Automated Test (`auth.test.js`) | **VERIFIED (HYBRID)** |

---

## Threat Analysis & Architectural Mitigations

### Threat ID: THREAT-001 – Race Condition Overdraft & Double-Spending via Concurrent Withdrawals

- **Severity:** **CRITICAL** – Direct risk of unauthorized balance overdraft and illicit money extraction.
- **1. Threat Description:**
  - In a financial system, if account balance checking and account deduction do not occur atomically with row-level locking, two or more simultaneous withdrawal or transfer requests can inspect the same initial balance before either transaction commits.
  - This allows an account holder to spend the same funds multiple times (double-spending), pushing the account balance into unauthorized negative amounts and causing direct financial loss to the institution.
- **2. Attack Scenario:**
  - Attacker Alice possesses an account with an available balance of ₹500.00 (50,000 paise).
  - Alice dispatches two simultaneous HTTP requests to `POST /api/v1/transactions/withdraw`:
    - Request A: Withdraw ₹400.00 (40,000 paise) via `{"accountNumber": "LL-ACC-1001", "amount": "400.00"}`.
    - Request B: Withdraw ₹300.00 (30,000 paise) via `{"accountNumber": "LL-ACC-1001", "amount": "300.00"}`.
  - Total requested: ₹700.00 > ₹500.00 available balance.
  - If the backend executes simple `SELECT balance ...` followed by application validation, both threads read 50,000 paise, both determine `50000 >= amount`, and both execute `UPDATE accounts SET balance = balance - amount`. Alice successfully extracts ₹700.00, leaving the account at -₹200.00 (-20,000 paise).
- **3. Potential Impact:**
  - Financial loss.
  - Incorrect and unauthorized negative account balances.
  - Violation of core banking invariants.
- **4. Existing Security Controls:**
  - Transaction isolation: Operations execute within an explicit PostgreSQL transaction block (`BEGIN ... COMMIT`).
  - Row-level locking: Row lock acquired via `SELECT ... FROM accounts WHERE id = $1 FOR UPDATE`.
  - Enclosed validation: Balance validation is executed strictly while holding the row lock.
  - Database constraint: Engine-level PostgreSQL constraint `CHECK (balance >= 0)` on the `accounts` table.
- **5. Mitigation Strategy:**
  - *Implemented:* `accountRepository.findByIdForUpdate(accountId, client)` locks the account row immediately. The second concurrent thread blocks in PostgreSQL until Thread 1 commits. When Thread 2 unblocks, it reads the updated balance (10,000 paise) and fails validation with `400 Bad Request (Insufficient funds)`. The database `CHECK (balance >= 0)` constraint guarantees that even in the event of an application logic bug, negative balances can never be committed to disk.
- **6. Verification and Test Evidence:**
  - *Automated Test:* `tests/integration/concurrency.test.js` – Test D (`Two racing withdrawals exceeding available balance allow at most one success and prevent negative balance`).
  - *Observed Result:* Exactly one request returned HTTP 200, the racing request returned HTTP 400 (`Insufficient funds`), final balance was exactly 10,000 or 20,000 paise, and balance never dropped below zero.
- **7. Related Implementation Files:**
  - `backend/src/repositories/account.repository.js`
  - `backend/src/modules/transactions/transaction.service.js`
  - `backend/src/database/migrations/002_create_accounts.sql`
  - `backend/tests/integration/concurrency.test.js`
- **8. Related Git Commit:**
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening`
- **9. Residual Risk:**
  - Heavy concurrent withdrawal contention on a single account introduces queue waiting times in PostgreSQL. Mitigated by transaction timeouts and client rate limits.

---

### Threat ID: THREAT-002 – Deadlock Abort on Concurrent Opposite-Direction Transfers

- **Severity:** **MEDIUM** – Risk of transaction aborts (`40P01`) and service disruption under high concurrency.
- **1. Threat Description:**
  - When funds are transferred between two accounts (Account A and Account B), both account rows must be locked to update balances and maintain isolation.
  - If two concurrent threads acquire locks in opposing order, PostgreSQL encounters a circular wait deadlock and forcibly aborts one of the transactions with error code `40P01 (deadlock_detected)`.
- **2. Attack Scenario:**
  - User Alice initiates a transfer of ₹10.00 from Account A (`LL-ACC-1001`) to Account B (`LL-ACC-2001`) via `POST /api/v1/transactions/transfer`.
  - Simultaneously, User Bob initiates a transfer of ₹10.00 from Account B (`LL-ACC-2001`) to Account A (`LL-ACC-1001`).
  - Thread 1 locks Account A and attempts to lock Account B. Thread 2 locks Account B and attempts to lock Account A.
  - Neither thread can proceed, resulting in an unhandled deadlock exception, transaction rollback, and failure response to legitimate customers.
- **3. Potential Impact:**
  - Service disruption and transaction failures.
  - Inconsistent client retry behavior.
- **4. Existing Security Controls:**
  - Deterministic global lock ordering via `accountRepository.findTwoForUpdate(id1, id2, client)`.
- **5. Mitigation Strategy:**
  - *Implemented:* In `accountRepository.findTwoForUpdate()`, the two account UUIDs are sorted lexicographically (`[accountId1, accountId2].sort()`) before row lock acquisition. The query executes `WHERE id = ANY($1::uuid[]) ORDER BY id ASC FOR UPDATE`. Regardless of transfer direction (A→B or B→A), all threads in the system acquire row locks in the exact same global order, making circular waits mathematically impossible.
- **6. Verification and Test Evidence:**
  - *Automated Test:* `tests/integration/concurrency.test.js` – Test E (`Concurrent Opposite-Direction Transfers - Deterministic locking eliminates deadlocks`).
  - *Observed Result:* Both transfers executed simultaneously via `Promise.all` completed with HTTP 200, zero deadlocks occurred, 4 ledger entries were created (2 debits, 2 credits), and net money was conserved.
- **7. Related Implementation Files:**
  - `backend/src/repositories/account.repository.js`
  - `backend/src/modules/transactions/transaction.service.js`
  - `backend/tests/integration/concurrency.test.js`
- **8. Related Git Commit:**
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening`
- **9. Residual Risk:**
  - In cross-database or distributed microservices architectures, deterministic lock ordering must be coordinated via distributed locking or two-phase commits. (Not applicable to LedgerLine's single-database PostgreSQL architecture).

---

### Threat ID: THREAT-003 – Duplicate Financial Execution via Network Retries

- **Severity:** **CRITICAL** – Direct risk of double-debiting customer accounts due to transient network failures.
- **1. Threat Description:**
  - Clients interacting with financial APIs frequently experience network drops, client timeouts, or application reloads after the server has processed and committed a transaction but before the HTTP response is received.
  - If the client retries the request, a non-idempotent backend processes the transaction again, causing duplicate withdrawals or transfers.
- **2. Attack Scenario:**
  - A mobile banking application submits a ₹1,000.00 transfer request via `POST /api/v1/transactions/transfer`. The server commits the transfer, debits the user's balance, and records ledger entries.
  - The client's cellular connection drops before receiving the HTTP 200 response. The mobile application's automated retry logic submits the exact same transfer request again with the same `Idempotency-Key`.
  - Without idempotency controls, the user is debited another ₹1,000.00.
- **3. Potential Impact:**
  - Unauthorized duplicate financial transactions.
  - Customer financial loss and balance discrepancies.
  - Dispute resolution and accounting reconciliation overhead.
- **4. Existing Security Controls:**
  - Mandatory `Idempotency-Key` header on all mutation endpoints (`/deposit`, `/withdraw`, `/transfer`).
  - Database unique constraint `uq_user_idempotency_key UNIQUE (user_id, idempotency_key)`.
  - Canonical SHA-256 payload hashing across operation parameters (`op`, `sourceAccountId`, `destinationAccountId`, `amountPaise`).
  - Atomic in-flight state tracking in the database.
- **5. Mitigation Strategy:**
  - *Implemented:*
    1. Keys are scoped per user via `UNIQUE(user_id, idempotency_key)`, preventing cross-user collision.
    2. Identical retries (same key + same payload): The server intercepts the duplicate key and returns the original cached HTTP response without re-executing any ledger entries or updating balances.
    3. Tampered retries (same key + modified payload): The SHA-256 hash differs from the stored hash, causing immediate rejection with `409 Conflict`.
    4. Concurrent race (same key in parallel): PostgreSQL unique constraint allows exactly one thread to insert the pending key reservation; racing threads receive `409 Conflict` or await the committed replay.
    5. Rollback on failure: If validation fails, the transaction rolls back and cleans up the key reservation, allowing clean client retries.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/idempotency.test.js`:
    - Test A: Sequential retry returns original response; database verifies exactly 1 transaction created.
    - Test B: Concurrent retry via `Promise.all` allows exactly 1 transfer; duplicate is prevented.
    - Test C: Same key with changed payload triggers `409 Conflict`.
    - Failed transaction rolls back idempotency record cleanly.
- **7. Related Implementation Files:**
  - `backend/src/repositories/idempotency.repository.js`
  - `backend/src/modules/transactions/transaction.service.js`
  - `backend/src/database/migrations/005_create_idempotency_keys.sql`
  - `backend/tests/integration/idempotency.test.js`
- **8. Related Git Commit:**
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening`
- **9. Residual Risk:**
  - Long-term storage growth of the `idempotency_keys` table. Mitigated by indexing `created_at` for future automated TTL pruning (e.g. 24-48 hour retention).

---

### Threat ID: THREAT-004 – Inconsistent Ledger State & Atomicity Failure (Unbalanced Books)

- **Severity:** **CRITICAL** – Severe accounting integrity failure resulting in phantom money creation or destruction.
- **1. Threat Description:**
  - Double-entry accounting requires that every transfer produce balanced credit and debit entries for the exact same amount (`SUM(credit) = SUM(debit)`).
  - If a server error, crash, or constraint violation occurs halfway through a transfer (e.g. sender is debited, but receiver is not credited), the system's books become permanently corrupted.
- **2. Attack Scenario:**
  - A transfer of ₹5,000.00 is initiated via `POST /api/v1/transactions/transfer`. The application executes `UPDATE accounts SET balance = balance - 5000` on the sender, but an unhandled exception or database connection drop occurs before the receiver's balance is updated and before ledger entries are recorded.
  - The sender's money has vanished without reaching the recipient.
- **3. Potential Impact:**
  - Violation of fundamental double-entry accounting invariants.
  - Corrupted financial statements and reconciliation failure.
  - Unrecoverable data inconsistency.
- **4. Existing Security Controls:**
  - PostgreSQL transaction boundaries (`BEGIN ... COMMIT / ROLLBACK`).
  - Atomic dual-entry ledger insertion on the same checked-out client.
  - Database foreign keys linking ledger entries to the parent transaction ID.
- **5. Mitigation Strategy:**
  - *Implemented:* All transfer steps—source debit, destination credit, sender DEBIT ledger entry, receiver CREDIT ledger entry, audit log recording, and idempotency completion—are executed within a single PostgreSQL transaction block. If any step fails, the entire transaction is rolled back (`ROLLBACK`), ensuring that either all changes persist or none do.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/transactions.test.js` & `tests/integration/ledger_immutability.test.js`.
  - *Observed Result:* Verified that `SUM(credit) - SUM(debit) == balance` across all accounts in the database.
- **7. Related Implementation Files:**
  - `backend/src/modules/transactions/transaction.service.js`
  - `backend/src/repositories/ledger.repository.js`
  - `backend/src/database/migrations/003_create_ledger_entries.sql`
  - `backend/src/database/migrations/004_create_transactions.sql`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
- **9. Residual Risk:**
  - Direct database administrative intervention (DBA executing manual SQL). Mitigated by least-privilege database user credentials and audit logs.

---

### Threat ID: THREAT-005 – Broken Account-Level Access Control (IDOR)

- **Severity:** **HIGH** – Unauthorized access to customer balances, transaction statements, and unauthorized fund movement.
- **1. Threat Description:**
  - Insecure Direct Object References (IDOR) occur when an application accepts a user-supplied identifier (such as an account number or UUID) without verifying that the authenticated user possesses authorization to access that object.
  - In a financial application, IDOR allows malicious account holders to spy on other customers' balances, view private transaction histories, or withdraw/transfer money from accounts they do not own.
- **2. Attack Scenario:**
  - Attacker Alice registers as an `ACCOUNT_HOLDER` and receives account `LL-ACC-1001`.
  - Alice modifies HTTP request parameters to target Bob's account `LL-ACC-2001`:
    - `GET /api/v1/accounts/LL-ACC-2001` (balance & account details)
    - `GET /api/v1/accounts/LL-ACC-2001/balance` (balance inspection)
    - `GET /api/v1/accounts/LL-ACC-2001/statement` (account statement query)
    - `GET /api/v1/statements/LL-ACC-2001` (statement endpoint)
    - `POST /api/v1/transactions/withdraw` with `{"accountNumber": "LL-ACC-2001"}`
    - `POST /api/v1/transactions/transfer` with `{"sourceAccountNumber": "LL-ACC-2001"}`
  - If authorization checks only verify that Alice is logged in (role check alone), Alice successfully inspects or steals Bob's money.
- **3. Potential Impact:**
  - Unauthorized account access and customer financial data exposure.
  - Unauthorized debiting of victim accounts (theft).
  - Regulatory and compliance violations (GDPR, banking confidentiality).
- **4. Existing Security Controls:**
  - `authorizeAccountAccess('accountNumber')` middleware resolving account numbers or UUIDs and validating ownership against `req.user.id`.
  - Service-level fast-path and locked-transaction ownership verification (`account.owner_id !== user.id`).
  - Security audit logging of unauthorized attempts (`TRANSACTION_TRANSFER_REFUSED`, `TRANSACTION_WITHDRAW_REFUSED`).
- **5. Mitigation Strategy:**
  - *Implemented:*
    1. Middleware layer: `authorizeAccountAccess` intercepts account and statement endpoints, resolves the account via `findByIdOrAccountNumber`, and immediately throws `403 Forbidden` if `req.user.role === 'ACCOUNT_HOLDER'` and `account.owner_id !== req.user.id`.
    2. Service layer defense-in-depth: In `transactionService.transfer()` and `withdraw()`, ownership is verified before and after acquiring row locks. Even if middleware were bypassed, the service rejects the call with `403 Forbidden`.
    3. Audit recording: All refused access attempts are logged permanently to `audit_events` with the caller's IP and actor ID.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/authorization.test.js` – Test F (`User cannot view balance of another user account`, `User cannot withdraw from another user account`, `User cannot transfer from another user account`) and `tests/integration/account_number_transfer.test.js`.
  - *Observed Result:* All cross-user attempts returned HTTP 403 Forbidden with zero database modifications.
- **7. Related Implementation Files:**
  - `backend/src/middleware/authorize.js`
  - `backend/src/modules/transactions/transaction.service.js`
  - `backend/src/modules/accounts/account.service.js`
  - `backend/src/modules/statements/statement.service.js`
  - `backend/tests/integration/authorization.test.js`
- **8. Related Git Commit:**
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening`
- **9. Residual Risk:**
  - Future support for joint or corporate multi-user bank accounts will require an explicit multi-tenant permission matrix.

---

### Threat ID: THREAT-006 – Auditor Privilege Abuse (Unauthorized Money Movement)

- **Severity:** **HIGH** – Compromise of regulatory separation of duties by allowing compliance auditors to modify financial data.
- **1. Threat Description:**
  - Financial regulatory standards mandate strict separation of duties between operational personnel (account holders, cashiers) and compliance auditors.
  - Auditors require broad visibility into ledgers, accounts, and audit trails to perform oversight, but must be strictly prohibited from moving funds, altering balances, or initiating transactions.
- **2. Attack Scenario:**
  - An internal compliance auditor with valid `AUDITOR` credentials attempts to execute `POST /api/v1/transactions/deposit`, `POST /api/v1/transactions/withdraw`, or `POST /api/v1/transactions/transfer` to credit money to an external account or alter balances.
- **3. Potential Impact:**
  - Fraud, embezzlement, or unauthorized money movement by internal oversight staff.
  - Total failure of financial regulatory compliance audits.
- **4. Existing Security Controls:**
  - Strict endpoint RBAC middleware: `authorize('ACCOUNT_HOLDER', 'ADMIN')` on all transaction endpoints.
  - Read-only routing: `AUDITOR` role explicitly restricted to `GET` endpoints for `/ledger`, `/audit-events`, `/accounts`, and `/statements`.
- **5. Mitigation Strategy:**
  - *Implemented:* Transaction routes (`transaction.routes.js`) apply `authorize('ACCOUNT_HOLDER', 'ADMIN')`. Any request bearing an `AUDITOR` token is immediately rejected with `403 Forbidden` (`Access forbidden: required role [ACCOUNT_HOLDER, ADMIN], current role is [AUDITOR]`). Auditors can only query read-only audit and ledger endpoints.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/authorization.test.js` – Test G (`Auditor Role - Auditor is restricted from initiating financial transactions`).
  - *Observed Result:* Verified that Auditor attempts to deposit, withdraw, or transfer all return HTTP 403 Forbidden, while `GET /api/v1/ledger` and `GET /api/v1/audit-events` return HTTP 200 with full inspection data.
- **7. Related Implementation Files:**
  - `backend/src/middleware/authorize.js`
  - `backend/src/modules/transactions/transaction.routes.js`
  - `backend/tests/integration/authorization.test.js`
- **8. Related Git Commit:**
  - `bc52c325b051dd57cfbbeddca150e75d4a06fffa` – `test(concurrency): add automated tests for Day 2 concurrency, idempotency, and authorization hardening`
- **9. Residual Risk:**
  - Compromised auditor credentials could expose confidential ledger data. Mitigated through short token lifespans (1 hour) and audit log monitoring.

---

### Threat ID: THREAT-007 – Floating-Point Math Rounding Drift & Precision Loss

- **Severity:** **HIGH** – Gradual corruption of financial balances and loss of money conservation due to binary floating-point representation.
- **1. Threat Description:**
  - Standard JavaScript `Number` types use IEEE-754 double-precision floating-point arithmetic. Binary floats cannot accurately represent decimal fractions (e.g. `0.1 + 0.2 === 0.30000000000000004`).
  - If a banking application stores or computes currency using floating-point numbers, rounding errors accumulate across transactions, causing accounts to lose or gain fractional cents/paise and breaking ledger reconciliation.
- **2. Attack Scenario:**
  - A user repeatedly transfers ₹0.10 between accounts. Over 10,000 transactions, IEEE-754 rounding drift introduces discrepancies between projected balances and historical ledger totals. An attacker exploits rounding anomalies to systematically drain fractional currency.
- **3. Potential Impact:**
  - Accounting discrepancies and broken money conservation invariants.
  - Accumulated financial loss across high-volume transactions.
  - Failure of mathematical ledger reconciliation (`SUM(credit) - SUM(debit) != balance`).
- **4. Existing Security Controls:**
  - Database schema: Amounts stored exclusively as integer minor units (`BIGINT` paise in PostgreSQL).
  - Runtime parsing: `pg.types.setTypeParser(20, ...)` converts PostgreSQL `BIGINT` directly to JavaScript native `BigInt`.
  - Utility constraints: `toPaise()` validates decimal input strings and converts them to exact integer paise without floating-point arithmetic.
- **5. Mitigation Strategy:**
  - *Implemented:* Floating-point math is banned from all financial pathways. Money is represented exclusively in minor units (integer paise: ₹1.00 = 100 paise). The application utilizes JavaScript `BigInt` for all calculations, assertions, and balance checks.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/unit/money.test.js` (8 unit tests verifying `toPaise`, `formatRupees`, `isPositivePaise`, zero-padding, and boundary conditions).
  - *Observed Result:* Exact string and BigInt conversions with zero precision loss.
- **7. Related Implementation Files:**
  - `backend/src/utils/money.js`
  - `backend/src/config/database.js`
  - `backend/src/database/migrations/002_create_accounts.sql`
  - `backend/src/database/migrations/003_create_ledger_entries.sql`
  - `backend/tests/unit/money.test.js`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
- **9. Residual Risk:**
  - None for single-currency INR paise operations. Multi-currency exchange rate conversions would require arbitrary-precision fixed-point math libraries in the future.

---

### Threat ID: THREAT-008 – Unauthorized Modification or Deletion of Ledger Records (Immutability Breach)

- **Severity:** **CRITICAL** – Altering historical financial ledger records invalidates accounting veracity and facilitates undetected fraud.
- **1. Threat Description:**
  - A core requirement of double-entry bookkeeping and financial compliance is that the financial ledger must be strictly append-only.
  - If a malicious actor, compromised service account, or rogue SQL query modifies (`UPDATE`) or deletes (`DELETE`, `TRUNCATE`) records in `ledger_entries`, historical auditability is lost and balances can be fraudulently forged.
- **2. Attack Scenario:**
  - An attacker exploits a vulnerability in the application to execute direct SQL, or an employee with access to the runtime database connection issues:
    `UPDATE ledger_entries SET amount = 1000 WHERE id = '...'` or `DELETE FROM ledger_entries WHERE entry_type = 'DEBIT'` or `TRUNCATE TABLE ledger_entries`
  - The attacker alters past transactions to conceal theft or falsify financial history.
- **3. Potential Impact:**
  - Irreversible corruption of financial history.
  - Fraud, embezzlement, and audit falsification.
  - Complete failure of financial compliance standards.
- **4. Existing Security Controls:**
  - PostgreSQL trigger: `trg_prevent_ledger_modification` firing `BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW`.
  - Database role privileges: Dedicated application runtime role `ledgerline_runtime` with revoked `UPDATE`, `DELETE`, and `TRUNCATE` permissions.
  - Application encapsulation: `LedgerRepository` implements only `create()` (append-only); no update or delete methods exist.
- **5. Mitigation Strategy:**
  - *Implemented (Dual-Layer Defense-in-Depth):*
    1. *Layer 1 (Database Role Least Privilege):* The application connects via dedicated role `ledgerline_runtime`, which has permissions strictly limited to `SELECT` and `INSERT`. Privileges for `UPDATE`, `DELETE`, and `TRUNCATE` are explicitly revoked (`REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM ledgerline_runtime`). PostgreSQL rejects attempts with error `42501 (insufficient_privilege)`.
    2. *Layer 2 (PostgreSQL Trigger Invariant):* The trigger function `prevent_ledger_modification()` intercepts any attempt to execute row-level `UPDATE` or `DELETE` on `ledger_entries` and raises an exception with SQLSTATE `23000 (integrity_constraint_violation)`.
  - *Distinction Between Trigger and Privilege Protection:*
    - The row-level trigger protects against `UPDATE` and `DELETE` on individual rows. However, in PostgreSQL, a row-level `FOR EACH ROW` trigger does **not** intercept table-level `TRUNCATE` statements. Protection against `TRUNCATE` is enforced separately by table-level privilege revocation (`REVOKE TRUNCATE`).
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/ledger_immutability.test.js`:
    - Verified `has_table_privilege('ledgerline_runtime', 'ledger_entries', ...)` confirms SELECT=true, INSERT=true, UPDATE=false, DELETE=false, TRUNCATE=false.
    - Verified direct SQL `UPDATE` fails with SQLSTATE `23000` / `42501`.
    - Verified direct SQL `DELETE` fails with SQLSTATE `23000` / `42501`.
    - Verified direct SQL `TRUNCATE` fails with SQLSTATE `42501`.
- **7. Related Implementation Files:**
  - `backend/src/database/migrations/007_prevent_ledger_modification.sql`
  - `backend/src/database/setup-runtime-role.js`
  - `backend/src/repositories/ledger.repository.js`
  - `backend/tests/integration/ledger_immutability.test.js`
- **8. Related Git Commit:**
  - `a5502e115a06298a620e8e2ccf53fed012a5eb8b` – `security: enforce database-level ledger immutability`
  - `e56267c6fe8cb289b0ff6f0166551097f870950b` – `feat(security): protect ledger from modifications`
- **9. Residual Risk:**
  - *Database Administrator / Cloud Owner Limitations:* In PostgreSQL, triggers and table privileges can be altered or dropped by users holding superuser or table-owner privileges (`neondb_owner`). A compromised migration credential (`DIRECT_URL`) or cloud database administrator can issue `ALTER TABLE ... DISABLE TRIGGER` or drop the table. Database-level immutability strictly protects against the application runtime role and regular SQL execution, but cannot defend against a compromised cloud database owner without write-once external hardware (WORM storage) or cryptographic ledger hashing.

---

### Threat ID: THREAT-009 – Privilege Escalation via Public Registration Role Injection

- **Severity:** **CRITICAL** – Direct compromise of administrative access, granting attackers full control over all system users, accounts, and audit logs.
- **1. Threat Description:**
  - Public registration endpoints allow new customers to create accounts. If the registration handler accepts client-supplied role values, an attacker can register an account with elevated permissions (`ADMIN` or `AUDITOR`).
- **2. Attack Scenario:**
  - An attacker submits a registration payload to `POST /api/v1/auth/register`:
    ```json
    {
      "fullName": "Malicious Admin",
      "email": "attacker@example.com",
      "password": "Password@123",
      "role": "ADMIN"
    }
    ```
  - If the schema does not reject the `role` field or the service passes it to the database query, the attacker is created as an `ADMIN`.
  - The attacker logs in, obtains an administrative JWT token, and accesses `GET /api/v1/admin/users`, freezes customer accounts, or accesses confidential audit logs.
- **3. Potential Impact:**
  - Complete takeover of application authorization.
  - Unauthorized manipulation of all accounts and users.
  - Unauthorized access to global financial records.
- **4. Existing Security Controls:**
  - Zod `.strict()` validation on `registerSchema`.
  - Controller-level parameter whitelisting.
  - Server-side hardcoded role assignment (`const role = 'ACCOUNT_HOLDER'`).
  - Parameterized database insertion query.
- **5. Mitigation Strategy:**
  - *Implemented (3-Layer Defense-in-Depth):*
    1. *Layer 1 (Schema Rejection):* `registerSchema` defines strictly required public fields (`fullName`, `email`, `password`) and appends `.strict()`. Any unexpected field (`role`, `isAdmin`, `permissions`) immediately fails validation with `400 Bad Request` (`Validation failed`).
    2. *Layer 2 (Controller Whitelisting):* `authController.register` explicitly destructures only `{ fullName, email, password }` from `req.body`, ensuring extra fields are discarded before reaching the service.
    3. *Layer 3 (Authoritative Service Enforcement):* In `authService.register()`, the role is unconditionally hardcoded: `const role = 'ACCOUNT_HOLDER'`. The backend is the sole authority for role assignment.
    4. *Provisioning Isolation:* `ADMIN` and `AUDITOR` accounts can only be provisioned via database seed scripts (`src/database/seed.js`).
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/auth.test.js` (18 automated tests):
    - Test A: Normal registration successfully assigns `ACCOUNT_HOLDER`.
    - Test B: Registration with `role: "ADMIN"` rejected with HTTP 400; zero database rows created.
    - Test C: Registration with `role: "AUDITOR"` rejected with HTTP 400; zero database rows created.
    - Test D: Alternative/lowercase role strings (`admin`, `auditor`, `SUPER_ADMIN`, `ROOT`) rejected with HTTP 400.
    - Test E: Privilege fields (`isAdmin: true`, `permissions: [...]`) rejected with HTTP 400.
    - Service Defense-in-Depth: Direct call to `authService.register` with `role: 'ADMIN'` forces `ACCOUNT_HOLDER` in the database.
- **7. Related Implementation Files:**
  - `backend/src/modules/auth/auth.validation.js`
  - `backend/src/modules/auth/auth.controller.js`
  - `backend/src/modules/auth/auth.service.js`
  - `backend/src/repositories/user.repository.js`
  - `backend/tests/integration/auth.test.js`
- **8. Related Git Commit:**
  - `1e54086d7941f5b73752296da57b1faa39426fce` – `fix: prevent privilege escalation in public registration with strict validation and server-side role enforcement`
- **9. Residual Risk:**
  - None for public registration. Any future administrative role-management endpoint must be protected with `authorize('ADMIN')` and dual-authorization approval.

---

### Threat ID: THREAT-010 – SQL Injection via Raw SQL Parameter Interpolation

- **Severity:** **CRITICAL** – Potential database compromise, arbitrary data leakage, or data destruction if raw SQL is improperly interpolated.
- **1. Threat Description:**
  - Because LedgerLine does not use an ORM (using native `pg` with raw SQL for fine-grained transaction control), any dynamic string concatenation or template literal interpolation in SQL queries would allow attackers to inject arbitrary SQL statements.
- **2. Attack Scenario:**
  - An attacker submits a malicious string in an account lookup or description field:
    `LL-ACC-1001' OR '1'='1` or `'; DROP TABLE ledger_entries; --`
  - If interpolated directly into a query string (`SELECT ... WHERE account_number = '${accNum}'`), the injected SQL executes in PostgreSQL, leaking all accounts or executing destructive DDL.
- **3. Potential Impact:**
  - Unauthorized data exfiltration across all tables.
  - Bypassing of authentication and authorization checks.
  - Modification or destruction of financial database records.
- **4. Existing Security Controls:**
  - 100% Parameterized SQL queries (`$1, $2, ...`) across all repository classes.
  - Zero SQL string interpolation in the entire codebase.
- **5. Mitigation Strategy:**
  - *Implemented:* All SQL queries in `account.repository.js`, `transaction.repository.js`, `ledger.repository.js`, `user.repository.js`, `idempotency.repository.js`, and `audit.repository.js` exclusively use parameterized queries with placeholder values (`$1, $2, ...`). The PostgreSQL driver sends parameters separately from the query text, guaranteeing that user input is treated strictly as literal data.
- **6. Verification and Test Evidence:**
  - *Verification Method: Code Inspection & Integration Test Suite.*
  - *Code Inspection:* Full audit of all 6 repository files confirmed 100% parameterized query usage (`$1, $2, ...`) with zero occurrences of template literal or string concatenation in SQL queries.
  - *Automated Tests:* Integration test suites pass user-supplied strings, special characters, and UUIDs through the repository layer without SQL syntax distortion.
  - *Verification Note:* While parameterized queries prevent SQL injection architecturally, dedicated automated SQL fuzzing/penetration testing (e.g. SQLmap or automated injection payloads against all endpoints) was not part of the challenge test suite.
- **7. Related Implementation Files:**
  - `backend/src/repositories/user.repository.js`
  - `backend/src/repositories/account.repository.js`
  - `backend/src/repositories/transaction.repository.js`
  - `backend/src/repositories/ledger.repository.js`
  - `backend/src/repositories/idempotency.repository.js`
  - `backend/src/repositories/audit.repository.js`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
- **9. Residual Risk:**
  - Developer error introducing string interpolation in future custom queries. Mitigated by strict code review standards and static code analysis (e.g. ESLint security plugins).

---

### Threat ID: THREAT-011 – Negative, Zero, or Non-Integer Transaction Amount Tampering

- **Severity:** **HIGH** – Reversal of financial operations, converting debits to credits and subverting transaction semantics.
- **1. Threat Description:**
  - If financial endpoints accept negative amounts, a transfer of -₹500.00 would debit the recipient and credit the sender, effectively inverting the transfer and stealing money without authorization.
  - Zero amounts pollute the financial ledger with meaningless zero-value entries.
- **2. Attack Scenario:**
  - An attacker calls `POST /api/v1/transactions/transfer` with `{"amount": "-500.00"}`.
  - If the application executes `newBalance = balance - (-500.00)`, the sender's balance increases by ₹500.00 while the victim's balance decreases.
- **3. Potential Impact:**
  - Theft of funds through inverse debiting.
  - Corruption of financial balances.
  - Database pollution with zero-value transactions.
- **4. Existing Security Controls:**
  - Zod request validation regex (`/^\d+(\.\d{1,2})?$/`) ensuring positive decimal strings.
  - `toPaise()` utility validating `isPositivePaise()`.
  - Database `CHECK (amount > 0)` constraint on `transactions` and `ledger_entries` tables.
- **5. Mitigation Strategy:**
  - *Implemented:* Multi-layered validation:
    1. Validation layer: Zod schema rejects negative numbers, scientific notation, and non-numeric strings with `400 Bad Request`.
    2. Utility layer: `toPaise()` validates that converted integer minor units are strictly greater than zero (`amountPaise > 0n`).
    3. Database layer: PostgreSQL check constraint `CHECK (amount > 0)` ensures that any attempt to insert a non-positive amount throws an integrity constraint violation.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/transactions.test.js` & `tests/unit/money.test.js`:
    - Zero amounts rejected with HTTP 400.
    - Negative amounts rejected with HTTP 400.
    - Invalid decimal representations rejected with HTTP 400.
- **7. Related Implementation Files:**
  - `backend/src/modules/transactions/transaction.validation.js`
  - `backend/src/utils/money.js`
  - `backend/src/database/migrations/003_create_ledger_entries.sql`
  - `backend/src/database/migrations/004_create_transactions.sql`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
- **9. Residual Risk:**
  - Excessively large transaction amounts. Mitigated by maximum per-transaction limits in validation schemas.

---

### Threat ID: THREAT-012 – Authentication Token Tampering, Replay & Deactivated User Access

- **Severity:** **HIGH** – Unauthorized session hijacking, forged authorization claims, or continued access by terminated users.
- **1. Threat Description:**
  - If JWT tokens are verified solely based on client-presented payload claims without validating signature integrity, attackers can forge admin roles.
  - If tokens are not cross-referenced against active database records, deactivated employees or suspended users retain API access until token expiration.
- **2. Attack Scenario:**
  - An attacker intercepts a valid user token and alters the payload to `{"role": "ADMIN"}` without resigning it with `JWT_SECRET`.
  - Alternatively, an employee is terminated and their user account is deactivated (`is_active = false`), but they continue calling APIs using an unexpired JWT token issued prior to termination.
- **3. Potential Impact:**
  - Unauthorized administrative and operational access.
  - Continued illicit access by terminated employees.
- **4. Existing Security Controls:**
  - Cryptographic signature verification using HMAC-SHA256 with strong server-side `JWT_SECRET`.
  - Explicit expiration verification (`TokenExpiredError`).
  - Real-time database check on every request verifying `user.is_active === true`.
- **5. Mitigation Strategy:**
  - *Implemented:*
    1. In `authenticate.js` middleware, `jwt.verify(token, env.JWT_SECRET)` validates cryptographic integrity. Tampered tokens fail verification and return `401 Unauthorized`.
    2. The middleware extracts `decoded.id` and queries `userRepository.findById(decoded.id)`. If the user does not exist or `user.is_active !== true`, the request is aborted with `403 Forbidden ('User account is deactivated')`. Token claims are never trusted blindly.
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/auth.test.js`:
    - Tampered token signature fails with HTTP 401.
    - Expired token fails with HTTP 401 (`Authentication token has expired`).
    - Deactivated user with valid token fails with HTTP 403 (`User account is deactivated`).
- **7. Related Implementation Files:**
  - `backend/src/middleware/authenticate.js`
  - `backend/src/modules/auth/auth.service.js`
  - `backend/tests/integration/auth.test.js`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
  - `1e54086d7941f5b73752296da57b1faa39426fce` – `fix: prevent privilege escalation in public registration with strict validation and server-side role enforcement`
- **9. Residual Risk:**
  - JWT tokens cannot be revoked individually before expiration unless a token blacklist/revocation table is implemented. Mitigated by short token lifetime (1 hour).

---

### Threat ID: THREAT-013 – Denial of Service via Request Flooding & Connection Exhaustion

- **Severity:** **MEDIUM** – Temporary API degradation, server unresponsive states, and database connection pool starvation.
- **1. Threat Description:**
  - Malicious actors or aggressive automated scripts can flood the API with thousands of rapid requests, exhausting server memory, CPU, or Neon PostgreSQL connection pool limits, denying service to legitimate customers.
- **2. Attack Scenario:**
  - An attacker runs a multi-threaded script dispatching thousands of requests per second to `/api/v1/auth/login` (brute-forcing passwords) or `POST /api/v1/transactions/transfer`, saturating the 10-connection PostgreSQL pool and crashing the Node.js event loop.
- **3. Potential Impact:**
  - Application slowdown or temporary service unavailability.
  - Inability for legitimate customers to execute transfers.
  - Database connection timeout errors.
- **4. Existing Security Controls:**
  - Multi-tier rate limiting via `express-rate-limit`:
    - `generalLimiter`: 100 requests per 15 minutes globally.
    - `authLimiter`: 20 requests per 15 minutes on authentication endpoints.
    - `transactionLimiter`: 60 requests per minute on financial endpoints.
  - Request body size limit: `express.json({ limit: '1mb' })`.
  - Database pool configuration: `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.
- **5. Mitigation Strategy:**
  - *Implemented:*
    1. Express rate-limiting middleware throttles excessive single-IP traffic and returns `429 Too Many Requests`.
    2. Payload body limits (1MB) prevent memory exhaustion via large JSON payloads.
    3. Connection pool timeouts ensure leaked or slow connections are closed before exhausting the pool.
- **6. Verification and Test Evidence:**
  - *Verification Method: Code Inspection & Manual Sanity Testing.*
  - *Code Inspection:* Verified configuration in `backend/src/middleware/rateLimiter.js` and registration in `backend/src/app.js`.
  - *Important Verification Distinctions:*
    - Basic rate-limiting middleware is implemented in code, but automated 429 assertion suites were deliberately excluded from the standard Jest test run to avoid throttling subsequent integration tests.
    - Heavy volumetric load testing and PostgreSQL connection pool starvation under extreme traffic (e.g. 10,000+ simultaneous requests via k6 or Autocannon) have **not been tested** in the current challenge environment.
    - Application-level IP rate limiting does **not** protect against distributed denial-of-service (DDoS) across rotating IP addresses.
- **7. Related Implementation Files:**
  - `backend/src/middleware/rateLimiter.js`
  - `backend/src/app.js`
  - `backend/src/config/database.js`
- **8. Related Git Commit:**
  - `a0d9f05fc2722669f1f09e00819732aaa035763e` – `feat: initialize backend database infrastructure and integration test suite`
- **9. Residual Risk:**
  - True distributed denial of service (DDoS) across botnets cannot be prevented by application-level IP limiters alone. Requires edge WAF / CDN protection (e.g. Cloudflare, AWS Shield) in production.

---

### Threat ID: THREAT-014 – Sensitive Credential Exposure via Logs, Configuration, or Error Responses

- **Severity:** **MEDIUM** – Information disclosure of database connection strings, JWT secrets, customer PII, or internal stack traces.
- **1. Threat Description:**
  - Verbose error handling or unredacted logging can leak database passwords, JWT secrets, internal file paths, or customer account balances to external API callers or server log files.
- **2. Attack Scenario:**
  - An attacker sends a malformed query to trigger a database error. The server returns an uncaught exception stack trace exposing PostgreSQL server credentials, database hostnames, or internal code paths.
- **3. Potential Impact:**
  - Exposure of critical infrastructure credentials.
  - Facilitation of secondary targeted attacks via system reconnaissance.
  - Violation of data privacy regulations.
- **4. Existing Security Controls:**
  - Centralized error-handling middleware (`errorHandler.js`).
  - URL sanitizer `sanitizeUrl()` in `src/config/env.js`.
  - Bcrypt password hashing (12 salt rounds); raw passwords never persisted or returned.
  - `.gitignore` preventing `.env` commits.
  - TLS/SSL database connection with certificate validation.
- **5. Mitigation Strategy:**
  - *Component Breakdown:*
    1. *Error Masking (`errorHandler.js`):* In production (`NODE_ENV === 'production'`), `errorHandler` suppresses internal error details, returning generic messages (`Database error occurred`) and omits `stack` traces from JSON responses. In development, stack traces are exposed strictly for debugging.
    2. *URL Sanitization (`env.js`):* `sanitizeUrl()` normalizes database connection strings, trims surrounding quotes, and automatically upgrades legacy `sslmode=require` flags to `sslmode=verify-full`. It does **not** redact passwords in log strings (which must be handled by avoiding raw URL printing).
    3. *Password Hashing (`auth.service.js`):* Passwords are encrypted with bcrypt (12 rounds) before storage. `formatUserResponse` explicitly omits `password_hash` from all user API responses.
    4. *TLS/SSL Configuration (`database.js`):* Database connection uses Neon PostgreSQL with TLS/SSL. In `database.js`, SSL settings enforce certificate validation (`rejectUnauthorized: true`).
- **6. Verification and Test Evidence:**
  - *Automated Tests:* `tests/integration/auth.test.js` verified that `GET /api/v1/auth/me` and registration responses omit `password_hash`.
  - *Code Inspection:* Verified error masking logic in `errorHandler.js` and SSL configuration in `database.js` and `env.js`.
- **7. Related Implementation Files:**
  - `backend/src/middleware/errorHandler.js`
  - `backend/src/config/env.js`
  - `backend/src/config/database.js`
  - `backend/src/modules/auth/auth.service.js`
  - `backend/.gitignore`
- **8. Related Git Commit:**
  - `01dca5aec13d757100e1de0544d3ce9e0c55c2d2` – `fix(backend): resolve API routing and startup issues`
- **9. Residual Risk:**
  - Accidental inclusion of sensitive variables in future `console.log` statements during debugging. Mitigated by structured Pino logger standards.

---

## Security Assessment Summary

### Threat Distribution by Severity

| Severity Level | Threat Count | Threat IDs | Implemented & Verified |
| :--- | :---: | :--- | :---: |
| **CRITICAL** | **6** | THREAT-001, THREAT-003, THREAT-004, THREAT-008, THREAT-009, THREAT-010 | **6 / 6** |
| **HIGH** | **5** | THREAT-005, THREAT-006, THREAT-007, THREAT-011, THREAT-012 | **5 / 5** |
| **MEDIUM** | **3** | THREAT-002, THREAT-013, THREAT-014 | **3 / 3** |
| **LOW** | **0** | — | — |
| **TOTAL** | **14** | **All 14 threats evaluated** | **14 / 14** |

### Implementation and Verification Breakdown

- **Threats Verified by Automated Tests (11 threats):**
  - THREAT-001 (Concurrency Overdraft): `concurrency.test.js` (Test D)
  - THREAT-002 (Deadlock Ordering): `concurrency.test.js` (Test E)
  - THREAT-003 (Idempotency Retries): `idempotency.test.js` (Tests A, B, C)
  - THREAT-004 (Double-Entry Atomicity): `transactions.test.js`, `ledger_immutability.test.js`
  - THREAT-005 (Account-Level IDOR): `authorization.test.js` (Test F), `account_number_transfer.test.js`
  - THREAT-006 (Auditor Privilege Denial): `authorization.test.js` (Test G)
  - THREAT-007 (Floating-Point Precision): `money.test.js` (8 tests)
  - THREAT-008 (Ledger Immutability Trigger & Role): `ledger_immutability.test.js` (8 tests)
  - THREAT-009 (Registration Privilege Escalation): `auth.test.js` (18 tests)
  - THREAT-011 (Negative/Zero Amounts): `transactions.test.js`, `money.test.js`
  - THREAT-012 (Token Tampering & Deactivation): `auth.test.js`
- **Threats Verified by Code Inspection & Hybrid Validation (3 threats):**
  - THREAT-010 (SQL Injection): Verified 100% parameterized queries across all repositories; automated fuzzing test suite was not implemented.
  - THREAT-013 (DoS & Rate Limiting): Verified middleware registration and configuration; volumetric connection pool exhaustion was not tested under automated load.
  - THREAT-014 (Sensitive Credential & Error Exposure): Password hash exclusion verified by automated tests; production error stack suppression and SSL configuration verified by code inspection.

---

## Client-Side & Frontend Security Assessment (Phases 4–6)

Following the implementation and regression testing of the React 19 frontend, the client-side security architecture and threat posture were evaluated across 8 critical dimensions:

### 1. Token Storage & XSS Considerations
- **Implementation:** Short-lived JWT access tokens are held exclusively in-memory (`inMemoryAccessToken` closure variable in `frontend/src/services/api.js`). Access tokens are never written to `localStorage`, `sessionStorage`, or client-accessible cookies. Outgoing requests automatically inject the token via the `Authorization: Bearer <token>` header in Axios request interceptors.
- **Security Assessment:**
  - In-memory token storage prevents persistent token extraction via local browser storage attacks. Any full page reload or tab closure instantly destroys the access token in memory.
  - XSS attacks cannot exfiltrate persistent credentials from browser storage because neither `localStorage` nor `sessionStorage` hold session tokens.
- **Controls & Mitigations:**
  - Complete elimination of raw DOM injection: The codebase contains zero instances of `dangerouslySetInnerHTML`.
  - Zero dynamic script execution: Codebase contains zero instances of `eval()`, `new Function()`, or untrusted script evaluation.
  - React 19 auto-escapes all string interpolations in JSX by default.
  - All user-supplied inputs (e.g. transaction descriptions, account numbers) are sanitized and rendered as escaped text.
  - Refresh tokens are transmitted strictly via encrypted, `HttpOnly`, `SameSite=Strict`, `Secure` cookies inaccessible to JavaScript.
- **Residual Risk:** An active in-memory XSS exploit while the browser tab is open could attempt to make unauthorized API calls during that tab session. Mitigated by strict JSX escaping and CSP headers.

### 2. Token Expiration & Refresh Token Rotation with Breach Detection
- **Implementation:** Dual-token authentication model with rotating refresh tokens:
  - Short-lived JWT access tokens (15-minute validity) are held in JavaScript memory.
  - Cryptographically secure 40-byte random refresh tokens are stored hashed (SHA-256) in the database (`refresh_tokens` table via migration `008_create_refresh_tokens.sql`) and transported via an `HttpOnly`, `SameSite=Strict`, `Path=/api/v1/auth`, `Secure` cookie (`refreshToken`).
  - Refresh rotation endpoint (`POST /api/v1/auth/refresh`) issues a new access token and simultaneously rotates the refresh token, revoking the previous one (`revoked_at = NOW()`, `replaced_by_token_hash`).
- **Security Assessment & Automated Breach Detection:**
  - **Token Reuse Detection:** If an adversary attempts to present an already revoked refresh token that has been replaced by a successor, the system detects a token reuse breach. It immediately revokes **all** active refresh tokens and sessions for that user (`refreshTokenRepository.revokeAllForUser`), terminates the adversary's connection, and writes a high-priority audit security event (`AUTH_REFRESH_TOKEN_REUSE_DETECTED`).
  - **Single Flight Refresh Concurrency:** The Axios response interceptor queues concurrent requests during an in-flight token refresh (`isRefreshing`, `refreshSubscribers`), ensuring only a single `/auth/refresh` round-trip occurs without race conditions or token collision.
  - **Session Invalidation:** On explicit user logout (`POST /api/v1/auth/logout`), the refresh token is immediately revoked in the database, the `refreshToken` cookie is cleared with `Max-Age=0`, and the in-memory access token is set to `null`.
- **Residual Risk:** Low. Protected by rotation, server-side revocation tracking, single-flight mutexing, and breach detection.

### 3. Password Policy & Registration Role Escalation
- **Implementation:**
  - Frontend `Register/index.jsx` enforces an identical password complexity regex (`/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/`) prior to network submission.
  - The service strictly submits `{ fullName, email, password }`, deliberately omitting any role field.
- **Security Assessment:**
  - Even if a malicious actor crafts a manual HTTP request containing `{"role": "ADMIN"}`, the backend Zod validator utilizes `.strict()`, rejecting the payload with HTTP 400.
  - Furthermore, `AuthService.register()` hardcodes `const role = 'ACCOUNT_HOLDER'`, making client role elevation impossible.
- **Residual Risk:** None. Enforced strictly at the database and API gateway layers.

### 4. Client Route Guards vs. Backend Authorization Authority
- **Implementation:** React Router guards (`ProtectedRoute` and `RoleBasedRoute`) prevent unauthorized views from rendering and navigate unauthenticated users to `/login`.
- **Security Assessment:**
  - Client-side route guards are treated exclusively as UI navigation aids and user experience enhancements.
  - All sensitive data queries (`/admin/users`, `/admin/accounts`, `/ledger`, `/audit-events`) and mutations (`/transactions/*`) are authenticated and authorized by backend middleware (`authenticate`, `authorize`, `authorizeAccountAccess`).
- **Residual Risk:** Even if an attacker modifies React state in browser memory to display an Admin page, the underlying API calls return HTTP 403 Forbidden.

### 5. Account Ownership & IDOR Protection
- **Implementation:** Account statements are requested via `GET /api/v1/statements/:accountNumber`.
- **Security Assessment:**
  - Frontend prevents selecting unowned accounts by populating dropdowns exclusively from `/accounts`.
  - When an account holder manually modifies the browser URL to inspect another customer's statement (e.g. `/statements/LL-ACC-2001`), the backend middleware `authorizeAccountAccess` inspects `account.owner_id !== req.user.id` and rejects the request with HTTP 403 Forbidden (`You do not have permission to access this account`).
- **Residual Risk:** None. Enforced at the SQL query parameterization layer.

### 6. Transaction Validation & Idempotency Key Handling
- **Implementation:** Financial transaction forms generate unique client keys (`IDEM-<timestamp>-<random>`) transmitted via the `Idempotency-Key` header.
- **Security Assessment:**
  - Duplicate form submissions or rapid double-clicks replay the cached response without creating duplicate ledger postings.
  - Modifying the transaction amount while reusing the key is detected via SHA-256 request hashing, triggering HTTP 409 Conflict.
- **Residual Risk:** Keys are stored in the database indefinitely unless pruned by a background task.

### 7. Open Redirect Defense
- **Implementation:** `Login/index.jsx` inspects `location.state?.from?.pathname` before redirection using `isSafeInternalPath()`.
- **Security Assessment:**
  - Disallows redirect targets that contain protocol schemes (`https://`), protocol-relative prefixes (`//`), backslashes (`\`), or colons (`:`).
  - Ensures redirects only route to internal paths (e.g. `/dashboard`, `/statements/LL-ACC-1001`).
- **Residual Risk:** None.

### 8. Rate Limiting & User Feedback
- **Implementation:** Backend rate limiters (`authLimiter`, `transactionLimiter`, `generalLimiter`) return standard `RateLimit-*` headers and HTTP 429.
- **Security Assessment:**
  - Frontend `getErrorMessage()` catches HTTP 429 and displays a sanitized, clear alert: `"Rate limit exceeded: Too many requests. Please wait a few moments before retrying."`
- **Residual Risk:** Rate limiting counters reside in Node.js process memory and reset upon server restart.

---

## Security Limitations of Current Implementation

While the core financial engine, concurrency safeguards, and authorization boundaries are verified, the following architectural limitations should be recognized:

1. **In-Memory Rate Limiting:** The `express-rate-limit` middleware stores request counts in Node.js process memory. In a multi-instance, load-balanced production environment, rate limits are not shared across server nodes without a distributed store (e.g. Redis).
2. **Stateless JWT Invalidation:** JWT tokens cannot be revoked individually before their expiration timestamp unless the user account itself is deactivated (`is_active = false`). There is currently no distributed token blocklist for immediate single-session logout.
3. **Single-Currency Engine:** All money calculations assume Indian Rupees (INR) represented in integer paise. The system does not currently support multi-currency accounts or real-time foreign exchange conversions.
4. **Database-Level Immutability Limitations:** PostgreSQL row-level triggers do not intercept `TRUNCATE` (which is guarded by role permissions), and neither triggers nor role privileges can prevent a superuser or database owner (`neondb_owner`) from disabling triggers or modifying tables directly.
5. **Absence of Dedicated Load / Penetration Testing:** The current test harness verifies functional correctness, race condition safety, and authorization boundaries, but does not include automated volumetric DDoS or automated SQL injection fuzzing tools.

---

## Future Security Improvements

The following improvements are recommended for future enterprise production milestones:

1. **Distributed Rate Limiting:** Connect `express-rate-limit` to a shared Redis cluster to enforce global rate limits across multiple container instances.
2. **JWT Revocation Blocklist / Refresh Tokens:** Implement short-lived access tokens (15 minutes) paired with rotating refresh tokens stored in PostgreSQL or Redis to enable immediate session termination.
3. **Automated Idempotency Key Pruning:** Add a scheduled background cron job to archive and purge `idempotency_keys` older than 48 hours to prevent unbounded table growth.
4. **Multi-Factor Authentication (MFA/2FA):** Implement TOTP-based two-factor authentication (e.g. authenticator apps) for administrative accounts (`ADMIN`, `AUDITOR`) and high-value transfers.
5. **Edge Web Application Firewall (WAF):** Place an edge WAF (e.g. Cloudflare or AWS WAF) in front of the application to filter volumetric DDoS attacks and automated credential-stuffing botnets.
6. **Automated Security Scanning:** Integrate automated DAST/SAST security scanning (e.g. OWASP ZAP, Snyk, SonarQube) into the CI/CD pipeline.
