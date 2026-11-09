# LedgerLine: API Documentation

- **Axios Base URL**: `http://localhost:5000/api/v1` (Local) / `/api/v1` (Production)
- **API Service Paths**: Paths are relative to `baseURL` (`/auth/register`, `/accounts`, etc.)
- **Health Check Endpoint**: `http://localhost:5000/health` (Unversioned root endpoint outside `/api/v1`)
- **Interactive Swagger UI**: `http://localhost:5000/api-docs`

---

## Role Permissions Matrix & Separation of Duties

LedgerLine strictly enforces separation of concerns across three core system roles in compliance with financial integrity standards:

| Capability / Endpoint | `ACCOUNT_HOLDER` | `ADMIN` | `AUDITOR` | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Deposit Funds** (`POST /transactions/deposit`) | **Allowed** (Own account) | **Forbidden (403)** | **Forbidden (403)** | Financial money-movement restricted to account owners |
| **Withdraw Funds** (`POST /transactions/withdraw`) | **Allowed** (Own account) | **Forbidden (403)** | **Forbidden (403)** | Financial money-movement restricted to account owners |
| **Transfer Funds** (`POST /transactions/transfer`) | **Allowed** (Source owner) | **Forbidden (403)** | **Forbidden (403)** | Balanced double-entry transfer (intra-user or inter-user) |
| **Verify Recipient Account** (`GET /accounts/recipient/:accNum`) | **Allowed** | **Allowed** | **Allowed** | Safe verification returning non-sensitive recipient details |
| **List Accounts** (`GET /accounts`) | **Own Accounts** | **All Accounts** | **All Accounts** | Scoped by ownership for Account Holders; system-wide for Admin/Auditor |
| **Get Account Balance** (`GET /accounts/:id/balance`) | **Own Account** | **All Accounts** | **All Accounts** | Real-time balance computed with audit verification |
| **Account Statements** (`GET /statements/:accountNumber` or `GET /accounts/:id/statement`) | **Own Account** | **All Accounts** | **All Accounts** | Complete running balance with posted and refused records, pagination, and period summary |
| **List Transactions** (`GET /transactions`) | **Own Transactions** | **All Transactions** | **All Transactions** | Scoped by participant accounts for Account Holders |
| **Transaction Details** (`GET /transactions/:id`) | **Participant Only** | **All Transactions** | **All Transactions** | Includes associated double-entry ledger entries |
| **Global Ledger Journal** (`GET /ledger`) | **Forbidden (403)** | **Allowed** | **Allowed** | Immutable double-entry journal inspection |
| **System Audit Trail** (`GET /audit-events`) | **Forbidden (403)** | **Allowed** | **Allowed** | Complete security and operational event trail |
| **Admin Analytics** (`GET /admin/dashboard`) | **Forbidden (403)** | **Allowed** | **Forbidden (403)** | Institutional system telemetry and volume metrics |
| **Manage Users** (`GET/PATCH /admin/users`) | **Forbidden (403)** | **Allowed** | **Forbidden (403)** | User lifecycle and activation management |
| **Manage Account Status** (`PATCH /admin/accounts/:id/status`) | **Forbidden (403)** | **Allowed** | **Forbidden (403)** | Administrative holds, freezes, and suspensions |

---

## Endpoint-to-Screen Mapping (Full Architecture)

The following matrix documents every UI screen, user action, underlying backend endpoint, HTTP method, authorization policy, mutation status, money effect, and audit logging behavior:

