# LedgerLine — Frontend Client Application & Integration Guide

The **LedgerLine Frontend** is a modern, responsive single-page application (SPA) built with **React 19** and **Vite**. It provides institutional-grade interfaces for Account Holders, System Administrators, and Compliance Auditors to interact with the LedgerLine financial engine.

Designed around principles of financial correctness, transparency, and strict role separation, the UI renders real-time database-backed telemetry, enforces client-side idempotency protection, prevents negative balance inputs, and provides full double-entry ledger inspection.

---

## 1. Frontend Integration Overview

The LedgerLine frontend connects to the concurrency-safe Node.js / Express / PostgreSQL backend via a standardized RESTful API.

### Core Integration Principles
- **Zero Inventions:** Every frontend service, route parameter, request payload, and response field directly reflects the tested and passing backend implementation.
- **Financial Correctness:** Zero floating-point math in financial calculations. All monetary balances are stored as integer minor units (paise) and formatted for human readability using the Indian Numbering System (Lakhs and Crores).
- **Strict Role Separation:** Unprivileged users cannot view or trigger administrative actions; auditors operate within a verified read-only boundary where money mutations are physically hidden and blocked.
- **Client-Side Idempotency:** Financial mutations generate a cryptographic UUIDv4 key to prevent double-charging on network retries or accidental double-clicks.
- **Persistent Cookie Session Continuity:** Session authentication pairs short-lived in-memory access tokens with persistent, secure `HttpOnly` refresh token cookies.

---

## 2. Integration Architecture & System Communication

```
   ┌──────────────────────────────────────────────────────────┐
   │                 React 19 Frontend (Vite)                 │
   │  - AuthContext (Session restore via HttpOnly cookie)     │
   │  - React Router v7 (ProtectedRoute & RoleBasedRoute)     │
   │  - Account Holder, Admin & Auditor UI Portals            │
   └────────────────────────────┬─────────────────────────────┘
                                │ HTTP / REST (Axios)
                                │ Base URL: /api/v1
                                │ Authorization: Bearer <memory_token>
                                │ Idempotency-Key: <UUIDv4>
                                │ withCredentials: true
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │                  Express.js API Gateway                  │
   │  - CORS (Credentials allowed for trusted origin)         │
   │  - Rate Limiting (Auth: 20/15m, Txns: 50/1m, Gen: 100/15m│
   │  - Zod Request Schema Validation                         │
   │  - JWT & Cookie Authentication Middleware                │
   │  - Role-Based Access Control (RBAC) & IDOR Checks        │
   └────────────────────────────┬─────────────────────────────┘
                                │ Raw SQL (node-postgres)
                                │ Row Locks: SELECT ... FOR UPDATE
                                ▼
   ┌──────────────────────────────────────────────────────────┐
   │                PostgreSQL Database (Neon)                │
   │  - users, accounts, ledger_entries, transactions         │
   │  - idempotency_keys, audit_events, refresh_tokens        │
   └──────────────────────────────────────────────────────────┘
```

### 2.1 Technology Stack
- **Framework:** React 19 (`react`, `react-dom` `^19.0.1`)
- **Build Tool & Dev Server:** Vite (`vite` `^8.3.0`, `@vitejs/plugin-react` `^6.1.1`)
- **Routing:** React Router v7 (`react-router-dom` `^7.18.5`)
- **HTTP Client:** Axios (`axios` `^1.21.0`) with request/response interceptors
- **Icons:** Lucide React (`lucide-react` `^0.546.0`)
- **Styling Architecture:** Plain Modular CSS with CSS Custom Properties (Zero Tailwind, Zero TypeScript)
- **Language:** JavaScript / JSX (ECMAScript 2023+)

