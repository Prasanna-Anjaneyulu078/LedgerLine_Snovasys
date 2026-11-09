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
| **Account Statements** (`GET /accounts/:id/statement`) | **Own Account** | **All Accounts** | **All Accounts** | Complete running balance with posted and refused records |
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
- **Path**: `/api/v1/accounts/:accountId/statement`
- **Query Parameters**: `limit`, `offset`, `startDate`, `endDate`
- **Response** (`200 OK`): Complete running balance ledger with debits, credits, timestamps, and audited refused attempts.

---

## 3. Transaction Endpoints

### Deposit Funds
- **Method**: `POST`
- **Path**: `/api/v1/transactions/deposit`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the target account. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body**:
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "500.00",
    "description": "Salary deposit"
  }
  ```

### Withdraw Funds
- **Method**: `POST`
- **Path**: `/api/v1/transactions/withdraw`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the target account. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body**:
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "150.00",
    "description": "ATM Cash Withdrawal"
  }
  ```

### Transfer Funds (Double-Entry Internal Transfer)
- **Method**: `POST`
- **Path**: `/api/v1/transactions/transfer`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Authorization**: `ACCOUNT_HOLDER` role exclusively. Caller must own the source account; destination account must be active. `ADMIN` and `AUDITOR` receive `403 Forbidden`.
- **Request Body (Account Number-Based - Preferred)**:
  ```json
  {
    "sourceAccountNumber": "LL-ACC-1001",
    "destinationAccountNumber": "LL-ACC-2001",
    "amount": "250.00",
    "description": "Funds transfer"
  }
  ```
- **Request Body (UUID-Based - Backward Compatible)**:
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

## 4. Ledger & Audit Endpoints

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

## 5. Administration Endpoints

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

