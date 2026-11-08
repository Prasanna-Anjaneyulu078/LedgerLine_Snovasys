# LedgerLine — Financial Transaction & Double-Entry Ledger Core

LedgerLine is a secure, high-integrity financial backend architecture developed for the **Snovasys Fresher Hiring Challenge 2026**. Built with Node.js, Express, and PostgreSQL (Neon), LedgerLine enforces double-entry bookkeeping, strict concurrency safety, deadlock prevention, idempotent operations, and immutable auditing.

---

## 1. Project Overview

LedgerLine is an accounting and money-movement engine built on the principle that **financial correctness always supersedes execution speed**. Key features include:

- **Double-Entry Bookkeeping**: Every financial transfer generates balanced debit and credit entries committed atomically.
- **Money Conservation**: Aggregate system funds only change via explicit external deposits and withdrawals.
- **Concurrency & Race Condition Safety**: PostgreSQL row-level locking (`SELECT ... FOR UPDATE`) prevents overdrafts and race conditions.
- **Deadlock-Free Transfers**: Deterministic ordering of account locks eliminates circular waits during simultaneous opposite-direction transfers.
- **Idempotency Guarantee**: Unique database-level constraints and SHA-256 request hashing protect against duplicate network retries.
- **Immutable Financial Ledger**: Append-only ledger entries that can never be updated or deleted.
- **Role-Based & Account-Level Authorization**: Server-enforced permissions for `ADMIN`, `ACCOUNT_HOLDER`, and `AUDITOR`.

---

## 2. Technology Stack

- **Runtime**: Node.js (LTS)
- **Framework**: Express.js
- **Language**: JavaScript (ES Modules, `"type": "module"`)
- **Database**: PostgreSQL on Neon
- **Database Driver**: `pg` (node-postgres) with parameterized queries
- **Query Approach**: Raw SQL (Zero ORMs or query builders used)
- **Authentication**: JWT & bcrypt (12 salt rounds)
- **Validation**: Zod
- **Testing**: Jest + Supertest (Real Neon test database verification)
- **API Documentation**: OpenAPI / Swagger UI
- **Logging**: Pino structured logger with credential redaction
- **Container Dependency**: None (zero Docker needed)

---