| Screen Name | User Action | Actual Backend Endpoint | Method | Supported Roles | Data Returned | Modifies Data? | Money Effect | Produces Audit Event? |
| :--- | :--- | :--- | :---: | :---: | :--- | :---: | :--- | :---: |
| **Login** | Submit login credentials | `/api/v1/auth/login` | `POST` | Public | User profile + JWT token | Yes (sessions) | None | Yes (`AUTH_LOGIN_SUCCESS` / `AUTH_LOGIN_FAILURE`) |
| **Register** | Register new identity | `/api/v1/auth/register` | `POST` | Public | Created user + JWT token | Yes (users table) | None | Yes (`AUTH_REGISTER_SUCCESS` / `AUTH_REGISTER_FAILURE`) |
| **Profile** | View session profile | `/api/v1/auth/me` | `GET` | All authenticated | Current user details & role | No | None | No |
| **Account Holder Dashboard** | Load accounts & recent txns | `/api/v1/accounts`, `/api/v1/transactions` | `GET` | `ACCOUNT_HOLDER` | User accounts + transaction list | No | None | No |
| **Account Holder Accounts** | Create new account | `/api/v1/accounts` | `POST` | `ACCOUNT_HOLDER`, `ADMIN` | Created account details | Yes (accounts table) | None (starts ₹0.00) | Yes (`ACCOUNT_CREATED`) |
| **Transactions** | Deposit money | `/api/v1/transactions/deposit` | `POST` | `ACCOUNT_HOLDER` | Transaction record + balance | Yes (txns, ledger, accounts) | Balance +amount; 1 CREDIT entry; vault assets increase | Yes (`TRANSACTION_DEPOSIT_SUCCESS` / `REFUSED`) |
| **Transactions** | Withdraw money | `/api/v1/transactions/withdraw` | `POST` | `ACCOUNT_HOLDER` | Transaction record + balance | Yes (txns, ledger, accounts) | Balance -amount; 1 DEBIT entry; vault assets decrease | Yes (`TRANSACTION_WITHDRAW_SUCCESS` / `REFUSED`) |
| **Transactions** | Transfer money | `/api/v1/transactions/transfer` | `POST` | `ACCOUNT_HOLDER` | Transaction record + balances | Yes (txns, ledger, accounts) | Source -amount (DEBIT), Dest +amount (CREDIT); Net vault change = 0 | Yes (`TRANSACTION_TRANSFER_SUCCESS` / `REFUSED`) |
| **Transactions** | Validate recipient account | `/api/v1/accounts/recipient/:accNum` | `GET` | All authenticated | Safe recipient info (name, status) | No | None | No |
| **Transactions** | Inspect transaction details | `/api/v1/transactions/:id` | `GET` | Participant / Admin / Auditor | Txn details + double-entry postings | No | None | No |
| **Statements** | View official statement | `/api/v1/statements/:accountNumber` | `GET` | Owner / Admin / Auditor | Opening/closing balance, postings, summary, refused | No | None | No |
| **Admin Dashboard** | Load system telemetry | `/api/v1/admin/dashboard` | `GET` | `ADMIN` | 8 Aggregate metrics, trends, recent txns | No | None | No |
| **Admin Users** | List & filter users | `/api/v1/admin/users` | `GET` | `ADMIN` | Paginated users list + metadata | No | None | No |
| **Admin Users** | Activate/suspend user | `/api/v1/admin/users/:userId/status` | `PATCH` | `ADMIN` | Updated user record | Yes (users table) | None | Yes (`ADMIN_USER_STATUS_UPDATED`) |
| **Admin Accounts** | List & filter accounts | `/api/v1/admin/accounts` | `GET` | `ADMIN` | Paginated accounts + balances | No | None | No |
| **Admin Accounts** | Freeze/activate account | `/api/v1/admin/accounts/:accountId/status` | `PATCH` | `ADMIN` | Updated account status | Yes (accounts table) | None | Yes (`ADMIN_ACCOUNT_STATUS_UPDATED`) |
| **Global Ledger** | Inspect double-entry journal | `/api/v1/ledger` | `GET` | `ADMIN`, `AUDITOR` | Paginated journal rows + totals | No | None | No |
| **Global Ledger** | Verify account consistency | `/api/v1/ledger/:accountNumber` | `GET` | Owner / Admin / Auditor | Balance vs calculated net ledger | No | None | No |
| **Audit Events** | Inspect compliance logs | `/api/v1/audit-events` | `GET` | `ADMIN`, `AUDITOR` | Paginated audit trail + metadata | No | None | No |
| **Auditor Dashboard** | Compliance oversight portal | `/api/v1/ledger`, `/api/v1/transactions`, `/api/v1/audit-events` | `GET` | `AUDITOR` | Read-only journal, txns, audit logs, refused attempts | No | None | No |

---

## Financial Money Effects & Invariants

LedgerLine treats balance mutations as strict derivative states of atomic financial operations:

