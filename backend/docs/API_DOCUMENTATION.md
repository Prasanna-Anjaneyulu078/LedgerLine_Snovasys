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
    "password": "Kavi@LL26#User01",
    "role": "ACCOUNT_HOLDER"
  }
  ```
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
- **Header**: `Idempotency-Key: <UUID-v4>`
- **Format**: Must be a valid, standard RFC 4122 UUID v4 string (e.g. `c73a791b-64c9-4d23-b169-ae94d5e7498c`).
- **User Scoping**: Every key is strictly scoped to the authenticated caller (`user_id, idempotency_key`). An idempotency key generated by User A cannot be accessed, hijacked, or replayed by User B.
- **Retention & TTL**: Idempotency records remain active in the database for **24 hours**. Expired keys are pruned automatically.

### Execution & Conflict Behaviors
1. **First-Time Execution (`201 Created` / `200 OK`)**:
   - The key is recorded in state `IN_FLIGHT` with a SHA-256 hash of the request parameters and HTTP method/path.
   - The financial transaction executes inside a dedicated database transaction (`BEGIN...COMMIT`) with row-level locks (`SELECT FOR UPDATE`).
   - Upon successful commit, the idempotency record transitions to `COMPLETED`, storing the exact HTTP response body and status code.
2. **Safe Replay / Network Retry (`200 OK`)**:
   - If a client experiences a network timeout or connection reset and retries with the **same** `Idempotency-Key` and **identical** payload, the server returns the previously stored response with header `X-Cache: HIT`.
   - **No duplicate ledger entries, no duplicate balance movements, and no secondary debits/credits occur.**
3. **Concurrent In-Flight Collision (`409 Conflict`)**:
   - If a duplicate request arrives while the original transaction is still processing (`IN_FLIGHT`), the server immediately rejects the second request with `HTTP 409 Conflict` (Code: `IDEMPOTENCY_IN_FLIGHT`, Message: *"A request with this idempotency key is currently processing. Please wait."*).
4. **Payload Mismatch / Key Tampering Rejection (`409 Conflict`)**:
   - If a request is received with an existing active `Idempotency-Key` but differing payload parameters (e.g. altered amount, different recipient account, or different operation), the server computes the SHA-256 payload hash, detects the tampering attempt, and rejects the request with `HTTP 409 Conflict` (Code: `IDEMPOTENCY_KEY_REUSE_MISMATCH`, Message: *"Idempotency key has already been used for a different request payload."*).

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

