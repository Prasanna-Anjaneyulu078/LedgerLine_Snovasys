# LedgerLine — Frontend Integration Plan (`FRONTEND_INTEGRATION_PLAN.md`)

This integration specification maps the exact, existing backend API routes of **LedgerLine** to frontend screens, state management flows, and role-based access rules.

> **Zero Inventions**: Every endpoint, request parameter, header, and response field in this document directly reflects the tested and passing Node.js/Express backend implementation.

---

## 1. System Communication & Base Configuration

- **Axios Base URL**: `http://localhost:5000/api/v1` (Local) / `/api/v1` (Production / Render)
  - Configured in frontend client:
    ```javascript
    const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
    export const apiClient = axios.create({
      baseURL: API_BASE_URL,
      headers: { 'Content-Type': 'application/json' },
      withCredentials: true,
    });
    ```
- **API Service Paths Convention**: All API service paths are relative to `baseURL`:
  - E.g. `apiClient.post('/auth/register', data)` -> resolves to `http://localhost:5000/api/v1/auth/register`.
  - **CRITICAL**: Do NOT prepend `/api/v1` to individual service calls (e.g., avoid `apiClient.post('/api/v1/auth/register')` which results in `/api/v1/api/v1/auth/register`).
- **Health Check Endpoint**: `http://localhost:5000/health`
  - Unversioned root endpoint (outside `/api/v1`). Call using standalone fetch or root Axios instance: `fetch('http://localhost:5000/health')`.
- **Interactive Documentation**: `http://localhost:5000/api-docs`
- **CORS Allowed Origin**: Configured via `CORS_ORIGIN` (default: credentials allowed)
- **Content Type**: `application/json` (Body limit: 1MB)
- **Standard Envelope Format**:
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Human readable status message",
    "data": { ... }
  }
  ```
- **Standard Error Format**:
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Error description",
    "error": "Error details or validation array"
  }
  ```

---

## 2. Authentication & Session Management

### 2.1 Storage & Headers
- **Tokens**: JSON Web Token (JWT) issued on Login/Registration (`1d` expiration).
- **Client Storage**: `localStorage` or `sessionStorage` under key `ledgerline_token`.
- **Authorization Header**: Required for all protected routes:
  ```http
  Authorization: Bearer <jwt_token>
  ```
- **Session Restoration**: On application boot, call `GET /api/v1/auth/me` with the stored token. If valid, initialize auth state with the returned user profile and accounts; if `401 Unauthorized`, clear storage and redirect to `/login`.

### 2.2 Financial Idempotency Headers
All money-movement actions (`/transactions/deposit`, `/transactions/withdraw`, `/transactions/transfer`) accept an `Idempotency-Key` header:
```http
Idempotency-Key: <crypto.randomUUID()>
```
- **Frontend Contract**: Generate a fresh UUIDv4 per user click. Disable the submit button immediately upon submission to prevent accidental double-clicks.
- If a network timeout occurs, re-transmitting the exact same `Idempotency-Key` guarantees that the backend replays the original transaction result without double-charging the account.

---

## 3. Exhaustive Backend API Route Inventory

### 3.1 Public & Authentication Routes (`/auth`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | No | Public | Register new account holder or auditor |
| `POST` | `/api/v1/auth/login` | No | Public | Authenticate user, receive JWT |
| `GET` | `/api/v1/auth/me` | Yes | All Roles | Fetch current user profile & owned accounts |

#### 1. Register User
- **Request**: `POST /api/v1/auth/register`
  ```json
  {
    "fullName": "Alice Sharma",
    "email": "alice@example.com",
    "password": "Password@1234",
    "role": "ACCOUNT_HOLDER"
  }
  ```
  *(Password requirement: At least 8 characters, 1 uppercase, 1 lowercase, 1 number, 1 special character).*
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
        "isActive": true,
        "createdAt": "2026-11-05T17:51:38.653Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### 2. Login User
