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

The database seeder pre-populates the following verified institutional users:

| Role | Name | Email Address | Password | Associated Accounts |
| :--- | :--- | :--- | :--- | :--- |
| **System Admin** | System Administrator | `admin@ledgerline.internal` | `Admin@123456` | Full administrative oversight |
| **Account Holder** | Alice Sharma | `alice@example.com` | `Alice@123456` | `LL-ACC-1001`, `LL-ACC-1002`, `LL-ACC-1003` |
| **Account Holder** | Bob Sharma | `bob@example.com` | `Bob@123456` | `LL-ACC-2001`, `LL-ACC-2002` |
| **Compliance Auditor** | Compliance Auditor | `auditor@ledgerline.internal` | `Auditor@123456` | System-wide read-only inspection |

> [!NOTE]
> **Evaluation Credentials:** For testing and evaluation, enter any of the pre-seeded credentials above into the `/login` portal to inspect role-specific capabilities and permission boundaries. Demo credentials are deliberately omitted from the public UI for a clean, secure authentication experience.

---

## 8. API Overview & Authentication Flow

All API endpoints follow standardized REST design principles rooted under `/api/v1`:

### Authentication Lifecycle
1. **Public Registration (`POST /api/v1/auth/register`):**
   - Requires `{ fullName, email, password }` matching strict password complexity (min 8 chars, uppercase, lowercase, digit, special character).
   - Server-enforced role: Always assigns `ACCOUNT_HOLDER`. Client-supplied roles are rejected with HTTP 400.
2. **Login (`POST /api/v1/auth/login`):**
   - Requires `{ email, password }`.
   - Returns signed JWT bearer token and sanitized user profile.
3. **Session Verification (`GET /api/v1/auth/me`):**
   - Validates `Authorization: Bearer <token>`.
   - Returns active user details and associated accounts.
4. **Token Injection & Stale Request Protection:**
   - Axios request interceptors attach `Authorization: Bearer <token>` automatically.
   - Response interceptors distinguish failed auth attempts from session invalidation. Stale requests with previous tokens are prevented from removing newly established sessions.

### Key API Endpoints
- **Authentication:** `POST /auth/register`, `POST /auth/login`, `GET /auth/me`
- **Accounts:** `GET /accounts`, `POST /accounts`, `GET /accounts/:accountNumber`, `GET /accounts/:accountNumber/balance`
- **Transactions:** `POST /transactions/deposit`, `POST /transactions/withdraw`, `POST /transactions/transfer`, `GET /transactions`
- **Statements:** `GET /statements/:accountNumber`
- **Global Ledger:** `GET /ledger`, `GET /ledger/:accountNumber`
- **Admin Management:** `GET /admin/users`, `PATCH /admin/users/:userId/status`, `GET /admin/accounts`, `PATCH /admin/accounts/:accountId/status`
- **Audit Trails:** `GET /audit-events`

---

## 9. Implemented Features & Known Limitations

### Implemented Features
- **Deterministic Lock Ordering:** Prevents deadlock between simultaneous reciprocal transfers.
- **Strict Concurrency Safety:** `SELECT ... FOR UPDATE` row locks guarantee accurate balances under concurrent load.
- **Database-Level Immutability:** Append-only triggers prevent modifying or deleting ledger entries.
- **Idempotency Engine:** SHA-256 canonical hashing ensures duplicate requests return identical cached responses without double-posting.
- **Zero Floating-Point Financial Calculation:** Minor-unit integer paise and JavaScript `BigInt` prevent IEEE 754 precision errors.
- **Auditor Read-Only Boundary:** Frontend hides action triggers and backend API rejects mutations with HTTP 403.
- **Open Redirect Defense:** Login navigation validates internal relative paths to prevent phishing redirects.

### Known Limitations
- **In-Memory Rate Limiting:** Single-instance `express-rate-limit` counts in process memory. Multi-node clusters require a distributed Redis store.
- **Access Token Expiration Without Silent Refresh:** JWT tokens expire after their configured duration (default 15 minutes). Users must re-authenticate as rotating refresh tokens are not implemented.
- **Storage Medium (`localStorage` vs. `HttpOnly` Cookies):** Tokens reside in browser `localStorage`. While immune to CSRF, `localStorage` is accessible to JavaScript within the origin.
- **Single Currency:** The ledger engine operates strictly in Indian Rupees (INR / paise) and does not support multi-currency foreign exchange operations.
- **Database Immutability Scope:** PostgreSQL row triggers protect against standard SQL modifications, but cannot prevent direct schema alterations by superusers (`neondb_owner`).

---

## 10. Verification Documentation & Links

- **Challenge Checklist:** [CHALLENGE_CHECKLIST.md](CHALLENGE_CHECKLIST.md) (Complete hiring challenge compliance matrix)
- **Threat Model & Security Evaluation:** [THREATS.md](THREATS.md) (Comprehensive 14-threat security evaluation and frontend risk analysis)
- **AI Engineering Prompt History:** [PROMPTS.md](PROMPTS.md) (Verbatim prompt logs across backend architecture and frontend integration phases)
- **Frontend Architecture Plan:** [FRONTEND_INTEGRATION_PLAN.md](FRONTEND_INTEGRATION_PLAN.md) (Detailed component layout, state models, and design system)
