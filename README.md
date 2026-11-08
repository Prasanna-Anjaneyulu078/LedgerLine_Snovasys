# LedgerLine — Full-Stack Financial Transaction & Double-Entry Ledger System

LedgerLine is a secure, high-integrity financial transaction management and immutable double-entry bookkeeping system developed for the **Snovasys Fresher Hiring Challenge 2026**.

The application combines a high-performance, concurrency-safe **Node.js / Express / PostgreSQL (Neon)** backend with a modern, responsive **React 19 / Vite** frontend. Built on the core principle that **financial correctness always supersedes execution speed**, LedgerLine enforces strict double-entry balancing, deadlock-free concurrency, database-level append-only immutability, canonical idempotency protection, and multi-tier role-based access control.

---

## 1. Project Overview & Core Objectives

LedgerLine is designed to simulate an institutional-grade financial ledger engine:

1. **Double-Entry Bookkeeping:** Every monetary transfer generates simultaneous, balanced credit and debit ledger postings committed atomically within a single database transaction.
2. **Conservation of Money:** Aggregate system funds only alter through audited, explicit external deposits and withdrawals. Internal transfers preserve exact total vault balance.
3. **Concurrency & Overdraft Protection:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) and database constraints (`CHECK (balance >= 0)`) prevent racing withdrawals from overdrawing accounts.
4. **Deadlock Elimination:** Deterministic lexicographical lock ordering (`ORDER BY id ASC FOR UPDATE`) eliminates circular waits during simultaneous cross-account transfers.
5. **Idempotency Guarantee:** Canonical request hashing (SHA-256) combined with database-enforced unique constraints (`uq_user_idempotency_key`) prevents duplicate executions on network retries.
6. **Immutable Ledger Records:** An append-only ledger protected by database-level triggers (`trg_prevent_ledger_modification`) and restricted runtime roles (`ledgerline_runtime`), preventing any update or deletion.
7. **Minor-Unit Financial Accuracy:** Zero floating-point arithmetic. All balances and monetary quantities are processed in integer paise (1 INR = 100 paise) using JavaScript `BigInt` and PostgreSQL `BIGINT`.
8. **Role-Based Authorization & Separation of Duties:** Distinct dashboards and permissions for `ACCOUNT_HOLDER`, `ADMIN`, and `AUDITOR` roles, enforced at both the UI routing layer and the API gateway.

---

## 2. Technology Stack

### Backend
- **Runtime:** Node.js (v20+ LTS)
- **Framework:** Express.js (v4.21)
- **Language:** JavaScript (ES Modules, `"type": "module"`)
- **Database:** PostgreSQL on Neon Serverless
- **Database Driver:** `pg` (node-postgres) with 100% parameterized SQL queries (`$1, $2`)
- **Query Strategy:** Pure Raw SQL (Zero ORMs, query builders, or heavy abstractions)
- **Authentication:** JSON Web Tokens (`jsonwebtoken`) & bcrypt (12 salt rounds)
- **Input Validation:** Zod (v3.24) with strict schema validation (`.strict()`)
- **Logging:** Pino structured JSON logger with credential masking
- **Documentation:** OpenAPI / Swagger UI
- **Testing:** Jest + Supertest (106 integration tests executed against real Neon database)

### Frontend
- **Framework:** React 19 (`react`, `react-dom` v19.0)
- **Build Tool:** Vite (v8.3)
- **Routing:** React Router v7 (`react-router-dom` v7.18)
- **HTTP Client:** Axios (v1.21) with request/response interceptors
- **Icons:** Lucide React (`lucide-react` v0.546)
- **Styling:** Modular Plain CSS with CSS Custom Properties (Zero Tailwind, Zero TypeScript)
- **State Management:** React Context API (`AuthContext`) with browser `localStorage` and multi-tab synchronization

---

## 3. Application Architecture & Modules