- **Request**: `POST /api/v1/auth/login`
  ```json
  {
    "email": "alice@example.com",
    "password": "Password@1234"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Authentication successful",
    "data": {
      "user": {
        "id": "5bd2ab30-5a86-4298-924a-558b88838a10",
        "fullName": "Alice Sharma",
        "email": "alice@example.com",
        "role": "ACCOUNT_HOLDER",
        "isActive": true,
        "createdAt": "2026-11-05T17:51:38.653Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### 3. Current User Profile (`/auth/me`)
- **Request**: `GET /api/v1/auth/me`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Current user profile retrieved successfully",
    "data": {
      "id": "5bd2ab30-5a86-4298-924a-558b88838a10",
      "fullName": "Alice Sharma",
      "email": "alice@example.com",
      "role": "ACCOUNT_HOLDER",
      "isActive": true,
      "createdAt": "2026-11-05T17:51:38.653Z",
      "accounts": [
        {
          "id": "07be6ea0-6a47-47da-b514-1da78683bee5",
          "accountNumber": "LL-ACC-1001",
          "accountType": "SAVINGS",
          "currency": "INR",
          "balance": "500000",
          "status": "ACTIVE"
        }
      ]
    }
  }
  ```

---

### 3.2 Account Management Routes (`/accounts`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/accounts` | Yes | `ADMIN`, `ACCOUNT_HOLDER` | Create new bank account |
| `GET` | `/api/v1/accounts` | Yes | All Roles | List accounts (`ACCOUNT_HOLDER` sees own; `ADMIN`/`AUDITOR` sees all) |
| `GET` | `/api/v1/accounts/:accountId` | Yes | Owner, `ADMIN`, `AUDITOR` | Single account details |
| `GET` | `/api/v1/accounts/:accountId/balance` | Yes | Owner, `ADMIN`, `AUDITOR` | Real-time balance check |
| `GET` | `/api/v1/accounts/:accountId/statement` | Yes | Owner, `ADMIN`, `AUDITOR` | Ledger history with running balances |

#### 1. Create Account
- **Request**: `POST /api/v1/accounts`
  ```json
  {
    "accountType": "SAVINGS",
    "currency": "INR"
  }
  ```
  *(Supported types: `SAVINGS`, `CHECKING`, `OPERATIONAL`. Default currency: `INR`).*
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "statusCode": 201,
    "message": "Account created successfully",
    "data": {
      "id": "18f9df08-2e06-444a-a032-4d2be7cebe40",
      "account_number": "LL-ACC-48927182",
      "owner_id": "5bd2ab30-5a86-4298-924a-558b88838a10",
      "account_type": "SAVINGS",
      "currency": "INR",
      "balance": "0",
      "status": "ACTIVE",
      "balancePaise": "0",
      "balanceFormatted": "0.00"
    }
  }
  ```

#### 2. Get Account Balance
- **Request**: `GET /api/v1/accounts/:accountId/balance`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Balance retrieved successfully",
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

#### 3. Account Statement (`/accounts/:accountId/statement`)
- **Request**: `GET /api/v1/accounts/:accountId/statement?limit=50&offset=0`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Statement retrieved successfully",
    "data": {
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "totalEntries": 5,
      "entries": [
        {
          "id": "ledger-entry-uuid",
          "transactionId": "transaction-uuid",
          "transactionReference": "TRF-1793893066772-EE1E079F",
          "transactionType": "TRANSFER",
          "transactionStatus": "SUCCESS",
          "entryType": "CREDIT",
          "amountPaise": "25000",
          "amountFormatted": "250.00",
          "balanceAfterPaise": "525000",
          "balanceAfterFormatted": "5250.00",
          "description": "Payment split",
          "initiatorName": "Bob Tester",
          "createdAt": "2026-11-05T17:49:40.625Z"
        }
      ]
    }
  }
  ```

---

### 3.3 Transaction & Money Movement Routes (`/transactions`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/transactions/deposit` | Yes | `ADMIN`, `ACCOUNT_HOLDER` | Credit external funds to account |
| `POST` | `/api/v1/transactions/withdraw` | Yes | Owner or `ADMIN` | Debit funds from account |
| `POST` | `/api/v1/transactions/transfer` | Yes | Source Owner or `ADMIN` | Balanced double-entry transfer |
| `GET` | `/api/v1/transactions` | Yes | All Roles | Filterable transaction logs |
| `GET` | `/api/v1/transactions/:transactionId` | Yes | Participants, `ADMIN`, `AUDITOR` | Single transaction with ledger postings |

