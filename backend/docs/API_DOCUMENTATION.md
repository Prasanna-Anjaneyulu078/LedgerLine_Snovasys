# LedgerLine: API Documentation

Base URL: `/api/v1`  
Interactive Swagger UI: `http://localhost:5000/api-docs`

---

## 1. Authentication Endpoints

### Register User
- **Method**: `POST`
- **Path**: `/api/v1/auth/register`
- **Rate Limit**: 20 requests / 15 minutes
- **Authorization**: Public
- **Request Body**:
  ```json
  {
    "fullName": "Alice Sharma",
    "email": "alice@example.com",
    "password": "Alice@123456",
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
        "fullName": "Alice Sharma",
        "email": "alice@example.com",
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
    "email": "alice@example.com",
    "password": "Alice@123456"
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
- **Authorization**: Must be Account Owner or Admin. Auditor forbidden.
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
- **Authorization**: Must own `sourceAccountId` or be Admin. Auditor forbidden.
- **Request Body**:
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