```
                           ┌──────────────────────────────────────────┐
                           │          React 19 Frontend (Vite)        │
                           │  - AuthContext & Session Management      │
                           │  - ProtectedRoute & RoleBasedRoute       │
                           │  - Institutional Dashboard Layout        │
                           └────────────────────┬─────────────────────┘
                                                │ HTTP / REST (Axios)
                                                │ Bearer JWT + Idempotency-Key
                                                ▼
                           ┌──────────────────────────────────────────┐
                           │           Express.js API Gateway         │
                           │  - Helmet Security Headers & CORS        │
                           │  - Multi-tier Rate Limiting              │
                           │  - Zod Request Schema Validation         │
                           │  - JWT Authentication Middleware         │
                           │  - Role & Account Access Authorization   │
                           └────────────────────┬─────────────────────┘
                                                │ Raw SQL (node-postgres)
                                                │ Parameterized Queries ($1, $2)
                                                ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                 PostgreSQL Database (Neon)                                │
│                                                                                           │
│  ┌───────────────────────┐  ┌──────────────────────┐  ┌────────────────────────────────┐  │
│  │         users         │  │       accounts       │  │         ledger_entries         │  │
│  │ - id (UUID)           │  │ - id (UUID)          │  │ - id (UUID)                    │  │
│  │ - email (UNIQUE)      │  │ - account_number     │  │ - transaction_id               │  │
│  │ - role (ENUM)         │  │ - balance (BIGINT)   │  │ - account_id                   │  │
│  │ - is_active (BOOLEAN) │  │ - CHECK(balance >= 0)│  │ - entry_type (DEBIT/CREDIT)    │  │
│  └───────────────────────┘  └──────────────────────┘  │ - amount (BIGINT)              │  │
│                                                       │ - trg_prevent_modification     │  │
│  ┌───────────────────────┐  ┌──────────────────────┐  └────────────────────────────────┘  │
│  │      transactions     │  │   idempotency_keys   │  ┌────────────────────────────────┐  │
│  │ - id (UUID)           │  │ - user_id + key (UQ) │  │          audit_events          │  │
│  │ - reference (TXN-...) │  │ - request_hash       │  │ - id (UUID)                    │  │
│  │ - type (TRANSFER...)  │  │ - response_body      │  │ - actor_id + action            │  │
│  └───────────────────────┘  └──────────────────────┘  └────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

### Major Backend Modules
- **`modules/auth`:** User registration, password complexity validation, login, JWT issuance, profile retrieval (`/auth/me`).
- **`modules/accounts`:** Operational account creation, user-specific account listing, balance inquiry, account lookup.
- **`modules/transactions`:** Concurrency-safe deposits, withdrawals, and double-entry transfers with row-level locks and idempotency protection.
- **`modules/statements`:** Running balance calculations, committed ledger postings, and audit trails of refused transaction attempts.
- **`modules/ledger`:** Global double-entry journal querying, entry reconciliation, and audit reporting.
- **`modules/admin`:** System-wide user status management (activate/suspend) and operational account status toggles (`ACTIVE`, `FROZEN`, `CLOSED`).
- **`modules/audit`:** Immutable security audit event log inspection.

### Major Frontend Modules
- **`context/AuthContext.jsx`:** Central authentication provider managing user session, token storage, reactive cross-tab synchronization, and auto-logout on session expiration or account deactivation.
- **`routes/AppRoutes.jsx`:** Declarative React Router configuration with `RootRedirect`, `ProtectedRoute`, and `RoleBasedRoute` guards.
- **`services/`:** Type-safe API client wrappers (`authService`, `accountService`, `transactionService`, `statementService`, `ledgerService`, `adminService`) with standardized envelope unwrapping.
- **`utils/formatCurrency.js`:** Institutional currency formatting utilities (`formatCurrency`, `formatPaise`) handling Indian Numbering System lakhs and commas with BigInt precision.
- **`layouts/DashboardLayout/`:** Responsive navigation layout featuring off-canvas mobile drawer, breadcrumbs, status indicators, and institutional branding.

---

## 4. Supported User Roles & Permissions

LedgerLine enforces three distinct institutional roles:

| Capability / Section | `ACCOUNT_HOLDER` | `ADMIN` | `AUDITOR` |
| :--- | :---: | :---: | :---: |
| **Primary Dashboard** | `/dashboard` | `/admin/dashboard` | `/auditor/dashboard` |
| **View Personal Accounts** | Yes (Own accounts only) | Yes (All system accounts) | Yes (All system accounts) |
| **Create New Account** | Yes | Yes | No (Read-Only) |
| **Initiate Deposit / Withdrawal** | Yes | Yes | No (Strictly Forbidden) |
| **Initiate Inter-Account Transfer**| Yes (From owned account) | Yes | No (Strictly Forbidden) |
| **View Account Statements** | Yes (Owned accounts only) | Yes (All accounts) | Yes (All accounts) |
| **Inspect Global Double-Entry Ledger**| No (HTTP 403) | Yes (`/admin/ledger`) | Yes (`/auditor/ledger`) |
| **Inspect Security Audit Events** | No (HTTP 403) | Yes (`/admin/audit-events`) | Yes (`/auditor/audit-events`) |
| **User Status Management (Suspend/Activate)** | No (HTTP 403) | Yes (`/admin/users`) | No (HTTP 403) |
| **Account Status Management (Freeze/Close)** | No (HTTP 403) | Yes (`/admin/accounts`)| No (HTTP 403) |

---

## 5. Environment Variables & Configuration

### Backend Configuration (`backend/.env`)
Create `backend/.env` based on `backend/.env.example` using placeholder values:

```env
# Neon PostgreSQL Connection Strings
DATABASE_URL=postgresql://ledgerline_runtime:RUNTIME_PASSWORD@YOUR-NEON-POOLED-HOST/neondb?sslmode=verify-full
DIRECT_URL=postgresql://neondb_owner:OWNER_PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=verify-full