*(Note: The `AUDITOR` role is strictly blocked with `403 Forbidden` from `/deposit`, `/withdraw`, and `/transfer`).*

#### 1. Deposit
- **Request**: `POST /api/v1/transactions/deposit`  
  Headers: `Idempotency-Key: <UUID>`
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "1000.00",
    "description": "Salary credit"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Deposit completed successfully",
    "data": {
      "transactionId": "txn-uuid",
      "transactionReference": "DEP-1793893066772-A1B2C3D4",
      "type": "DEPOSIT",
      "status": "SUCCESS",
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "accountNumber": "LL-ACC-1001",
      "amountPaise": "100000",
      "amountFormatted": "1000.00",
      "balanceAfterPaise": "600000",
      "balanceAfterFormatted": "6000.00",
      "ledgerEntryId": "le-uuid",
      "createdAt": "2026-11-05T17:49:16.822Z"
    }
  }
  ```

#### 2. Withdraw
- **Request**: `POST /api/v1/transactions/withdraw`  
  Headers: `Idempotency-Key: <UUID>`
  ```json
  {
    "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "amount": "250.00",
    "description": "Cash withdrawal"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Withdrawal completed successfully",
    "data": {
      "transactionId": "txn-uuid",
      "transactionReference": "WTH-1793893066772-B2C3D4E5",
      "type": "WITHDRAWAL",
      "status": "SUCCESS",
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "accountNumber": "LL-ACC-1001",
      "amountPaise": "25000",
      "amountFormatted": "250.00",
      "balanceAfterPaise": "575000",
      "balanceAfterFormatted": "5750.00",
      "ledgerEntryId": "le-uuid",
      "createdAt": "2026-11-05T17:49:23.897Z"
    }
  }
  ```

#### 3. Transfer
- **Request**: `POST /api/v1/transactions/transfer`  
  Headers: `Idempotency-Key: <UUID>`
  ```json
  {
    "sourceAccountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
    "destinationAccountId": "a34f98ca-044d-40c8-8269-df41f2639eab",
    "amount": "500.00",
    "description": "Rent split"
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Transfer completed successfully",
    "data": {
      "transactionId": "txn-uuid",
      "transactionReference": "TRF-1793893066772-C3D4E5F6",
      "type": "TRANSFER",
      "status": "SUCCESS",
      "sourceAccountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "sourceAccountNumber": "LL-ACC-1001",
      "destinationAccountId": "a34f98ca-044d-40c8-8269-df41f2639eab",
      "destinationAccountNumber": "LL-ACC-2001",
      "amountPaise": "50000",
      "amountFormatted": "500.00",
      "sourceBalanceAfterPaise": "525000",
      "sourceBalanceAfterFormatted": "5250.00",
      "destinationBalanceAfterPaise": "1050000",
      "destinationBalanceAfterFormatted": "10500.00",
      "ledgerEntries": ["debit-le-uuid", "credit-le-uuid"],
      "createdAt": "2026-11-05T17:49:40.625Z"
    }
  }
  ```

---

### 3.4 Official Statement Route with Refusal Tracking (`/statements`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/statements/:accountId` | Yes | Owner, `ADMIN`, `AUDITOR` | Full statement with running balances & refused attempts |