## 3. Architecture & Folder Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── env.js                  # Zod-validated environment config
│   │   ├── database.js             # pg.Pool connection manager & BigInt parser
│   │   └── logger.js               # Pino structured logger with redaction
│   │
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_create_users.sql
│   │   │   ├── 002_create_accounts.sql
│   │   │   ├── 003_create_ledger_entries.sql
│   │   │   ├── 004_create_transactions.sql
│   │   │   ├── 005_create_idempotency_keys.sql
│   │   │   ├── 006_create_audit_events.sql
│   │   │   └── 007_prevent_ledger_modification.sql
│   │   ├── migrate.js              # Safe SQL migration runner with advisory locks
│   │   ├── setup-runtime-role.js   # Provisions least-privilege application role
│   │   └── seed.js                 # Seed script with demo accounts and initial ledger
│   │
│   ├── modules/
│   │   ├── auth/                   # Registration, login, profile
│   │   ├── users/                  # User entity domain
│   │   ├── accounts/               # Account management & balances
│   │   ├── transactions/           # Deposit, withdraw, transfer engine
│   │   ├── ledger/                 # Double-entry ledger queries & reconciliation
│   │   ├── statements/             # Running balance statements & refusal audit
│   │   ├── audit/                  # Audit trail inspection
│   │   └── admin/                  # Administrative status management
│   │
│   ├── middleware/
│   │   ├── authenticate.js         # JWT Bearer token authentication
│   │   ├── authorize.js            # Role & account-level ownership authorization
│   │   ├── validate.js             # Zod schema request validation
│   │   ├── errorHandler.js         # Centralized error mapping (Zod, PG, AppError)
│   │   ├── rateLimiter.js          # Rate limiters for auth and transactions
│   │   └── requestLogger.js        # Request/response structured logging
│   │
│   ├── repositories/
│   │   ├── user.repository.js
│   │   ├── account.repository.js
│   │   ├── transaction.repository.js
│   │   ├── ledger.repository.js
│   │   ├── idempotency.repository.js
│   │   └── audit.repository.js
│   │
│   ├── utils/
│   │   ├── apiResponse.js          # Standardized API response format
│   │   ├── appError.js             # Operational HTTP exceptions
│   │   ├── asyncHandler.js         # Async error wrapper
│   │   └── money.js                # Minor unit (paise) math & conversions
│   │
│   ├── docs/
│   │   └── swagger.js              # OpenAPI 3.0 specification
│   │
│   ├── app.js                      # Express application setup
│   └── server.js                   # Server bootstrap & graceful shutdown
│
├── tests/
│   ├── helpers/
│   │   └── testDb.js               # Clean/seed helpers for Neon test database
│   ├── unit/
│   │   └── money.test.js           # Unit tests for paise arithmetic & formatting
│   └── integration/
│       ├── auth.test.js                 # Authentication & registration tests
│       ├── transactions.test.js         # Money conservation & double-entry tests
│       ├── idempotency.test.js          # Idempotent retry & conflict tests
│       ├── authorization.test.js        # RBAC & account ownership tests
│       ├── concurrency.test.js          # Parallel race condition & deadlock tests
│       └── ledger_immutability.test.js  # Append-only trigger & runtime role permission tests
│
├── docs/
│   ├── ARCHITECTURE.md             # Complete architectural blueprints & invariants
│   ├── DATABASE_DESIGN.md          # Relational design, ERD, indexes, & DDL specs
│   ├── API_DOCUMENTATION.md        # Endpoint specifications with request/responses
│   ├── THREATS.md                  # Threat model, mitigations, & automated tests
│   └── PROMPTS.md                  # AI development session logs & flaws corrected
│
├── .env.example
├── .gitignore
├── jest.config.js
├── package.json
└── README.md
```

---

## 4. Double-Entry Accounting & Money Representation

### Minor Units (Paise)
To eliminate IEEE 754 floating-point rounding errors, all amounts are stored as integer minor units:
- ₹1.00 = 100 paise.
- Database type: PostgreSQL `BIGINT` with `CHECK (balance >= 0)`.
- Runtime type: JavaScript `BigInt`.
- Zero floating-point numbers are used anywhere in financial computations.

### Double-Entry Ledger Invariants
1. **Debit / Credit Balancing**: Every internal transfer generates two entries: a `DEBIT` on the source account and a `CREDIT` on the destination account for the exact same amount.
2. **Zero-Sum System Transfers**: The sum of all transfer postings nets to zero.
3. **Running Balance Audit**: Each ledger entry records `balance_after`, representing the exact account balance following the posting.

---

## 5. Concurrency & Locking Strategy

When multiple concurrent operations target the same account, LedgerLine employs strict PostgreSQL row-level locks:

1. **Deterministic Multi-Row Locking**: In transfers involving Account A and Account B, locks are always acquired sorted by account UUID (`ORDER BY id ASC FOR UPDATE`). This eliminates circular-wait deadlocks (`40P01`).
2. **Post-Lock Balance Checks**: Account balances are validated *after* the row lock is acquired inside the database transaction.
3. **Atomic Commit & Rollback**: All ledger entries, account balance updates, and audit records commit atomically. If any error occurs, `ROLLBACK` leaves zero partial state.

---

## 6. Idempotency Implementation

Money-moving requests (`/deposit`, `/withdraw`, `/transfer`) support an `Idempotency-Key` header:
- **Identical Request Retry**: Replaying the same key with the same payload immediately returns the cached transaction response without re-executing any ledger entries.
- **Payload Tampering**: Reusing an existing key with a modified payload returns `409 Conflict`.
- **Atomic Persistence**: The idempotency record is locked and committed in the same database transaction as the financial ledger entries.

---

## 7. Demo Accounts & Development Credentials

The seed script creates four demonstration accounts with known credentials for local development:

| Role | Display Name | Email | Password | Initial Accounts & Balances |
| :--- | :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | `Prasanna@LL26#Admin` | System-wide administrative access |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | `Sasank@LL26#Audit` | Read-only access to ledger, statements, and audit |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `Kavi@LL26#User01` | `LL-ACC-1001` (Savings: ₹5,000.00)<br/>`LL-ACC-1002` (Checking: ₹2,500.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `Ravi@LL26#User02` | `LL-ACC-2001` (Savings: ₹10,000.00) |