### 2.2 Directory & Component Structure
```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/                 # Reusable UI component library
│   │   ├── ConfirmModal/           # Action confirmation & inspection modals
│   │   ├── DataTable/              # Data tables with custom renders & empty states
│   │   ├── ErrorState/             # Error display with retry handler
│   │   ├── FormInput/              # Validated form input fields
│   │   ├── LoadingState/           # Accessible loading indicators
│   │   ├── StatCard/               # Metric KPI cards with trends & icons
│   │   └── StatusBadge/            # Semantic colored pills for roles, status, types
│   │
│   ├── context/
│   │   └── AuthContext.jsx         # Global auth state, session restore & event listeners
│   │
│   ├── layouts/
│   │   ├── AuthLayout/             # Minimalist card layout for Login & Register
│   │   └── DashboardLayout/        # Responsive institutional layout with sidebar & drawer
│   │
│   ├── pages/
│   │   ├── AccountManagement/      # Admin: System-wide account freeze/close controls
│   │   ├── Accounts/               # Account Holder: Personal accounts & creation
│   │   ├── AdminDashboard/         # Admin: System overview, analytics & recent telemetry
│   │   ├── AuditEvents/            # Admin & Auditor: Tamper-evident audit registers
│   │   ├── AuditorDashboard/       # Auditor: Regulatory telemetry & read-only overview
│   │   ├── Dashboard/              # Account Holder: Personal balance & quick transactions
│   │   ├── Ledger/                 # Admin & Auditor: Global double-entry journal entries
│   │   ├── Login/                  # Authentication entry portal
│   │   ├── Profile/                # Shared: User details, role badge, session status
│   │   ├── Register/               # Public account holder onboarding
│   │   ├── Statements/             # Account statements with running balances & refusals
│   │   ├── Transactions/           # Money movement (Deposit, Withdraw, Transfer)
│   │   ├── Unauthorized/           # HTTP 403 Forbidden boundary page
│   │   └── Users/                  # Admin: User governance with server-side pagination
│   │
│   ├── routes/
│   │   ├── AppRoutes.jsx           # Declarative React Router routing tree
│   │   ├── ProtectedRoute.jsx      # Unauthenticated redirect to /login
│   │   └── RoleBasedRoute.jsx      # Role access gate redirecting to /unauthorized
│   │
│   ├── services/
│   │   ├── api.js                  # Axios instance, token interceptor & 401 refresh queue
│   │   ├── accountService.js       # Account listing, creation & balance queries
│   │   ├── adminService.js         # Telemetry aggregation, user status & account toggles
│   │   ├── authService.js          # Login, register, cookie refresh, logout & profile
│   │   ├── ledgerService.js        # Double-entry ledger queries & audit logs
│   │   ├── statementService.js     # Periodic account statements & transaction history
│   │   ├── systemService.js        # Health check probes
│   │   └── transactionService.js   # Deposits, withdrawals, transfers with idempotency
│   │
│   ├── utils/
│   │   ├── formatCurrency.js       # Minor-unit (paise) to INR formatting (Lakhs/Crores)
│   │   ├── formatDate.js           # ISO timestamp formatting & relative time helpers
│   │   └── roleHelpers.js          # Role route mappers & display labels
│   │
│   ├── App.jsx                     # Root application provider wrapper
│   ├── index.css                   # Global design tokens, CSS variables & typography
│   └── main.jsx                    # React 19 entry point
│
├── .env.example                    # Sample frontend environment file
├── index.html                      # HTML entry template
├── package.json                    # Dependencies and scripts
└── vite.config.js                  # Vite build and proxy configuration
```

### 2.3 Base Configuration & Path Conventions
- **Axios Base URL:** `http://localhost:5000/api/v1` (Local development) or `/api/v1` (Production deployment).
  Configured dynamically in `frontend/src/services/api.js`:
  ```javascript
  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1';
  ```
- **Service Path Conventions:** All service paths are strictly relative to `baseURL` (e.g. `api.post('/auth/login', ...)`). Paths must not prepend `/api/v1` to avoid double-prefix issues.
- **Root Health Probe:** The unversioned health endpoint (`/health`) resides outside `/api/v1` and is requested by stripping `/api/v1` from the base URL or calling directly.
- **Standardized Response Envelope:**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Human readable status message",
    "data": { ... }
  }
  ```
- **Standardized Error Envelope:**
  ```json
  {
    "success": false,
    "statusCode": 400,
    "message": "Error description",
    "error": "Error details or validation array"
  }
  ```

---

## 3. API Integration & Client Handling

### 3.1 Service Modules
All HTTP requests are encapsulated inside specialized service modules in `frontend/src/services/`:
- `authService.js`: Authentication (`login`, `register`, `refreshToken`, `logout`, `getCurrentUser`).
- `accountService.js`: Account management (`getAccounts`, `createAccount`, `getAccountByNumber`, `getAccountBalance`).
- `transactionService.js`: Money mutations (`deposit`, `withdraw`, `transfer`, `getTransactions`, `getTransactionById`).
- `statementService.js`: Bank statements with running balance and refusal logs (`getStatement`).
- `ledgerService.js`: Global double-entry journal and audit events (`getLedgerEntries`, `getAccountLedger`, `getAuditEvents`).
- `adminService.js`: Administrative telemetry (`getDashboardOverview`, `getUsers`, `updateUserStatus`, `getAccounts`, `updateAccountStatus`, `getSystemHealth`).
- `systemService.js`: Operational health probes (`getHealth`).

### 3.2 Axios Interceptors
`frontend/src/services/api.js` configures robust request and response interceptors:

```javascript
// 1. Request Interceptor: Attach in-memory access token & enable credentials
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  config.withCredentials = true;
  return config;
});