- **Request**: `GET /api/v1/statements/:accountId?limit=50&offset=0`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Account statement generated successfully",
    "data": {
      "account": {
        "id": "07be6ea0-6a47-47da-b514-1da78683bee5",
        "accountNumber": "LL-ACC-1001",
        "accountType": "SAVINGS",
        "currency": "INR",
        "currentBalancePaise": "500000",
        "currentBalanceFormatted": "5000.00",
        "status": "ACTIVE"
      },
      "pagination": {
        "totalCommittedEntries": 3,
        "limit": 50,
        "offset": 0
      },
      "committedPostings": [
        {
          "ledgerEntryId": "le-uuid",
          "transactionReference": "TRF-1793893066772-C3D4E5F6",
          "transactionType": "TRANSFER",
          "transactionStatus": "SUCCESS",
          "date": "2026-11-05T17:49:40.625Z",
          "debitAmountFormatted": "500.00",
          "creditAmountFormatted": null,
          "amountPaise": "50000",
          "entryType": "DEBIT",
          "resultingRunningBalanceFormatted": "5000.00",
          "resultingRunningBalancePaise": "500000",
          "description": "Rent split",
          "initiator": "Alice Sharma"
        }
      ],
      "refusedAttempts": [
        {
          "id": "audit-uuid",
          "action": "TRANSACTION_WITHDRAW_REFUSED",
          "attemptedAt": "2026-11-05T17:49:32.614Z",
          "refusalReason": "Insufficient funds: Available balance is ₹5000.00, requested withdrawal is ₹10000.00",
          "attemptedAmount": "10000.00",
          "status": "REFUSED"
        }
      ]
    }
  }
  ```

---

### 3.5 Auditor & Administrative Ledger Routes (`/ledger` and `/audit-events`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/ledger` | Yes | `ADMIN`, `AUDITOR` | Global append-only double-entry ledger |
| `GET` | `/api/v1/ledger/:accountId` | Yes | Owner, `ADMIN`, `AUDITOR` | Account ledger with net consistency check |
| `GET` | `/api/v1/audit-events` | Yes | `ADMIN`, `AUDITOR` | Immutable audit trail & refusal logs |

#### 1. Account Ledger Reconciliation (`/ledger/:accountId`)
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Account ledger entries retrieved successfully",
    "data": {
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "accountNumber": "LL-ACC-1001",
      "currentBalancePaise": "500000",
      "currentBalanceFormatted": "5000.00",
      "ledgerCalculatedBalancePaise": "500000",
      "isBalanceConsistent": true,
      "totalEntries": 4,
      "entries": [ ... ]
    }
  }
  ```

#### 2. Audit Events (`/audit-events`)
- **Query Params**: `limit`, `offset`, `action`, `resourceType`, `startDate`, `endDate`
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "data": {
      "events": [
        {
          "id": "ae-uuid",
          "actor_id": "user-uuid",
          "action": "TRANSACTION_TRANSFER_REFUSED",
          "resource_type": "TRANSACTION",
          "resource_id": null,
          "metadata": {
            "sourceAccountId": "acc-uuid",
            "destinationAccountId": "acc-uuid",
            "amount": "20000.00",
            "refusalReason": "Insufficient funds"
          },
          "ip_address": "127.0.0.1",
          "created_at": "2026-11-05T17:49:54.186Z",
          "actor_name": "Alice Sharma",
          "actor_email": "alice@example.com",
          "actor_role": "ACCOUNT_HOLDER"
        }
      ],
      "total": 14
    }
  }
  ```

---

### 3.6 System Administrator Routes (`/admin`)

