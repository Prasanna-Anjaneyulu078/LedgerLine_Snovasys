# LedgerLine: Threat Model & Financial Security Mitigations (THREATS.md)

This document analyzes security, integrity, and concurrency threats to LedgerLine, their implemented architectural mitigations, residual risks, and the automated test suites verifying their prevention.

---

## Security Verification Matrix (Day 2 Hardening)

| Threat Category | Scenario / Attack Vector | Mitigation Architecture | Verification Test Suite | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Duplicate Requests** | Same-key sequential retry replay | PostgreSQL `idempotency_keys` table with `UNIQUE(user_id, idempotency_key)` + cached HTTP response payload | `tests/integration/idempotency.test.js` (Test A) | **VERIFIED** |
| **Duplicate Requests** | Same-key concurrent retry race (`Promise.all`) | Atomic in-flight lock row reservation, unique constraint serialization, exactly one transaction committed | `tests/integration/idempotency.test.js` (Test B) | **VERIFIED** |
| **Payload Manipulation** | Same key with altered amount/destination | SHA-256 hash comparison across canonical operation and parameters; mismatch triggers `409 Conflict` | `tests/integration/idempotency.test.js` (Test C) | **VERIFIED** |
| **Race Conditions** | Racing withdrawals exceeding balance | PostgreSQL `BEGIN ... FOR UPDATE` row locks + DB constraint `CHECK (balance >= 0)`; exactly 1 succeeds | `tests/integration/concurrency.test.js` (Test D) | **VERIFIED** |
| **Deadlocks** | Simultaneous opposite transfers (A→B & B→A) | Deterministic UUID lock ordering (`ORDER BY id ASC FOR UPDATE`) eliminates circular waits (`40P01`) | `tests/integration/concurrency.test.js` (Test E) | **VERIFIED** |
| **Broken Access / IDOR** | Cross-user account inspection, withdrawal, transfer | Server-side `authorizeAccountAccess` middleware + source account owner verification against `req.user.id` (`403`) | `tests/integration/authorization.test.js` (Test F) | **VERIFIED** |
| **Auditor Misuse** | Auditor attempts deposit, withdrawal, or transfer | Strict RBAC blocking auditors from money-moving endpoints (`403 Forbidden`); read-only inspection allowed | `tests/integration/authorization.test.js` (Test G) | **VERIFIED** |
| **Privilege Escalation** | Public registration role injection (`role: ADMIN`) | Strict Zod validation (`.strict()`) + controller whitelisting + server-enforced `role = 'ACCOUNT_HOLDER'` | `tests/integration/auth.test.js` (Test H) | **VERIFIED** |
| **Ledger Tampering** | SQL `UPDATE` / `DELETE` on `ledger_entries` | Dual-layer: restricted runtime role (`REVOKE UPDATE, DELETE`) + PostgreSQL engine trigger `trg_prevent_ledger_modification` | `tests/integration/ledger_immutability.test.js` | **VERIFIED** |
| **Account Probing & IDOR**| Public account-number transfer manipulation | Format regex, source ownership validation, deterministic UUID resolution, and refusal audit logging | `tests/integration/account_number_transfer.test.js` | **VERIFIED** |

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

---

### Threat 8: Ledger Record Modification or Deletion (Ledger Immutability Breach)
- **Threat Vector**: A malicious actor, compromised application runtime credentials, SQL injection attack, or rogue internal service attempts to execute `UPDATE` or `DELETE` statements on the `ledger_entries` table to manipulate balances, alter financial statements, or purge historical records.
- **Mitigation (Defense-in-Depth)**:
  1. **Database Role Privileges (Layer 1)**:
     - Dedicated restricted application runtime role (`ledgerline_runtime`) used by the running service.
     - Runtime role has strictly least-privilege permissions: `SELECT` and `INSERT` on `ledger_entries`.
     - Explicitly revoked `UPDATE`, `DELETE`, and `TRUNCATE` privileges on `ledger_entries`.
     - The runtime role does NOT own the tables, schema, or trigger functions, preventing privilege escalation, schema modification, or trigger disabling (PostgreSQL rejects attempts with error `42501 (insufficient_privilege)`).
  2. **Database Engine Trigger Invariant (Layer 2)**:
     - PostgreSQL row-level trigger `trg_prevent_ledger_modification` executing `prevent_ledger_modification()` `BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW`.
     - Even if an update or delete query is issued by the database owner (`neondb_owner`) or another privileged account, the trigger intercepts the operation and raises an exception with SQLSTATE `23000 (integrity_constraint_violation)`.
  3. **Application Layer (Layer 3)**:
     - `LedgerRepository` exposes strictly append-only write operations (`create`). No update or delete operations are implemented in the codebase.
- **Residual Risk**: A database administrator with superuser/owner privileges could drop the trigger or alter table permissions directly in PostgreSQL. Mitigated through separation of owner/migration credentials (`DIRECT_URL`) from runtime credentials (`DATABASE_URL`), cloud audit logging, and external immutable backups.
- **Automated Verification**: `tests/integration/ledger_immutability.test.js` (`Database-Level Append-Only Ledger Immutability & Role Permission Tests`).
- **Status**: Verified.