// 2. Response Interceptor: Transparent 401 single-flight token rotation
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        // Queue concurrent in-flight requests while refresh is active
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const { token } = await authService.refreshToken();
        processQueue(null, token);
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        window.dispatchEvent(new CustomEvent('ledgerline:session_expired'));
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);
```

### 3.3 HTTP Error Codes & Client Handling Matrix

| HTTP Code | Backend Condition | Client UI Action |
| :--- | :--- | :--- |
| `400 Bad Request` | Zod validation error or insufficient account funds. | Renders inline field errors or alert banner with refusal reason. |
| `401 Unauthorized` | Access token missing, expired, or invalid. | Triggers single-flight refresh; redirects to `/login` if cookie is invalid. |
| `403 Forbidden` | Accessing another user's account (IDOR) or auditor calling money mutations. | Renders `/unauthorized` boundary or displays "Access Forbidden" banner. |
| `404 Not Found` | Target account, transaction, or user does not exist. | Displays "Resource Not Found" empty state. |
| `409 Conflict` | Reused `Idempotency-Key` with altered payload or email already registered. | Prompts user to generate a new transaction or log in. |
| `429 Too Many Requests` | Express rate limit exceeded. | Displays "Rate limit reached. Please wait a moment before trying again." |
| `500 Server Error` | Database connection or unhandled backend exception. | Displays `ErrorState` component with an explicit **Retry** button. |

---

## 4. Authentication Integration

### 4.1 Dual-Token Lifecycle
LedgerLine strictly separates access and refresh token responsibilities:
1. **In-Memory Access Tokens:** The access token is stored in JavaScript memory (`accessToken` variable in `api.js`) and never persisted in `localStorage` or `sessionStorage`.
2. **Persistent `HttpOnly` Cookies:** The refresh token is transmitted in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie, protecting against cross-site scripting (XSS) extraction.
3. **Session Restoration:** When the application opens or refreshes, `AuthContext` calls `POST /api/v1/auth/refresh`. If valid, the session is restored seamlessly without prompting for login.
4. **Token Rotation & Breach Detection:** Each refresh request rotates the token. If an already-rotated token is presented again (indicating token theft), the backend revokes all active sessions for that user.
5. **Multi-Tab Sync:** Custom window events (`ledgerline:token_refreshed` and `ledgerline:session_expired`) synchronize authentication state across multiple browser tabs.
6. **Immediate Deactivation Defense:** If an admin suspends a user, subsequent requests return HTTP 403, triggering immediate logout and presenting a deactivation notice.

---

## 5. Protected Routes and Role-Based Access

### 5.1 Route Guards (`frontend/src/routes/`)
- **`ProtectedRoute`:** Verifies authentication. Unauthenticated users are redirected to `/login`, preserving the intended path in `location.state.from`.
- **`RoleBasedRoute`:** Enforces RBAC permissions. Users attempting to access unauthorized sections are redirected to `/unauthorized`.
- **`RootRedirect`:** Automatically routes authenticated users from `/` to their role dashboard:
  - `ACCOUNT_HOLDER` ➔ `/dashboard`
  - `ADMIN` ➔ `/admin/dashboard`
  - `AUDITOR` ➔ `/auditor/dashboard`

### 5.2 Role-Specific Navigation Matrix

| Screen / Feature | Route | `ACCOUNT_HOLDER` | `AUDITOR` | `ADMIN` |
| :--- | :--- | :---: | :---: | :---: |
| **Login / Register** | `/login`, `/register` | ✅ | ✅ | ✅ |
| **User Profile** | `/profile` | ✅ | ✅ | ✅ |
| **Account Overview & Balances** | `/accounts` | ✅ *(Own)* | ✅ *(All)* | ✅ *(All)* |
| **Create New Account** | `/accounts` (Modal) | ✅ | ❌ | ✅ |
| **Deposit / Withdraw / Transfer** | `/transactions` | ✅ | ❌ *(Forbidden)* | ✅ |
| **Account Statements & Refusals** | `/statements/:id` | ✅ *(Own)* | ✅ *(All)* | ✅ *(All)* |
| **Global Double-Entry Ledger** | `/admin/ledger`, `/auditor/ledger` | ❌ | ✅ | ✅ |
| **Security Audit Register** | `/admin/audit-events`, `/auditor/audit-events` | ❌ | ✅ | ✅ |
| **Operational Control Panel** | `/admin/dashboard` | ❌ | ❌ | ✅ |
| **User Identity Governance** | `/admin/users` | ❌ | ❌ | ✅ |
| **Account Freeze / Close** | `/admin/accounts` | ❌ | ❌ | ✅ |
| **Regulatory Dashboard** | `/auditor/dashboard` | ❌ | ✅ | ❌ |

---

## 6. Backend Endpoint Integration

### 6.1 Authentication Endpoints (`/auth`)

#### 1. Register User (`POST /api/v1/auth/register`)
- **Request Body:**
  ```json
  {
    "fullName": "Kavi",
    "email": "kavi@example.com",
    "password": "Kavi@LL26#User01"
  }
  ```
- **Response (`201 Created`):**
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
        "isActive": true,
        "createdAt": "2026-11-05T15:35:41.279Z"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

#### 2. Login User (`POST /api/v1/auth/login`)
- **Request Body:**
  ```json
  {
    "email": "kavi@example.com",
    "password": "Kavi@LL26#User01"
  }
  ```
- **Response (`200 OK`):** Returns sanitized user object, signed access token in JSON payload, and sets the `HttpOnly` refresh token cookie.

#### 3. Current User Profile (`GET /api/v1/auth/me`)
- **Headers:** `Authorization: Bearer <token>`
- **Response (`200 OK`):** Returns user profile and array of owned bank accounts.

---

### 6.2 Account Management Endpoints (`/accounts`)

#### 1. Create Account (`POST /api/v1/accounts`)
- **Request Body:**
  ```json
  {
    "accountType": "SAVINGS",
    "currency": "INR"
  }
  ```
- **Response (`201 Created`):**
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

#### 2. Get Account Balance (`GET /api/v1/accounts/:accountNumber/balance`)
- **Response (`200 OK`):**
  ```json
  {
    "success": true,
    "statusCode": 200,
    "message": "Balance retrieved successfully",
    "data": {
      "accountId": "07be6ea0-6a47-47da-b514-1da78683bee5",
      "accountNumber": "LL-ACC-1001",
      "currency": "INR",
      "balancePaise": "364500",
      "balanceFormatted": "3645.00",
      "status": "ACTIVE"
    }
  }
  ```

---

### 6.3 Transaction & Money Movement Endpoints (`/transactions`)

#### 1. Deposit (`POST /api/v1/transactions/deposit`)
- **Headers:** `Idempotency-Key: <UUIDv4>`
- **Request Body:**
  ```json
  {
    "accountNumber": "LL-ACC-1001",
    "amount": "1000.00",
    "description": "Salary deposit"
  }
  ```
- **Response (`200 OK`):** Returns transaction reference, posting status, and updated `balanceAfterFormatted`.

#### 2. Withdraw (`POST /api/v1/transactions/withdraw`)
- **Headers:** `Idempotency-Key: <UUIDv4>`
- **Request Body:**
  ```json
  {
    "accountNumber": "LL-ACC-1001",
    "amount": "250.00",
    "description": "ATM cash withdrawal"
  }
  ```
- **Response (`200 OK`):** Returns transaction reference and updated balance. If funds are insufficient, returns `400 Bad Request` with refusal reason and logs an audit event.

#### 3. Inter-Account Transfer (`POST /api/v1/transactions/transfer`)
- **Headers:** `Idempotency-Key: <UUIDv4>`
- **Request Body:**
  ```json
  {
    "sourceAccountNumber": "LL-ACC-1001",
    "destinationAccountNumber": "LL-ACC-2001",
    "amount": "500.00",
    "description": "Invoice payment"
  }
  ```
- **Response (`200 OK`):**
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
      "sourceAccountNumber": "LL-ACC-1001",
      "destinationAccountNumber": "LL-ACC-2001",
      "amountPaise": "50000",
      "amountFormatted": "500.00",
      "sourceBalanceAfterPaise": "314500",
      "sourceBalanceAfterFormatted": "3145.00",
      "destinationBalanceAfterPaise": "1100000",
      "destinationBalanceAfterFormatted": "11000.00",
      "ledgerEntries": ["debit-uuid", "credit-uuid"]
    }
  }
  ```

