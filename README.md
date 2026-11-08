# LedgerLine — Full-Stack Financial Transaction & Double-Entry Ledger System

LedgerLine is a secure, high-integrity financial transaction management and immutable double-entry bookkeeping system developed for the **Snovasys Fresher Hiring Challenge 2026**.

The platform couples a high-performance, concurrency-safe **Node.js / Express / PostgreSQL (Neon)** backend with a modern, responsive **React 19 / Vite** frontend. Built on the foundational tenet that **financial correctness always supersedes execution speed**, LedgerLine enforces strict double-entry balancing, deadlock-free concurrency, database-level append-only immutability, canonical idempotency protection, and multi-tier role-based access control.

---

## 1. Problem Statement & Core Objectives

Modern financial ledgers must guarantee zero financial discrepancies, resist concurrent race conditions, maintain immutable audit histories, and enforce strict role boundaries. LedgerLine simulates an institutional banking and ledger engine designed to fulfill the following core invariants:

1. **Double-Entry Bookkeeping:** Every monetary transfer generates simultaneous, balanced credit and debit ledger postings committed atomically within a single database transaction.
2. **Conservation of Money:** Aggregate system funds only alter through audited external deposits and withdrawals. Internal transfers preserve exact total vault balance.
3. **Concurrency & Overdraft Protection:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) and database constraints (`CHECK (balance >= 0)`) prevent racing withdrawals from overdrawing accounts.
4. **Deadlock Elimination:** Deterministic lexicographical lock ordering (`ORDER BY id ASC FOR UPDATE`) eliminates circular waits during simultaneous cross-account transfers.
5. **Idempotency Guarantee:** Canonical request hashing (SHA-256) combined with database-enforced unique constraints (`uq_user_idempotency_key`) prevents duplicate executions on network retries.
6. **Immutable Ledger Records:** An append-only ledger protected by database-level triggers (`trg_prevent_ledger_modification`) and restricted runtime roles (`ledgerline_runtime`), preventing any update or deletion.
7. **Minor-Unit Financial Accuracy:** Zero floating-point arithmetic. All balances and monetary quantities are processed in integer paise (1 INR = 100 paise) using JavaScript `BigInt` and PostgreSQL `BIGINT`.
8. **Role-Based Authorization & Separation of Duties:** Distinct dashboards and permissions for `ACCOUNT_HOLDER`, `ADMIN`, and `AUDITOR` roles, enforced at both the UI routing layer and the API gateway.

---

## 2. Overall Technology Stack

| Layer | Technologies & Tools | Key Responsibilities |
| :--- | :--- | :--- |
| **Frontend UI** | React 19, Vite, React Router v7, Axios, Lucide React, Plain Modular CSS | Responsive dashboard layouts, client-side idempotency, reactive multi-tab session synchronization, role-gated routes. |
| **Backend API** | Node.js (v20+ LTS), Express.js (v4.21), Zod, Pino Structured Logger | REST API gateway, JWT authentication, Zod input validation, rate limiting, centralized error handling, Swagger OpenAPI docs. |
| **Database & Engine** | PostgreSQL on Neon Serverless, `pg` (node-postgres) | Parameterized raw SQL queries, row-level locking (`FOR UPDATE`), atomic transactions, append-only triggers, minor-unit `BIGINT` math. |
| **Security & Auditing** | bcrypt (12 rounds), SHA-256 hashing, Helmet, `HttpOnly` cookies | Dual-token authentication with refresh token rotation and reuse breach detection, tamper-evident audit trail. |

---

## 3. High-Level System Architecture