---

### Threat 9: Account-Number Enumeration, IDOR, and Unauthorized Source Debiting
- **Threat Vector**: A malicious user supplies another customer's account number as the `sourceAccountNumber` in a transfer payload or probes arbitrary `destinationAccountNumber` values to discover valid customer account numbers.
- **Mitigation**:
  1. **Source Account Ownership Verification**: In `transactionService.transfer()`, the source account is resolved and compared against authenticated `user.id`. Unless the caller is an `ADMIN`, any attempt to specify an account owned by another customer aborts immediately with `403 Forbidden` (`You are not authorized to transfer from this account`).
  2. **Refusal Auditing**: The unauthorized transfer attempt is permanently recorded in `audit_events` with the caller's ID and attempted parameters.
  3. **Strict Validation & Lifecycle Checking**: Both source and destination account numbers are validated via regex format constraints (`LL-ACC-XXXX`). Non-existent accounts return `404 Not Found`, identical source and destination accounts return `400 Bad Request`, and frozen/suspended accounts return `400 Bad Request`.
  4. **Internal Deadlock Prevention Maintained**: User-supplied account numbers are resolved to database rows, and locks are acquired in canonical UUID order (`findTwoForUpdate`) inside an atomic database transaction.
- **Residual Risk**: High-frequency probing of destination account numbers; mitigated by express rate limiters on API routes.
- **Automated Verification**: `tests/integration/account_number_transfer.test.js` (20 integration tests covering unauthorized transfer, inactive accounts, same account transfer, invalid formats, concurrent serialization, and money conservation).
- **Status**: Verified.

---

### Threat 10: Privilege Escalation Through Public Registration
- **Threat Vector**: A malicious actor registers a new user via `POST /api/v1/auth/register` and injects a privileged role in the HTTP request payload (e.g. `{"role": "ADMIN"}` or `{"role": "AUDITOR"}`), alternative case variations (`"admin"`, `"auditor"`, `"SUPER_ADMIN"`), or elevated privilege flags (`{"isAdmin": true}`, `{"permissions": ["*"]}`, `{"isVerified": true}`). If client-supplied role values are accepted, stripped without strict rejection, or forwarded to the database insertion query, an unauthorized user gains administrative or audit rights.
- **Potential Impact**: Complete compromise of system authorization boundaries. An attacker registering as `ADMIN` gains total control over system users and accounts, including freezing/unfreezing customer accounts and viewing all system-wide financial accounts. An attacker registering as `AUDITOR` obtains unauthorized visibility into the global financial ledger and institution-wide audit trail.
- **Root Cause**:
  1. Insecure validation schema: `registerSchema` previously defined an optional `role` enum (`z.enum(['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR']).default('ACCOUNT_HOLDER').optional()`) and omitted `.strict()`, allowing clients to provide trusted roles directly in the payload.
  2. Direct parameter passthrough: The controller forwarded the raw request body to the service layer, and `authService.register({ fullName, email, password, role = 'ACCOUNT_HOLDER' })` unpacked the client-supplied role and passed it directly to `userRepository.create()`, allowing client input to dictate database insertion values.
- **Mitigation (Defense-in-Depth)**:
  1. **Strict Zod Validation (Layer 1)**: In `src/modules/auth/auth.validation.js`, `registerSchema` defines strictly required public fields (`fullName`, `email`, `password`) and enforces `.strict()`. Any unexpected or privilege-related fields (`role`, `isAdmin`, `permissions`, `isVerified`, etc.) are rejected immediately with `400 Bad Request` (`Validation failed`).
  2. **Controller-Level Input Whitelisting (Layer 2)**: In `src/modules/auth/auth.controller.js`, the register handler explicitly destructures only trusted fields `{ fullName, email, password }` from `req.body`, ensuring client-injected parameters cannot reach the service.
  3. **Authoritative Server-Side Role Enforcement (Layer 3)**: In `src/modules/auth/auth.service.js`, public registration unconditionally and immutably binds `const role = 'ACCOUNT_HOLDER'`. The service ignores any client-supplied role parameter, eliminating any mechanism for public registration to assign `ADMIN` or `AUDITOR` roles.
  4. **Parameterized SQL Insertion (Layer 4)**: The database query in `userRepository.create` uses parameterized SQL (`$1, $2, $3, $4`) with the server-enforced role bound to `$4`, respecting database-level `CHECK (role IN ('ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'))` constraints while preventing SQL injection.
  5. **Privileged Account Provisioning Safeguard**: `ADMIN` and `AUDITOR` accounts can only be provisioned through secure, administrative seed migrations (`src/database/seed.js`), and existing user roles are strictly protected against modification.
- **Residual Risk**: None for public registration. Any future role-management endpoints must require strict `ADMIN` authorization.
- **Automated Verification**: `tests/integration/auth.test.js` (`Public Registration Flow & Role Escalation Prevention` covering Test A normal registration, Test B ADMIN injection rejection, Test C AUDITOR injection rejection, Test D alternative role strings, Test E privilege fields, service-layer defense-in-depth, password hashing, and token claims).
- **Status**: Verified.