| Method | Endpoint | Auth Required | Allowed Roles | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/admin/users` | Yes | `ADMIN` | System user directory with role & status filters |
| `GET` | `/api/v1/admin/accounts` | Yes | `ADMIN` | All bank accounts across all users |
| `PATCH` | `/api/v1/admin/users/:userId/status` | Yes | `ADMIN` | Deactivate/activate user |
| `PATCH` | `/api/v1/admin/accounts/:accountId/status` | Yes | `ADMIN` | Freeze, close, or activate account |

#### 1. Update User Status
- **Request**: `PATCH /api/v1/admin/users/:userId/status`
  ```json
  {
    "isActive": false
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "User status updated successfully",
    "data": {
      "id": "user-uuid",
      "full_name": "Bob Tester",
      "email": "bob@example.com",
      "role": "ACCOUNT_HOLDER",
      "is_active": false,
      "updated_at": "2026-11-05T17:51:28.909Z"
    }
  }
  ```

#### 2. Update Account Status
- **Request**: `PATCH /api/v1/admin/accounts/:accountId/status`
  ```json
  {
    "status": "FROZEN"
  }
  ```
  *(Status options: `ACTIVE`, `FROZEN`, `CLOSED`).*

---

## 4. Error Codes & Client Handling

| HTTP Code | Scenario | Client Action |
| :--- | :--- | :--- |
| `400 Bad Request` | Zod validation error or insufficient funds | Display field error or alert message to user |
| `401 Unauthorized` | Missing, invalid, or expired JWT token | Purge token and redirect to `/login` |
| `403 Forbidden` | Accessing another user's account or Auditor calling money actions | Show "Access Forbidden" banner / restrict action buttons |
| `404 Not Found` | Target account or transaction not found | Show "Resource Not Found" notice |
| `409 Conflict` | Reused `Idempotency-Key` with different body or in-flight transaction | Alert user to retry with fresh request or wait for in-flight |
| `429 Too Many Requests` | Rate limit exceeded (auth: 20/15min, tx: 50/min, gen: 100/15min) | Display "Please wait a moment before trying again" |
| `500 Server Error` | Database or unhandled error | Show "System temporarily unavailable" |

---

## 5. Required Frontend Pages & Component Hierarchy

```
App
├── Navbar (Branding, Role Badge, User Greeting, Logout)
├── Role-Based Protected Routes
│
├── Public Pages
│   ├── /login (Email, Password, Role Demo Switcher)
│   └── /register (Full Name, Email, Password, Role Selection)
│
├── Account Holder Views (/dashboard)
│   ├── AccountSummaryCard (Account Number, Balance in ₹, Status Pill)
│   ├── CreateAccountModal (Type: SAVINGS/CHECKING, Currency)
│   ├── QuickActionTabs:
│   │   ├── DepositForm (Target Account, Amount, Idempotency)
│   │   ├── WithdrawForm (Source Account, Amount, Idempotency)
│   │   └── TransferForm (Source Account, Destination Account, Amount, Idempotency)
│   ├── StatementView (/accounts/:id/statement & /statements/:id)
│   │   ├── RunningBalanceTable (Date, Ref, Debit, Credit, Running Balance, Initiator)
│   │   └── RefusedAttemptsSection (Timestamp, Reason, Attempted Amount, Refused Badge)
│   └── ReconciliationBadge (Checks isBalanceConsistent)
│
├── Auditor Views (/audit)
│   ├── GlobalLedgerTable (/ledger: All debit/credit postings across accounts)
│   ├── AuditEventsExplorer (/audit-events: Filter by Action, Actor, Date)
│   ├── AccountReconciliationInspector (/ledger/:id: Sum of credits - debits vs balance)
│   └── RefusalAuditDashboard (Filter by Refused actions)
│
└── Admin Views (/admin)
    ├── UserManagementTable (/admin/users: Toggle is_active)
    ├── AccountManagementTable (/admin/accounts: Change status ACTIVE/FROZEN/CLOSED)
    └── SystemMetricsBar (Database health, total accounts, total system money)
```

---

## 6. Role-Specific Navigation Matrix

| Screen / Feature | `ACCOUNT_HOLDER` | `AUDITOR` | `ADMIN` |
| :--- | :---: | :---: | :---: |
| **Login / Register** | ✅ | ✅ | ✅ |
| **View Own Accounts & Balance** | ✅ | ✅ *(All)* | ✅ *(All)* |
| **Create New Account** | ✅ | ❌ | ✅ |
| **Deposit / Withdraw / Transfer** | ✅ | ❌ *(Forbidden)* | ✅ |
| **Account Statements & Refusals** | ✅ *(Own)* | ✅ *(All)* | ✅ *(All)* |
| **Account Balance Reconciliation** | ✅ *(Own)* | ✅ *(All)* | ✅ *(All)* |
| **Global Double-Entry Ledger** | ❌ | ✅ | ✅ |
| **System Audit Trail (`/audit-events`)** | ❌ | ✅ | ✅ |
| **User Management (Deactivate Users)** | ❌ | ❌ | ✅ |
| **Account Status (Freeze/Close)** | ❌ | ❌ | ✅ |

---

## 7. Demonstration Credentials (from Backend Seed Script)

For local development and evaluation, the backend seed script (`npm run seed`) provisions four authorized demonstration accounts:

| Role | Display Name | Email | Password | Pre-loaded Accounts |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | `Prasanna@LL26#Admin` | System Administration |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | `Sasank@LL26#Audit` | Read-only Audit & Ledger View |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `Kavi@LL26#User01` | `LL-ACC-1001` (₹5,000.00)<br/>`LL-ACC-1002` (₹2,500.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `Ravi@LL26#User02` | `LL-ACC-2001` (₹10,000.00) |

> [!WARNING]
> **Demonstration Credentials Notice:** These are local demonstration credentials only. Do not use them for production accounts. Production environments must never store default passwords or commit demo secrets.