# Isolated Test Database Connection Strings
TEST_DATABASE_URL=postgresql://ledgerline_runtime:RUNTIME_PASSWORD@YOUR-NEON-POOLED-HOST/ledgerline_test?sslmode=verify-full
TEST_DIRECT_URL=postgresql://neondb_owner:OWNER_PASSWORD@YOUR-NEON-DIRECT-HOST/ledgerline_test?sslmode=verify-full

# Server Configuration
PORT=5000
NODE_ENV=development

# Security & Authentication
JWT_SECRET=replace_with_a_long_random_secret_at_least_32_characters
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12

# Logging & Telemetry
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

### Frontend Configuration (`frontend/.env`)
Create `frontend/.env` based on `frontend/.env.example`:

```env
# Base URL pointing to the LedgerLine Express backend API
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## 6. Installation & Setup Instructions

### Prerequisites
- **Node.js**: v20.x or higher LTS
- **npm**: v10.x or higher
- **PostgreSQL**: Neon Serverless PostgreSQL database (or local PostgreSQL 15+)

### Step 1: Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### Step 2: Database Setup & Migration

```bash
cd backend

# Execute database schema migrations (creates users, accounts, ledger, transactions, idempotency, audit)
npm run migrate

# Optional: Apply least-privilege runtime role permissions
npm run setup:runtime-role

# Seed initial institutional accounts, default users, and sample transaction history
npm run seed
```

### Step 3: Run Test Suites

```bash
# Execute backend automated integration and unit test suite
cd backend
npm test

# Verify frontend production build
cd ../frontend
npm run build
```

### Step 4: Start Development Servers

Open two terminal windows:

**Terminal 1 (Backend API Server):**
```bash
cd backend
npm start
# Server listens at: http://localhost:5000
# Interactive API documentation: http://localhost:5000/api-docs
# Health check: http://localhost:5000/health
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Vite development server runs at: http://localhost:5173
```

---

## 7. Default Seed Accounts & Demo Credentials

The database seeder pre-populates the following four verified demonstration identities:

| Role | Display Name | Email Address | Password | Associated Accounts |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | `Prasanna@LL26#Admin` | Full administrative oversight |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | `Sasank@LL26#Audit` | System-wide read-only inspection |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `Kavi@LL26#User01` | `LL-ACC-1001` (Savings: ₹5,000.00)<br/>`LL-ACC-1002` (Checking: ₹2,500.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `Ravi@LL26#User02` | `LL-ACC-2001` (Savings: ₹10,000.00) |

> [!WARNING]
> **Local Demonstration Only:** These credentials are for local demonstration and evaluation only. Do not use them for production accounts. Production deployments must enforce robust identity management, secure credential rotations, and strict environment isolation.