1. **Deposit (`POST /api/v1/transactions/deposit`)**:
   - **Pre-condition**: Destination account must be in `ACTIVE` status. Initiating user must own the account.
   - **Post-condition**:
     - Single row lock on destination account (`SELECT FOR UPDATE`).
     - Account `balance` is incremented by transacted integer paise (`newBalance = balance + amount`).
     - Exactly **one** `CREDIT` entry is inserted into `ledger_entries` (`balance_after = newBalance`).
     - Transaction record created with status `SUCCESS`.
     - Net system vault assets increase by `amount`.
2. **Withdrawal (`POST /api/v1/transactions/withdraw`)**:
   - **Pre-condition**: Source account must be in `ACTIVE` status. Initiating user must own the account. Available balance must be strictly greater than or equal to requested amount (`balance >= amount`).
   - **Post-condition**:
     - Single row lock on source account (`SELECT FOR UPDATE`).
     - Account `balance` is decremented by transacted integer paise (`newBalance = balance - amount`).
     - Database-enforced constraint `CHECK (balance >= 0)` guarantees non-negative balance.
     - Exactly **one** `DEBIT` entry is inserted into `ledger_entries` (`balance_after = newBalance`).
     - Transaction record created with status `SUCCESS`.
     - Net system vault assets decrease by `amount`.
3. **Transfer (`POST /api/v1/transactions/transfer`)**:
   - **Pre-condition**: Source and destination accounts must both be `ACTIVE` status. Source account cannot equal destination account. Initiating user must own source account. Source balance must satisfy `balance >= amount`.
   - **Post-condition**:
     - Deterministic row locking on both accounts in ascending UUID order (`ORDER BY id ASC FOR UPDATE`) eliminating deadlocks.
     - Source balance decremented by `amount`.
     - Destination balance incremented by exact same `amount`.
     - Exactly **two** balanced ledger entries are inserted:
       - `DEBIT` entry on source account (`balance_after = newSourceBalance`).
       - `CREDIT` entry on destination account (`balance_after = newDestBalance`).
     - Transaction record created with status `SUCCESS`.
     - **Conservation of Money**: Net change in system vault assets is identically zero (`+amount - amount = 0`).
4. **Administrative & Oversight Operations**:
   - Zero money effects. Read-only queries and administrative status alterations (`ACTIVE`, `FROZEN`, `CLOSED`) never modify balances or insert financial ledger entries.

---

## Audit Event Coverage & Non-Repudiation

All security-critical operations, authentication workflows, and administrative actions emit structured, immutable records to the `audit_events` PostgreSQL table:

| Event Action | Triggering Operation | Actor Role | Resource Type | Target Resource ID | Metadata Captured |
| :--- | :--- | :---: | :---: | :--- | :--- |
| `AUTH_REGISTER_SUCCESS` | New user registered | `ACCOUNT_HOLDER` | `USER` | User UUID | `{ email, role }` |
| `AUTH_REGISTER_FAILURE` | Registration rejected | Anonymous | `USER` | None | `{ email, failureReason }` |
| `AUTH_LOGIN_SUCCESS` | User authenticated | Any | `USER` | User UUID | `{ email, role }` |
| `AUTH_LOGIN_FAILURE` | Invalid password/user | Anonymous | `USER` | None | `{ email, failureReason }` |
| `AUTH_LOGIN_REFUSED` | Suspended user login | Suspended | `USER` | User UUID | `{ email, refusalReason: "User account deactivated" }` |
| `AUTH_REFRESH_SUCCESS` | Refresh token rotated | Any | `USER` | User UUID | `{ email }` |
| `AUTH_LOGOUT_SUCCESS` | Explicit session logout | Any | `USER` | User UUID | `{ email }` |
| `ACCOUNT_CREATED` | New account provisioned | User / Admin | `ACCOUNT` | Account UUID | `{ accountNumber, accountType }` |
| `ADMIN_USER_STATUS_UPDATED` | User activated/suspended | `ADMIN` | `USER` | Target User UUID | `{ previousStatus, newStatus }` |
| `ADMIN_ACCOUNT_STATUS_UPDATED` | Account status modified | `ADMIN` | `ACCOUNT` | Target Account UUID | `{ previousStatus, newStatus, accountNumber }` |
| `TRANSACTION_DEPOSIT_SUCCESS` | Deposit committed | `ACCOUNT_HOLDER` | `TRANSACTION` | Txn UUID | `{ accountNumber, amount, balanceAfter }` |
| `TRANSACTION_DEPOSIT_REFUSED` | Deposit refused | `ACCOUNT_HOLDER` | `ACCOUNT` | Account UUID | `{ accountNumber, amount, refusalReason }` |
| `TRANSACTION_WITHDRAW_SUCCESS` | Withdrawal committed | `ACCOUNT_HOLDER` | `TRANSACTION` | Txn UUID | `{ accountNumber, amount, balanceAfter }` |
| `TRANSACTION_WITHDRAW_REFUSED` | Withdrawal refused (e.g. overdraft) | `ACCOUNT_HOLDER` | `ACCOUNT` | Account UUID | `{ accountNumber, amount, refusalReason }` |
| `TRANSACTION_TRANSFER_SUCCESS` | Transfer committed | `ACCOUNT_HOLDER` | `TRANSACTION` | Txn UUID | `{ sourceAccountNumber, destinationAccountNumber, amount }` |
| `TRANSACTION_TRANSFER_REFUSED` | Transfer refused (e.g. held) | `ACCOUNT_HOLDER` | `ACCOUNT` | Account UUID | `{ sourceAccountNumber, destinationAccountNumber, amount, refusalReason }` |