```
                           ┌──────────────────────────────────────────┐
                           │          React 19 Frontend (Vite)        │
                           │  - AuthContext & Cookie Session Restore  │
                           │  - ProtectedRoute & RoleBasedRoute       │
                           │  - Account Holder, Admin & Auditor UIs   │
                           └────────────────────┬─────────────────────┘
                                                │ HTTP / REST (Axios)
                                                │ Bearer Token + Idempotency-Key
                                                │ withCredentials: true
                                                ▼
                           ┌──────────────────────────────────────────┐
                           │           Express.js API Gateway         │
                           │  - Helmet Security Headers & CORS        │
                           │  - Multi-tier Rate Limiting              │
                           │  - Zod Request Schema Validation         │
                           │  - JWT & Cookie Authentication           │
                           │  - Role & Account Access Authorization   │
                           └────────────────────┬─────────────────────┘
                                                │ Raw SQL (node-postgres)
                                                │ Parameterized Queries ($1, $2)
                                                │ SELECT ... FOR UPDATE
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
│                                                       ┌────────────────────────────────┐  │
│                                                       │         refresh_tokens         │  │
│                                                       │ - user_id + token_hash (SHA)   │  │
│                                                       │ - rotation & breach detection  │  │
│                                                       └────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Main Application Workflows

1. **User Authentication & Session Restoration:**
   - Public registration strictly assigns the `ACCOUNT_HOLDER` role.
   - Successful login issues an in-memory access token and sets a secure `HttpOnly` refresh token cookie.
   - Browser reloads and reopenings automatically restore active sessions via transparent single-flight token rotation.
2. **Account Provisioning:**
   - Account holders and administrators can open new savings or checking accounts with unique system account numbers (`LL-ACC-XXXX`).
3. **Financial Money Movement:**
   - **Deposits:** Credit customer accounts, backed by opening ledger postings.
   - **Withdrawals:** Verified against available balance under row locks; refused attempts are logged with explicit failure reasons.
   - **Inter-Account Transfers:** Balanced double-entry transfers executing simultaneous debit and credit postings, preserving money conservation.
4. **Statements & Audit Logs:**
   - Real-time running balance account statements listing committed postings alongside refused attempts.
   - Global double-entry journal and audit registers accessible by Administrators and Auditors.
5. **Administrative & Compliance Governance:**
   - Live PostgreSQL aggregate telemetry, daily transaction volume trends, and user activation/suspension toggles.

---

## 5. Security & Financial Integrity

- **Database-Level Invariants:** Check constraints physically prevent negative balances (`CHECK (balance >= 0)` and `CHECK (balance_after >= 0)`).
- **Append-Only Immutability:** Triggers on `ledger_entries` abort any SQL `UPDATE` or `DELETE` attempt at the database engine level.
- **Deadlock Free:** Competing multi-row locks in transfers are sorted lexicographically (`ORDER BY id ASC FOR UPDATE`), preventing cyclic waits.
- **Canonical Idempotency:** Financial mutations generate a client UUIDv4 and are validated against a SHA-256 payload hash in PostgreSQL.
- **IDOR Protection:** Account ownership verification middleware ensures users can only access accounts they legitimately own.
- **Token Security:** Refresh tokens are hashed in PostgreSQL and transmitted via `HttpOnly` cookies, preventing XSS extraction. Token reuse immediately revokes all user sessions.

---

## 6. Demonstration Accounts & Local Credentials

The database seeder pre-populates four verified demonstration identities for local evaluation:

| Role | Display Name | Email Address | Associated Accounts |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | Full administrative oversight |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | System-wide read-only inspection |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `LL-ACC-1001` (Savings: ₹5,000.00)<br/>`LL-ACC-1002` (Checking: ₹2,500.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `LL-ACC-2001` (Savings: ₹10,000.00) |

> [!WARNING]
> **Local Demonstration Only:** Demonstration credentials are for local testing and evaluation only. Passwords are logged to the console on server startup (`npm start`) and securely hashed in PostgreSQL. Never store or commit plaintext credentials.

---

## 7. Project Setup & Quickstart

### Prerequisites
- **Node.js**: v20.x or higher LTS
- **npm**: v10.x or higher
- **PostgreSQL**: Neon Serverless PostgreSQL instance (or local PostgreSQL 15+)

### 1. Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
cd ..
```

### 2. Configure Environment Variables
- Create `backend/.env` based on `backend/.env.example` (see [Backend README](backend/README.md)).
- Create `frontend/.env` based on `frontend/.env.example` (see [Frontend README](frontend/README.md)).

### 3. Initialize Demonstration Database
```bash
cd backend

# Execute database schema migrations
npm run migrate

# Seed demonstration accounts and initial ledger entries
npm run seed
```

### 4. Launch Development Servers
Open two terminal windows:

**Terminal 1 (Backend API):**
```bash
cd backend
npm start
# Server listens at: http://localhost:5000
# Health check: http://localhost:5000/health
# Interactive Swagger docs: http://localhost:5000/api-docs
```

**Terminal 2 (Frontend Client):**
```bash
cd frontend
npm run dev
# Vite development server runs at: http://localhost:5173
```

---

## 8. Documentation Index

For detailed technical references, implementation specifics, and threat modeling, refer to the dedicated documentation files:

- 📖 **[Backend Documentation](backend/README.md)**: Architecture, raw SQL schema, Express routing, transaction processing, idempotency, and Render deployment.
- 🎨 **[Frontend Documentation](frontend/README.md)**: React 19 architecture, Vite build pipeline, route guards, Axios interceptors, component library, and design tokens.
- 🛡️ **[Threat Model & Security Hardening](THREATS.md)**: Comprehensive 14-threat security evaluation, attack vectors, and automated mitigations.
- 🤖 **[AI Engineering Prompt History](PROMPTS.md)**: Verbatim prompt logs, architectural decisions, and bug fix histories.
- 📐 **[Frontend Integration Plan](FRONTEND_INTEGRATION_PLAN.md)**: Component layouts, state models, and design system specifications.