### Demonstration Database Initialization
To initialize the demonstration database with the required schema and seed accounts:
```bash
# 1. Run database migrations
cd backend
npm run migrate

# 2. Seed the 4 demonstration accounts and opening ledger entries
npm run seed
```

> [!NOTE]
> **Evaluation Credentials:** For testing and evaluation, enter any of the pre-seeded credentials above into the `/login` portal to inspect role-specific capabilities and permission boundaries. Demo credentials are deliberately omitted from the public UI for a clean, secure authentication experience.

---

## 8. API Overview & Authentication Flow

All API endpoints follow standardized REST design principles rooted under `/api/v1`:

### Authentication Lifecycle
1. **Public Registration (`POST /api/v1/auth/register`):**
   - Requires `{ fullName, email, password }` matching strict password complexity (min 8 chars, uppercase, lowercase, digit, special character).
   - Server-enforced role: Always assigns `ACCOUNT_HOLDER`. Client-supplied roles are rejected with HTTP 400.
   - Sets a secure, persistent `HttpOnly` refresh token cookie and returns a short-lived access token.
2. **Login (`POST /api/v1/auth/login`):**
   - Requires `{ email, password }`.
   - Returns a short-lived signed JWT access token in the response payload and sets a secure `HttpOnly` persistent refresh token cookie (`Max-Age: 7 days`, `Path=/`, `SameSite=Lax`).
   - Refresh tokens are never exposed to JavaScript or stored in `localStorage`.
3. **Session Restoration on Reopening (`POST /api/v1/auth/refresh`):**
   - When the user returns or reopens the browser, `AuthContext` calls `/auth/refresh`.
   - The browser automatically submits the `HttpOnly` cookie via credentialed CORS (`withCredentials: true`).
   - The backend validates the token against hashed records in PostgreSQL, rotates the refresh token (issuing a new `HttpOnly` cookie), and returns a fresh access token with user details.
   - Reopening LedgerLine seamlessly restores the session without prompting for login.
4. **Transparent Token Refresh & Request Queueing:**
   - Axios response interceptors catch 401 Unauthorized responses for in-flight requests.
   - Concurrency control queues simultaneous requests during refresh, executing a single-flight token rotation and retrying queued requests with the new access token.
5. **Token Reuse & Breach Detection:**
   - The `refresh_tokens` table tracks rotated tokens via `replaced_by_token_hash`.
   - If an already-rotated token is presented again (indicating potential token theft), the server immediately revokes all active sessions for that user and records an audit event (`AUTH_REFRESH_TOKEN_REUSE_DETECTED`).
6. **Explicit Logout (`POST /api/v1/auth/logout`):**
   - Revokes the refresh token record in the database.
   - Clears the `HttpOnly` cookie with identical attributes.
   - Clears in-memory client state, ensuring subsequent visits require fresh login.
7. **Session Verification (`GET /api/v1/auth/me`):**
   - Validates `Authorization: Bearer <token>`.
   - Returns active user details and associated accounts.