---

## Sensitive Data Minimization & Privacy Protection

LedgerLine strictly adheres to data minimization principles across all user interfaces and public APIs:

1. **Credential Elimination**:
   - Passwords and password hashes are never returned by any API endpoint and are strictly omitted from `users` repository queries (`SELECT id, full_name, email, role, is_active, created_at FROM users`).
   - Audit logs never record plain passwords, bearer tokens, or refresh token hashes.
2. **Token & Secret Sanitization**:
   - The frontend `SanitizedAuditInspector` component explicitly filters out any key matching `password`, `token`, `secret`, `cookie`, `jwt`, `authorization`, or `refreshtoken`.
3. **Internal UUID Minimization in UI**:
   - Public account numbers (`LL-ACC-XXXX`) and meaningful transaction references (`DEP-...`, `WTH-...`, `TRF-...`) are presented as primary identifiers across all normal user and auditor interfaces.
   - Internal database UUIDs are omitted from primary data tables and statement displays to prevent unnecessary exposure of internal database architecture.
4. **Safe Recipient Verification**:
   - The inter-user recipient lookup endpoint (`GET /api/v1/accounts/recipient/:accountNumber`) returns strictly non-sensitive metadata needed for transfer confirmation:
     - `accountNumber`: Target account number
     - `holderName`: Account owner's public name
     - `status`: Operational status (`ACTIVE`, `FROZEN`, `CLOSED`)
     - `isEligible`: Boolean indicating transfer eligibility
   - Private depository balances, user UUIDs, creation timestamps, and owner email addresses are completely omitted.

---

## 1. Authentication Endpoints