---

### 6.4 Statement & Refusal Tracking (`GET /api/v1/statements/:accountNumber`)

- **Response (`200 OK`):**
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
        "currentBalancePaise": "364500",
        "currentBalanceFormatted": "3645.00",
        "status": "ACTIVE"
      },
      "pagination": {
        "totalCommittedEntries": 11,
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
          "resultingRunningBalanceFormatted": "3645.00",
          "resultingRunningBalancePaise": "364500",
          "description": "Invoice payment",
          "initiator": "Kavi"
        }
      ],
      "refusedAttempts": [
        {
          "id": "audit-uuid",
          "action": "TRANSACTION_WITHDRAW_REFUSED",
          "attemptedAt": "2026-11-05T17:49:32.614Z",
          "refusalReason": "Insufficient funds: Available balance is ₹3645.00, requested withdrawal is ₹10000.00",
          "attemptedAmount": "10000.00",
          "status": "REFUSED"
        }
      ]
    }
  }
  ```

---

### 6.5 Administrative & Auditor Endpoints

- **`GET /api/v1/admin/dashboard`:** Aggregated telemetry directly from PostgreSQL (total/active/inactive users, total/active accounts, vault balances, total deposits/withdrawals/transfers, volume trends chart data, recent transactions, and recent registered users).
- **`GET /api/v1/admin/users`:** Server-side paginated user management with `search`, `role`, and `status` query filters.
- **`PATCH /api/v1/admin/users/:userId/status`:** Toggle user active/suspended state (`{ isActive: boolean }`).
- **`GET /api/v1/admin/accounts`:** System-wide accounts directory with type and status filtering.
- **`PATCH /api/v1/admin/accounts/:accountId/status`:** Toggle account status (`{ status: "ACTIVE" | "FROZEN" | "CLOSED" }`).
- **`GET /api/v1/ledger`:** System-wide immutable double-entry journal entries.
- **`GET /api/v1/audit-events`:** System-wide audit event trail with pagination and filter params (`action`, `resourceType`, `startDate`, `endDate`).

---

## 7. Data Flow & Client Idempotency

### 7.1 Client-Side Idempotency Contract
1. **Key Generation:** When an Account Holder clicks "Submit Transfer" or "Confirm Withdrawal", `transactionService.js` creates a UUIDv4 string via `crypto.randomUUID()`.
2. **Button Locking:** The UI immediately disables the submit button and displays a progress spinner to prevent multiple submissions.
3. **Transmission:** The key is sent in the `Idempotency-Key` HTTP header.
4. **Retry Guarantee:** If a network timeout or connection drop occurs, resending the request with the identical key returns the original result without re-executing ledger entries.

### 7.2 Minor-Unit Formatting (`formatCurrency.js`)
All monetary values are stored in minor units (paise). To prevent IEEE 754 precision issues:
- `formatCurrency(amount)`: Formats numbers or string rupees into Indian locale currency (`₹12,34,567.89`).
- `formatPaise(paise)`: Converts integer paise into rupee strings via `BigInt` division (`50000n` ➔ `"500.00"`).
- `toPaise(rupees)`: Converts entered decimal strings into integer paise for backend submission (`"500.00"` ➔ `50000`).

---

## 8. Integration Decisions & Implementation Notes

- **Zero ORMs Alignment:** The backend uses pure raw SQL via `node-postgres` with explicit row locks (`SELECT ... FOR UPDATE`). The frontend receives serialized JSON models with BigInt strings and parses them safely.
- **Plain Modular CSS:** LedgerLine uses standard CSS with custom properties (`:root` variables) for typography, colors, border radiuses, and shadows. Zero Tailwind or utility CSS libraries are used, preserving lightweight asset delivery.
- **Vanilla JavaScript / JSX:** All components use native ES6+ React 19 JSX without TypeScript compilation overhead.
- **Open Redirect Defense:** The login component inspects `location.state.from` and validates that the path is an internal relative route before navigating, preventing open redirect vulnerabilities.
- **CORS with Credentials:** The frontend Axios client specifies `withCredentials: true`, enabling the browser to include secure `HttpOnly` refresh token cookies on API requests.

---

## 9. Environment Configuration & Scripts

### 9.1 Environment Variables
Create `.env` in the `frontend/` directory based on `.env.example`:
```env
# URL pointing to the LedgerLine Express API
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

### 9.2 Development & Build Commands
```bash
# Install dependencies
npm install

# Start Vite development server (http://localhost:5173)
npm run dev

# Compile static production bundle (dist/)
npm run build

# Preview production build locally
npm run preview
```

---

## 10. Demonstration Accounts

For local evaluation, four demonstration identities are configured in the system:

| Role | Display Name | Email Address | Pre-loaded Accounts |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | System Administration & Governance |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | Read-only Audit & Ledger View |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `LL-ACC-1001` (₹3,645.00), `LL-ACC-1002` (₹3,015.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `LL-ACC-2001` (₹10,500.00) |

> [!WARNING]
> **Local Demonstration Only:** Demonstration credentials are for local development and evaluation only. Passwords are logged to the console on server startup (`npm start`) and securely hashed in PostgreSQL. Never store or commit plaintext credentials.