### Key API Endpoints
- **Authentication:** `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- **Accounts:** `GET /accounts`, `POST /accounts`, `GET /accounts/:accountNumber`, `GET /accounts/:accountNumber/balance`
- **Transactions:** `POST /transactions/deposit`, `POST /transactions/withdraw`, `POST /transactions/transfer`, `GET /transactions`
- **Statements:** `GET /statements/:accountNumber`
- **Global Ledger:** `GET /ledger`, `GET /ledger/:accountNumber`
- **Admin Management:** `GET /admin/users`, `PATCH /admin/users/:userId/status`, `GET /admin/accounts`, `PATCH /admin/accounts/:accountId/status`
- **Audit Trails:** `GET /audit-events`

---

## 9. Implemented Features & Known Limitations

### Implemented Features
- **Persistent Cookie-Based Authentication:** Secure `HttpOnly` refresh token cookies persist sessions across browser closures while preventing XSS token theft.
- **Cryptographic Refresh Token Rotation:** SHA-256 hashed refresh tokens rotated upon each refresh with token reuse breach detection.
- **Single-Flight Concurrency Refresh:** Axios response interceptors coordinate simultaneous requests during token renewal.
- **Deterministic Lock Ordering:** Prevents deadlock between simultaneous reciprocal transfers.
- **Strict Concurrency Safety:** `SELECT ... FOR UPDATE` row locks guarantee accurate balances under concurrent load.
- **Database-Level Immutability:** Append-only triggers prevent modifying or deleting ledger entries.
- **Idempotency Engine:** SHA-256 canonical hashing ensures duplicate requests return identical cached responses without double-posting.
- **Zero Floating-Point Financial Calculation:** Minor-unit integer paise and JavaScript `BigInt` prevent IEEE 754 precision errors.
- **Auditor Read-Only Boundary:** Frontend hides action triggers and backend API rejects mutations with HTTP 403.
- **Open Redirect Defense:** Login navigation validates internal relative paths to prevent phishing redirects.

### Known Limitations
- **In-Memory Rate Limiting:** Single-instance `express-rate-limit` counts in process memory. Multi-node clusters require a distributed Redis store.
- **Single Currency:** The ledger engine operates strictly in Indian Rupees (INR / paise) and does not support multi-currency foreign exchange operations.
- **Database Immutability Scope:** PostgreSQL row triggers protect against standard SQL modifications, but cannot prevent direct schema alterations by superusers (`neondb_owner`).

---

## 10. Challenge Compliance Matrix

This section verifies the full compliance of LedgerLine against the ten official specifications of the **Snovasys Fresher Hiring Challenge 2026**:

| # | Official Requirement | Status | Implementation File(s) & Endpoints | Test Suite Coverage | Verification Evidence |
| :-: | :--- | :---: | :--- | :--- | :--- |
| **1** | **Authentication & Three Distinct Roles** (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`) | **COMPLETE** | • `backend/src/modules/auth/auth.routes.js`<br/>• `backend/src/modules/auth/auth.service.js`<br/>• `backend/src/middleware/authenticate.js`<br/>• `backend/src/middleware/authorize.js`<br/>• `backend/src/database/migrations/008_create_refresh_tokens.sql`<br/>• `POST /api/v1/auth/register`<br/>• `POST /api/v1/auth/login`<br/>• `POST /api/v1/auth/refresh`<br/>• `POST /api/v1/auth/logout`<br/>• `GET /api/v1/auth/me` | `backend/tests/integration/auth.test.js`<br/>`backend/tests/integration/cookie_auth.test.js`<br/>`backend/tests/integration/authorization.test.js` | 26 auth integration tests passing. Persistent `HttpOnly` cookie authentication, refresh token rotation, token reuse breach detection, bcrypt hashing (12 rounds), JWT verification, and strict role discrimination (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`) verified. |
| **2** | **Account Creation, Balances & Statements** | **COMPLETE** | • `backend/src/modules/accounts/account.routes.js`<br/>• `backend/src/modules/accounts/account.service.js`<br/>• `POST /api/v1/accounts`<br/>• `GET /api/v1/accounts`<br/>• `GET /api/v1/accounts/:accountNumber/balance`<br/>• `GET /api/v1/statements/:accountNumber` | `backend/tests/integration/accounts.test.js`<br/>`backend/tests/integration/statements.test.js` | Creation with 0 initial balance, real-time balance queries in minor units (paise) and formatted rupees, and running balance ledger statements. |
| **3** | **Deposits, Withdrawals & Transfers** | **COMPLETE** | • `backend/src/modules/transactions/transaction.routes.js`<br/>• `backend/src/modules/transactions/transaction.service.js`<br/>• `POST /api/v1/transactions/deposit`<br/>• `POST /api/v1/transactions/withdraw`<br/>• `POST /api/v1/transactions/transfer` | `backend/tests/integration/deposit.test.js`<br/>`backend/tests/integration/withdrawal.test.js`<br/>`backend/tests/integration/transfer.test.js` | Direct deposit, balance-checked withdrawal, and balanced double-entry transfer (debit source, credit dest). |
| **4** | **Conservation of Money** | **COMPLETE** | • `backend/src/modules/transactions/transaction.service.js`<br/>• `backend/src/modules/ledger/ledger.service.js`<br/>• `backend/src/repositories/ledger.repository.js` | `backend/tests/integration/transfer.test.js` (`Successful transfer preserves money conservation`) | Internal transfers strictly preserve aggregate system balance. Sum of all credits equals sum of all debits. Verified via pre/post database balance sum assertions. |
| **5** | **No Unauthorized Negative Balances** (Overdraft Protection) | **COMPLETE** | • `backend/src/database/migrations/002_create_accounts.sql` (`CHECK (balance >= 0)`)<br/>• `backend/src/database/migrations/003_create_ledger_entries.sql` (`CHECK (balance_after >= 0)`)<br/>• `backend/src/modules/transactions/transaction.service.js` | `backend/tests/integration/withdrawal.test.js`<br/>`backend/tests/integration/transfer.test.js`<br/>`backend/tests/integration/concurrency.test.js` | Dual-layer protection: Post-lock validation throws `400 Bad Request`; PostgreSQL check constraints physically prevent committing any negative balance. |
| **6** | **Idempotency Guarantee** | **COMPLETE** | • `backend/src/database/migrations/005_create_idempotency_keys.sql`<br/>• `backend/src/modules/transactions/transaction.service.js`<br/>• `backend/src/repositories/idempotency.repository.js` | `backend/tests/integration/idempotency.test.js`<br/>`backend/tests/integration/transfer.test.js` | Database constraint `UNIQUE (user_id, idempotency_key)` and SHA-256 payload hashing. Replays cached response on identical retry; throws `409 Conflict` on payload modification. |
| **7** | **Concurrency Safety & Deadlock Prevention** | **COMPLETE** | • `backend/src/repositories/account.repository.js` (`findTwoForUpdate`)<br/>• `backend/src/modules/transactions/transaction.service.js` | `backend/tests/integration/concurrency.test.js`<br/>`backend/tests/integration/transfer.test.js` | Row locks acquired with `SELECT ... FOR UPDATE`. In transfers, account UUIDs are sorted deterministically (`ORDER BY id ASC FOR UPDATE`) eliminating deadlocks (`40P01`). Validated with simultaneous competing withdrawals and opposite-direction transfers. |
| **8** | **Statements with Refused Attempts & Initiators** | **COMPLETE** | • `backend/src/modules/statements/statement.service.js`<br/>• `backend/src/modules/statements/statement.routes.js`<br/>• `GET /api/v1/statements/:accountNumber`<br/>• `backend/src/repositories/audit.repository.js` | `backend/tests/integration/statements.test.js`<br/>`backend/tests/integration/authorization.test.js` | Statement output includes `committedPostings` with `initiator` (name of initiating user) and `resultingRunningBalanceFormatted`, plus `refusedAttempts` extracted from the audit log with refusal reasons. |
| **9** | **Account-Level Authorization (IDOR Prevention)** | **COMPLETE** | • `backend/src/middleware/authorize.js` (`authorizeAccountAccess`)<br/>• `backend/src/modules/transactions/transaction.service.js` | `backend/tests/integration/authorization.test.js`<br/>`backend/tests/integration/accounts.test.js` | Account holders are strictly blocked (`403 Forbidden`) from viewing balances, downloading statements, or initiating transactions on accounts they do not own. Auditors are blocked from money-movement. |
| **10** | **Automated Integrity & Authorization Tests** | **COMPLETE** | • `backend/tests/integration/`<br/>• `backend/tests/unit/money.test.js` | Jest + Supertest (`npm test --prefix backend`) | **126/126 passing across 11 test suites** against live Neon PostgreSQL database. Real isolation, genuine concurrency, real rollbacks. Zero mocking of database engine. |

---

## 11. Verification Documentation & Links

- **Threat Model & Security Evaluation:** [THREATS.md](THREATS.md) (Comprehensive 14-threat security evaluation and frontend risk analysis)
- **AI Engineering Prompt History:** [PROMPTS.md](PROMPTS.md) (Verbatim prompt logs across backend architecture and frontend integration phases)
- **Frontend Architecture Plan:** [FRONTEND_INTEGRATION_PLAN.md](FRONTEND_INTEGRATION_PLAN.md) (Detailed component layout, state models, and design system)