### Register User
- **Method**: `POST`
- **Service Path**: `/auth/register` (Full URL: `/api/v1/auth/register`)
- **Rate Limit**: 20 requests / 15 minutes
- **Authorization**: Public
- **Request Body**:
  ```json
  {
    "fullName": "Kavi",
    "email": "kavi@example.com",
    "password": "Kavi@LL26#User01"
  }
  ```
  *(Note: The role is strictly assigned server-side as `ACCOUNT_HOLDER`. Client-supplied role fields are rejected with HTTP 400 Bad Request by Zod schema validation).*
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "User registered successfully",
    "data": {
      "user": {
        "id": "5bd2ab30-5a86-4298-924a-558b88838a10",
        "fullName": "Kavi",
        "email": "kavi@example.com",
        "role": "ACCOUNT_HOLDER",
        "isActive": true
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

### Login
- **Method**: `POST`
- **Path**: `/api/v1/auth/login`
- **Rate Limit**: 20 requests / 15 minutes
- **Authorization**: Public
- **Request Body**:
  ```json
  {
    "email": "kavi@example.com",
    "password": "Kavi@LL26#User01"
  }
  ```
- **Response** (`200 OK`): Returns sanitized user and signed JWT bearer token.

### Get Current User Profile
- **Method**: `GET`
- **Path**: `/api/v1/auth/me`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response** (`200 OK`): Returns user details and owned account balances.

---

## 2. Account Endpoints

### List Accounts
- **Method**: `GET`
- **Path**: `/api/v1/accounts`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Authorization**:
  - `ACCOUNT_HOLDER`: Returns only owned accounts.
  - `ADMIN` & `AUDITOR`: Returns all system accounts with owner details.

### Get Account by ID
- **Method**: `GET`
- **Path**: `/api/v1/accounts/:accountId`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Authorization**: Account Owner, Admin, or Auditor.

### Get Account Balance
- **Method**: `GET`
- **Path**: `/api/v1/accounts/:accountId/balance`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "data": {
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "accountNumber": "LL-ACC-1001",
      "currency": "INR",
      "balancePaise": "500000",
      "balanceFormatted": "5000.00",
      "status": "ACTIVE"
    }
  }
  ```

### Verify Recipient Account (Safe Transfer Lookup)
- **Method**: `GET`
- **Path**: `/api/v1/accounts/recipient/:accountNumber`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Authorization**: Any authenticated user.
- **Description**: Validates an account number (or UUID) for receiving transfers. Returns safe public details (account number, account type, currency, active status, holder name, and eligibility) without exposing sensitive balances, owner IDs, or contact info.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Recipient account verified",
    "data": {
      "accountNumber": "LL-ACC-2001",
      "accountType": "SAVINGS",
      "currency": "INR",
      "status": "ACTIVE",
      "holderName": "Ravi",
      "isEligible": true,
      "isOwnAccount": false
    }
  }
  ```

### Get Account Statement
- **Method**: `GET`
- **Paths**:
  - Primary Dedicated: `/api/v1/statements/:accountNumber` (supports public account number like `LL-ACC-1001` or UUID)
  - Alias: `/api/v1/accounts/:accountId/statement`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Authorization**:
  - `ACCOUNT_HOLDER`: Scoped strictly to owned accounts (enforces HTTP 403 / 404 boundary).
  - `ADMIN` & `AUDITOR`: Allowed for any system account.
- **Query Parameters**:
  - `page` (integer, optional, default: `1`): 1-indexed page number.
  - `limit` (integer, optional, default: `50`, max: `100`): Page size limit.
  - `startDate` (ISO 8601 string, optional): Inclusive start date filter.
  - `endDate` (ISO 8601 string, optional): Inclusive end date filter.
- **Precision Guarantees**:
  - Opening balance represents the verified account balance immediately prior to `startDate` (or inception).
  - Closing balance satisfies double-entry conservation: `Closing Balance = Opening Balance + Total Credits - Total Debits`.
  - All summary totals and balances are calculated using integer paise (`BIGINT` / `BigInt`) over the entire filtered statement period and remain invariant across pagination pages.
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "data": {
      "account": {
        "id": "07be6ea0-6a47-47da-b514-1da78683bee5",
        "accountNumber": "LL-ACC-1001",
        "accountType": "SAVINGS",
        "currency": "INR",
        "status": "ACTIVE",
        "currentBalancePaise": "500000",
        "currentBalanceFormatted": "5000.00",
        "holderName": "Ravi Kumar",
        "branchName": "Central Operations Treasury",
        "ifscCode": "LLIN0001001"
      },
      "statementPeriod": {
        "startDate": "2026-11-01T00:00:00.000Z",
        "endDate": "2026-11-09T23:59:59.999Z",
        "periodDescription": "01 Nov 2026 to 09 Nov 2026",
        "formatted": "01 Nov 2026 to 09 Nov 2026"
      },
      "summary": {
        "openingBalancePaise": "450000",
        "openingBalanceFormatted": "4500.00",
        "closingBalancePaise": "500000",
        "closingBalanceFormatted": "5000.00",
        "totalDebitsPaise": "5000",
        "totalDebitsFormatted": "50.00",
        "totalCreditsPaise": "55000",
        "totalCreditsFormatted": "550.00",
        "debitCount": 1,
        "creditCount": 2,
        "netChangePaise": "50000",
        "netChangeFormatted": "500.00"
      },
      "pagination": {
        "page": 1,
        "limit": 50,
        "offset": 0,
        "totalEntries": 3,
        "totalCommittedEntries": 3,
        "totalPages": 1,
        "hasNextPage": false,
        "hasPrevPage": false
      },
      "committedPostings": [
        {
          "ledgerEntryId": "1a2b3c4d-...",
          "transactionId": "5bc7d5ff-...",
          "transactionReference": "DEP-1793893066772-AA11BB22",
          "transactionType": "DEPOSIT",
          "displayType": "DEPOSIT",
          "entryType": "CREDIT",
          "direction": "INCOMING",
          "isCredit": true,
          "amountPaise": "50000",
          "amountFormatted": "500.00",
          "resultingRunningBalancePaise": "500000",
          "resultingRunningBalanceFormatted": "5000.00",
          "date": "2026-11-09T14:30:00.000Z",
          "description": "Salary credit",
          "initiator": "Ravi Kumar"
        }
      ],
      "refusedAttempts": []
    }
  }
  ```

---

## 3. Financial Safety & Idempotency Contract

All financial state-mutating endpoints (`/transactions/deposit`, `/transactions/withdraw`, `/transactions/transfer`) strictly implement the **LedgerLine Idempotency Engine** backed by PostgreSQL atomic transactions:

### Header Requirements & Semantics
- **Header**: `Idempotency-Key: <UUID>`
- **Format**: Valid RFC 4122 UUID string (e.g. `c73a791b-64c9-4d23-b169-ae94d5e7498c`). Validated by route middleware (`validateIdempotencyHeader`); invalid non-UUID strings are rejected with `HTTP 400 Bad Request`.
- **User Scoping**: Every key is strictly scoped to the authenticated caller (`user_id, idempotency_key`). An idempotency key generated by User A cannot be accessed, hijacked, or replayed by User B.
- **Retention & TTL**: Idempotency records store an expiration timestamp (`expires_at = NOW() + 24 hours`). Key validity is evaluated during lookup; keys older than 24 hours are treated as expired and evicted upon subsequent lookup without requiring background daemons.

### Execution & Conflict Behaviors
1. **First-Time Execution (`200 OK`)**:
   - The key is recorded in state `IN_FLIGHT` with a SHA-256 hash of the request parameters and operation type.
   - The financial transaction executes inside a dedicated database transaction (`BEGIN...COMMIT`) with row-level locks (`SELECT FOR UPDATE`).
   - Upon successful commit, the idempotency record is completed, storing the exact transaction response body and status code.
2. **Safe Replay / Network Retry (`200 OK` with `X-Cache: HIT`)**:
   - If a client experiences a network timeout or connection reset and retries with the **same** `Idempotency-Key` and **identical** payload, the server returns the previously stored response with HTTP header `X-Cache: HIT`.
   - **No duplicate ledger entries, no duplicate balance movements, and no secondary debits/credits occur.**
3. **Concurrent In-Flight Collision (`409 Conflict`)**:
   - If a duplicate request arrives while the original transaction is still processing (`IN_FLIGHT`), the server immediately rejects the second request with `HTTP 409 Conflict` (Message: *"A concurrent request with the same Idempotency-Key is currently being processed. Please retry shortly."*).
4. **Payload Mismatch / Key Tampering Rejection (`409 Conflict`)**:
   - If a request is received with an existing active `Idempotency-Key` but differing payload parameters (e.g. altered amount, different recipient account, or different operation), the server computes the SHA-256 payload hash, detects the tampering attempt, and rejects the request with `HTTP 409 Conflict` (Message: *"Idempotency key reuse conflict: The provided Idempotency-Key was previously used with a different request payload."*).

### Monetary Amount Format Requirements
- **Rule**: Amounts must be transmitted as **decimal strings** with up to 2 decimal places (e.g. `"500.00"`, `"150.5"`, or `"25"`).
- **Zero Floating-Point Tolerance**: Frontend and backend code avoid IEEE 754 floating-point arithmetic. The backend parser parses the string directly into integer minor units (**Paise**; 1 INR = 100 Paise) using JavaScript `BigInt` and PostgreSQL `BIGINT`.

---

## 4. Transaction Endpoints

### Deposit Funds
- **Method**: `POST`
- **Path**: `/api/v1/transactions/deposit`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the target account. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body (Preferred - Account Number)**:
  ```json
  {
    "accountNumber": "LL-ACC-1001",
    "amount": "500.00",
    "description": "Salary deposit"
  }
  ```
- **Request Body (Backward Compatible - Account UUID)**:
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "500.00",
    "description": "Salary deposit"
  }
  ```