> [!WARNING]
> **Local Demonstration Only:** These credentials are for local development and demonstration testing only. Do not use them for production accounts. Production environments must enforce strict password generation, environment-variable-backed secrets, and administrative access controls. Never store plaintext credentials in production repositories.

### Initializing the Demonstration Database
To apply all schema migrations and seed the four demonstration accounts:
```bash
# Run schema migrations
npm run migrate

# Seed demonstration accounts and initial ledger balances
npm run seed
```

---

## 8. Setup & Local Development Commands

### 1. Prerequisites
- Node.js LTS (v20+)
- Neon PostgreSQL account (or any accessible PostgreSQL instance)

### 2. Environment Configuration
Create `.env` based on `.env.example`:
```bash
cp .env.example .env
```
Populate your Neon database connection strings:
```ini
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-POOLED-HOST/neondb?sslmode=require
DIRECT_URL=postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=require
TEST_DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-TEST-HOST/neondb?sslmode=require
PORT=5000
NODE_ENV=development
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12
LOG_LEVEL=info
```

### 3. Install Dependencies
```bash
npm install
```

### 4. Execute Migrations
Applies the 7 sequential raw SQL migration files (including append-only trigger protection):
```bash
npm run migrate
```

### 5. Setup Restricted Runtime Role (Optional / Production)
Provisions the least-privilege `ledgerline_runtime` role and configures table grants:
```bash
npm run setup:runtime-role
# For test database:
npm run setup:runtime-role -- --test
```

### 6. Seed Database
Seeds demo users, initial accounts, and opening ledger entries:
```bash
npm run seed
```

### 7. Start the Server
```bash
npm start
# For auto-reloading during development:
npm run dev
```

### 8. Run Test Suite
Runs all 39 automated tests against real Neon PostgreSQL (covering unit tests and 6 integration test suites):
```bash
npm test
```

---

## 9. API Endpoints Quick Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | System and Neon database health check | Public |
| `GET` | `/api-docs` | Interactive Swagger UI documentation | Public |
| `POST` | `/api/v1/auth/register` | Register new user | Public |
| `POST` | `/api/v1/auth/login` | Authenticate and obtain JWT token | Public |
| `GET` | `/api/v1/auth/me` | Current user profile and accounts | Bearer Token |
| `GET` | `/api/v1/accounts` | List accounts (user or all for admin) | Bearer Token |
| `GET` | `/api/v1/accounts/:id/balance` | Get account balance | Owner / Admin / Auditor |
| `GET` | `/api/v1/accounts/:id/statement` | Statement with running balance | Owner / Admin / Auditor |
| `POST` | `/api/v1/transactions/deposit` | Deposit funds | Owner / Admin |
| `POST` | `/api/v1/transactions/withdraw` | Withdraw funds | Owner / Admin |
| `POST` | `/api/v1/transactions/transfer` | Double-entry transfer | Owner / Admin |
| `GET` | `/api/v1/transactions` | List transactions | Authenticated |
| `GET` | `/api/v1/transactions/:id` | Get transaction details & ledger entries | Participant / Admin / Auditor |
| `GET` | `/api/v1/ledger` | Global double-entry ledger | Admin / Auditor |
| `GET` | `/api/v1/ledger/:id` | Account ledger & balance reconciliation | Owner / Admin / Auditor |
| `GET` | `/api/v1/audit-events` | Audit event trail | Admin / Auditor |
| `GET` | `/api/v1/admin/users` | List system users | Admin |
| `GET` | `/api/v1/admin/accounts` | List system accounts | Admin |
| `PATCH`| `/api/v1/admin/users/:id/status` | Update user active status | Admin |
| `PATCH`| `/api/v1/admin/accounts/:id/status`| Update account status | Admin |

---

## 10. Deployment Instructions for Render

1. **Create Web Service** on [Render](https://render.com).
2. **Repository**: Connect your GitHub repository.
3. **Environment**: Select `Node`.
4. **Build Command**:
   ```bash
   npm install && npm run migrate
   ```
5. **Start Command**:
   ```bash
   npm start
   ```
6. **Environment Variables**: Add `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV=production`, `PORT=10000`.
7. **Health Check Path**: `/health`.

Render deploys LedgerLine natively without Docker containers.