- **Response** (`201 Created`): Returns transaction reference, updated `balanceFormatted`, and double-entry ledger entry ID.

### Withdraw Funds
- **Method**: `POST`
- **Path**: `/api/v1/transactions/withdraw`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the target account. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body (Preferred - Account Number)**:
  ```json
  {
    "accountNumber": "LL-ACC-1001",
    "amount": "150.00",
    "description": "ATM Cash Withdrawal"
  }
  ```
- **Request Body (Backward Compatible - Account UUID)**:
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "150.00",
    "description": "ATM Cash Withdrawal"
  }
  ```
- **Response** (`200 OK`): Returns transaction reference, updated `balanceFormatted`, and double-entry debit entry ID.

### Transfer Funds (Double-Entry Internal Transfer)
- **Method**: `POST`
- **Path**: `/api/v1/transactions/transfer`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the source account; destination account must be active. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body (Preferred - Account Numbers)**:
  ```json
  {
    "sourceAccountNumber": "LL-ACC-1001",
    "destinationAccountNumber": "LL-ACC-2001",
    "amount": "250.00",
    "description": "Funds transfer"
  }
  ```
- **Request Body (Backward Compatible - Account UUIDs)**:
  ```json
  {
    "sourceAccountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "destinationAccountId": "a34f98ca-044d-40c8-8269-df41f2639eab",
    "amount": "250.00",
    "description": "Funds transfer"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Transfer completed successfully",
    "data": {
      "transactionId": "5bc7d5ff-e233-4970-b4ea-7d1afa98c3a9",
      "transactionReference": "TRF-1793893066772-EE1E079F",
      "type": "TRANSFER",
      "status": "SUCCESS",
      "sourceAccountNumber": "LL-ACC-1001",
      "destinationAccountNumber": "LL-ACC-2001",
      "sourceAccountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "destinationAccountId": "a34f98ca-044d-40c8-8269-df41f2639eab",
      "amountPaise": "25000",
      "amountFormatted": "250.00",
      "sourceBalanceAfterFormatted": "4750.00",
      "destinationBalanceAfterFormatted": "2750.00",
      "ledgerEntries": ["debit_uuid", "credit_uuid"]
    }
  }
  ```

---

## 5. Ledger & Audit Endpoints

### Global Double-Entry Ledger
- **Method**: `GET`
- **Path**: `/api/v1/ledger`
- **Authorization**: `ADMIN`, `AUDITOR`

### Account Ledger Reconciliation
- **Method**: `GET`
- **Path**: `/api/v1/ledger/:accountId`
- **Authorization**: Account Owner, Admin, Auditor. Reconciles net ledger credits minus debits against current database account balance.

### Audit Events Trail
- **Method**: `GET`
- **Path**: `/api/v1/audit-events`
- **Authorization**: `ADMIN`, `AUDITOR`

---

## 6. Administration Endpoints

### List Users
- **Method**: `GET`
- **Path**: `/api/v1/admin/users`
- **Authorization**: `ADMIN`

### List Accounts
- **Method**: `GET`
- **Path**: `/api/v1/admin/accounts`
- **Authorization**: `ADMIN`

### Update User Active Status
- **Method**: `PATCH`
- **Path**: `/api/v1/admin/users/:userId/status`
- **Authorization**: `ADMIN`
- **Body**: `{ "isActive": false }`

### Update Account Status
- **Method**: `PATCH`
- **Path**: `/api/v1/admin/accounts/:accountId/status`
- **Authorization**: `ADMIN`
- **Body**: `{ "status": "FROZEN" }`

