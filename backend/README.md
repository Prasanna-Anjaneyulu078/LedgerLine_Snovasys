# LedgerLine — Financial Transaction & Double-Entry Ledger Core

LedgerLine is a secure, high-integrity financial backend architecture developed for the **Snovasys Fresher Hiring Challenge 2026**. Built with **Node.js**, **Express**, and **PostgreSQL (Neon)**, LedgerLine enforces strict double-entry bookkeeping, deadlock-free concurrency, database-level append-only immutability, canonical idempotency protection, and multi-tier role-based access control.

---

## 1. Backend Overview & Architecture

LedgerLine operates on the core principle that **financial correctness always supersedes execution speed**:

1. **Balanced Double-Entry Bookkeeping:** Every monetary transfer generates simultaneous, balanced credit and debit ledger postings committed atomically within a single database transaction.
2. **Conservation of Money:** Aggregate system funds only alter through audited, explicit external deposits and withdrawals. Internal transfers preserve exact total vault balance.
3. **Concurrency & Overdraft Protection:** PostgreSQL row-level locks (`SELECT ... FOR UPDATE`) and database constraints (`CHECK (balance >= 0)`) prevent racing withdrawals from overdrawing accounts.
4. **Deadlock Elimination:** Deterministic lexicographical lock ordering (`ORDER BY id ASC FOR UPDATE`) eliminates circular waits during simultaneous cross-account transfers.
5. **Idempotency Guarantee:** Canonical request hashing (SHA-256) combined with database-enforced unique constraints (`uq_user_idempotency_key`) prevents duplicate executions on network retries.
6. **Immutable Ledger Records:** An append-only ledger protected by database-level triggers (`trg_prevent_ledger_modification`) and restricted runtime roles (`ledgerline_runtime`), preventing any update or deletion.
7. **Minor-Unit Financial Accuracy:** Zero floating-point arithmetic. All balances and monetary quantities are processed in integer paise (1 INR = 100 paise) using JavaScript `BigInt` and PostgreSQL `BIGINT`.
8. **Role-Based Authorization & Separation of Duties:** Distinct endpoints and permissions for `ACCOUNT_HOLDER`, `ADMIN`, and `AUDITOR` roles, enforced at both the UI routing layer and the API gateway.

---

## 2. Technology Stack

- **Runtime:** Node.js (v20+ LTS)
- **Framework:** Express.js (v4.21.2)
- **Language:** JavaScript (ES Modules, `"type": "module"`)
- **Database:** PostgreSQL on Neon Serverless (and local PostgreSQL 15+)
- **Database Driver:** `pg` (node-postgres v8.13.1) with 100% parameterized SQL queries (`$1, $2`)
- **Query Strategy:** Pure Raw SQL with connection pooling and PostgreSQL type parsers (BigInt parsing for OID 20). No ORMs (such as Prisma or TypeORM) were used, providing complete control over database locks (`FOR UPDATE`), raw transaction blocks, and trigger execution.
- **Authentication:** JSON Web Tokens (`jsonwebtoken` v9.0.2) with persistent `HttpOnly` refresh token cookies & bcrypt (12 salt rounds)
- **Validation:** Zod (v3.24.1) with strict schema validation
- **Logging:** Pino structured JSON logger (`pino` v9.6.0, `pino-http` v10.4.0) with sensitive credential redaction
- **Security:** Helmet (`helmet` v8.0.0), CORS (`cors` v2.8.5), Express Rate Limit (`express-rate-limit` v7.5.0)
- **API Documentation:** OpenAPI 3.0 / Swagger UI (`swagger-ui-express` v5.0.1)

---

## 3. Directory & Module Structure

```
backend/
├── docs/
│   ├── API_DOCUMENTATION.md        # Comprehensive endpoint specs with request/response payloads
│   ├── ARCHITECTURE.md             # Complete architectural blueprints & invariants
│   ├── DATABASE_DESIGN.md          # Relational design, ERD, indexes, & DDL specs
│   ├── PROMPTS.md                  # AI development session logs & flaws corrected
│   ├── RUNTIME_ROLE_SETUP.sql      # Least-privilege PostgreSQL role provisioning script
│   └── THREATS.md                  # Threat model, mitigations, & automated test verification
│
├── src/
│   ├── config/
│   │   ├── database.js             # pg.Pool connection manager & BigInt OID 20 parser
│   │   ├── env.js                  # Zod-validated environment configuration
│   │   └── logger.js               # Pino structured logger with credential masking
│   │
│   ├── database/
│   │   ├── migrations/
│   │   │   ├── 001_create_users.sql
│   │   │   ├── 002_create_accounts.sql
│   │   │   ├── 003_create_ledger_entries.sql
│   │   │   ├── 004_create_transactions.sql
│   │   │   ├── 005_create_idempotency_keys.sql
│   │   │   ├── 006_create_audit_events.sql
│   │   │   ├── 007_prevent_ledger_modification.sql
│   │   │   ├── 008_create_refresh_tokens.sql
│   │   │   └── 009_update_demo_users.sql
│   │   ├── migrate.js              # Migration runner with advisory locks (pg_advisory_lock)
│   │   ├── setup-runtime-role.js   # Provisions least-privilege application runtime role
│   │   └── seed.js                 # Idempotent database seeder with demo accounts & accounts
│   │
│   ├── docs/
│   │   └── swagger.js              # OpenAPI 3.0 specification
│   │
│   ├── middleware/
│   │   ├── authenticate.js         # JWT Bearer token verification & user resolution
│   │   ├── authorize.js            # Role-based & account ownership authorization (IDOR prevention)
│   │   ├── errorHandler.js         # Centralized error mapping (Zod, Postgres, AppError)
│   │   ├── rateLimiter.js          # Tiered rate limiters for auth and transactions
│   │   ├── requestLogger.js        # Request/response structured logging
│   │   └── validate.js             # Zod schema validation middleware
│   │
│   ├── modules/
│   │   ├── accounts/               # Account creation, listing, balances & status management
│   │   ├── admin/                  # System-wide telemetry, user governance & account controls
│   │   ├── audit/                  # Audit trail inspection endpoints
│   │   ├── auth/                   # Registration, login, cookie refresh, token rotation, profile
│   │   ├── ledger/                 # Global double-entry journal queries & reconciliation
│   │   ├── statements/             # Running balance statements & refusal audit logs
│   │   └── transactions/           # Concurrency-safe deposit, withdrawal, and transfer engine
│   │
│   ├── repositories/
│   │   ├── account.repository.js   # Account queries, balance updates & row-locking (findTwoForUpdate)
│   │   ├── audit.repository.js     # Append-only audit event persistence
│   │   ├── idempotency.repository.js # Idempotency key persistence & request hash verification
│   │   ├── ledger.repository.js    # Append-only double-entry ledger queries & journal inserts
│   │   ├── refresh-token.repository.js # Refresh token persistence, rotation & revocation
│   │   ├── transaction.repository.js # Transaction record creation & reference generation
│   │   └── user.repository.js      # User management, authentication lookups & status updates
│   │
│   ├── utils/
│   │   ├── apiResponse.js          # Standardized JSend-style API envelope
│   │   ├── appError.js             # Operational HTTP exceptions with status codes
│   │   ├── asyncHandler.js         # Express async exception handler wrapper
│   │   ├── cookie.js               # Secure HttpOnly refresh token cookie helpers
│   │   └── money.js                # Minor unit (paise) math, validation, and conversions
│   │
│   ├── app.js                      # Express application setup, security middleware, routing
│   └── server.js                   # Server bootstrap, DB health verification & graceful shutdown
│
├── tests/
│   ├── helpers/
│   │   └── testDb.js               # Clean/seed helpers for Neon test database
│   ├── unit/
│   │   └── money.test.js           # Unit tests for paise arithmetic & formatting
│   └── integration/
│       ├── account_number_transfer.test.js
│       ├── admin_dashboard.test.js
│       ├── api_verification_audit.test.js
│       ├── auth.test.js
│       ├── authorization.test.js
│       ├── concurrency.test.js
│       ├── cookie_auth.test.js
│       ├── idempotency.test.js
│       ├── ledger_immutability.test.js
│       └── transactions.test.js
│
├── .env.example
├── jest.config.js
├── package.json
└── README.md
```

---

## 4. Database Schema & Migration Pipeline

### 4.1 Schema Tables

1. **`users`:** Stores system user identities, legal full names, unique emails, bcrypt password hashes, roles (`ADMIN`, `ACCOUNT_HOLDER`, `AUDITOR`), and activation status (`is_active`).
2. **`accounts`:** Bank accounts owned by users with unique account numbers (`LL-ACC-XXXX`), account types (`SAVINGS`, `CHECKING`, `OPERATIONAL`), currency (`INR`), and integer balance in paise with a database check constraint (`CHECK (balance >= 0)`).
3. **`ledger_entries`:** Append-only double-entry ledger postings recording `transaction_id`, `account_id`, `entry_type` (`DEBIT` or `CREDIT`), integer `amount` in paise, and `balance_after` with `CHECK (balance_after >= 0)`.
4. **`transactions`:** Financial transactions recording unique references (`TXN-...`), `transaction_type` (`DEPOSIT`, `WITHDRAWAL`, `TRANSFER`), `amount`, `status` (`SUCCESS`, `REFUSED`, `FAILED`), source and destination account references, and initiating actor ID.
5. **`idempotency_keys`:** Request idempotency store with unique composite constraint `UNIQUE (user_id, idempotency_key)`, canonical request SHA-256 hash, HTTP status code, response body, and expiration timestamp.
6. **`audit_events`:** Append-only security audit trail capturing actor ID, action, resource type, resource ID, IP address, and JSON metadata.
7. **`refresh_tokens`:** Hashed persistent refresh tokens tracking expiration, revocation timestamp, replaced-by hash (for rotation), user agent, and IP address.
8. **`schema_migrations`:** Applied migration registry preventing re-execution and detecting schema discrepancies.

### 4.2 Migration Runner (`migrate.js`)
- Uses PostgreSQL transaction-level advisory locks (`SELECT pg_advisory_lock(987654321)`) to eliminate race conditions during concurrent server startups.
- Executes sequential SQL migration scripts inside atomic transactions (`BEGIN; ... COMMIT;`).

---

## 5. Authentication, JWT & Session Management

LedgerLine implements a dual-token authentication architecture:

```
  Client (Browser)                                    Express API
         │                                                 │
         │─── 1. POST /auth/login { email, password } ────▶│
         │                                                 │ Validate credentials (bcrypt)
         │                                                 │ Generate JWT Access Token (1d)
         │                                                 │ Generate Random Refresh Token
         │                                                 │ Store SHA-256 hash in DB
         │◀── 2. Response: Access Token in JSON ───────────│
         │       Set-Cookie: HttpOnly Refresh Token ───────│
         │                                                 │
         │─── 3. In-flight requests with Bearer Token ────▶│ Validates JWT in memory
         │                                                 │
         │─── 4. Access Token Expired (401) ──────────────▶│
         │       POST /auth/refresh (Cookie attached) ─────│ Validate refresh token hash
         │                                                 │ Rotate token: Revoke old, issue new
         │◀── 5. New Access Token & New Set-Cookie ────────│
```

### 5.1 Security Invariants
- **No Tokens in LocalStorage:** Refresh tokens are stored strictly in `HttpOnly` cookies (`SameSite=Lax`, `Path=/`, `Max-Age=7 days`), immune to client-side XSS extraction.
- **Token Rotation:** Every token refresh revokes the existing token and issues a new pair.
- **Breach & Reuse Detection:** If an already-rotated token is submitted again, the backend detects token theft, immediately revokes all sessions for that user, and emits an `AUTH_REFRESH_TOKEN_REUSE_DETECTED` audit event.
- **Password Complexity:** Enforces at least 8 characters, 1 uppercase, 1 lowercase, 1 digit, and 1 special character via Zod validation.
- **Role Isolation:** Public registration (`POST /api/v1/auth/register`) strictly assigns `ACCOUNT_HOLDER`. Client-supplied role parameters are rejected with HTTP 400.

---

## 6. Financial Engine & Double-Entry Bookkeeping

### 6.1 Minor Units (Paise)
To eliminate IEEE 754 floating-point rounding errors:
- ₹1.00 = 100 paise.
- All database columns (`balance`, `amount`, `balance_after`) use PostgreSQL `BIGINT`.
- JavaScript values are converted using native `BigInt` via `node-postgres` OID 20 type parser.
- Zero floating-point math is performed in financial calculations.

### 6.2 Transaction Processing Workflows

#### 1. Deposit (`POST /api/v1/transactions/deposit`)
- Validates positive amount in rupees and converts to paise.
- Acquires row lock on destination account (`SELECT ... FOR UPDATE`).
- Increments account balance.
- Creates `transactions` record with type `DEPOSIT` and status `SUCCESS`.
- Creates `ledger_entries` record with `CREDIT` and updated `balance_after`.
- Writes audit log.

#### 2. Withdrawal (`POST /api/v1/transactions/withdraw`)
- Acquires row lock on source account (`SELECT ... FOR UPDATE`).
- Verifies `balance >= amount`. If insufficient, records a `REFUSED` transaction, logs an audit refusal, and returns HTTP 400.
- Decrements account balance.
- Creates `transactions` record with type `WITHDRAWAL` and status `SUCCESS`.
- Creates `ledger_entries` record with `DEBIT` and updated `balance_after`.
- Writes audit log.

#### 3. Inter-Account Transfer (`POST /api/v1/transactions/transfer`)
- Resolves source and destination accounts by account number.
- Acquires row locks on both accounts in **deterministic lexicographical order** (`ORDER BY id ASC FOR UPDATE`) to prevent deadlocks (`40P01`).
- Verifies source balance.
- Decrements source balance, increments destination balance (net balance change: 0).
- Inserts balanced double-entry ledger entries:
  - `DEBIT` on source account (`amount`, `balance_after`).
  - `CREDIT` on destination account (`amount`, `balance_after`).
- Inserts `TRANSFER` transaction and writes audit log.

### 6.3 Database-Level Ledger Immutability
Ledger entries cannot be altered:
- Trigger `trg_prevent_ledger_modification` blocks `UPDATE` or `DELETE` on `ledger_entries`.
- Dedicated runtime role (`ledgerline_runtime`) possesses only `SELECT` and `INSERT` grants on `ledger_entries`.

---

## 7. API Specification Quick Reference

All API routes are prefixed with `/api/v1`.

### 7.1 Authentication Endpoints
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Public | Register new Account Holder |
| `POST` | `/auth/login` | Public | Authenticate with email and password |
| `POST` | `/auth/refresh` | Cookie | Rotate refresh token and issue new access token |
| `POST` | `/auth/logout` | Authenticated | Revoke refresh token and clear cookie |
| `GET` | `/auth/me` | Bearer Token | Retrieve profile and owned accounts |

### 7.2 Account Endpoints
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/accounts` | Bearer Token | List owned accounts (or all for Admin) |
| `POST` | `/accounts` | Account Holder / Admin | Create new operational account |
| `GET` | `/accounts/recipient/:accountNumber` | Authenticated | Safe recipient lookup for inter-user transfer validation |
| `GET` | `/accounts/:accountNumber` | Owner / Admin / Auditor | Get account details |
| `GET` | `/accounts/:accountNumber/balance` | Owner / Admin / Auditor | Get real-time account balance |

### 7.3 Transaction Endpoints
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/transactions/deposit` | Account Holder (Owner Only) | Deposit funds into owned account (Admin/Auditor forbidden: 403) |
| `POST` | `/transactions/withdraw` | Account Holder (Owner Only) | Withdraw funds with balance check (Admin/Auditor forbidden: 403) |
| `POST` | `/transactions/transfer` | Account Holder (Owner Only) | Balanced double-entry transfer (Admin/Auditor forbidden: 403) |
| `GET` | `/transactions` | Authenticated | List transactions with filters |
| `GET` | `/transactions/:id` | Participant / Admin / Auditor | Get transaction & ledger postings |

### 7.4 Statement & Ledger Endpoints
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/statements/:accountNumber` | Owner / Admin / Auditor | Bank statement with running balance & refusals |
| `GET` | `/ledger` | Admin / Auditor | Global double-entry journal entries |
| `GET` | `/ledger/:accountNumber` | Owner / Admin / Auditor | Account-specific double-entry ledger |
| `GET` | `/audit-events` | Admin / Auditor | System security audit trail |

### 7.5 Administration Endpoints
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/admin/dashboard` | Admin Only | System telemetry and aggregate analytics |
| `GET` | `/admin/users` | Admin Only | List users with server-side pagination & search |
| `PATCH`| `/admin/users/:userId/status` | Admin Only | Suspend or activate user account |
| `GET` | `/admin/accounts` | Admin Only | List all institutional accounts |
| `PATCH`| `/admin/accounts/:accountId/status` | Admin Only | Update account status (`ACTIVE`, `FROZEN`, `CLOSED`) |

### 7.6 System Health
| Method | Endpoint | Authorization | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Public | Server uptime and Neon PostgreSQL connection check |

---

## 8. Demonstration Accounts & Local Credentials

For local development and evaluation, four demonstration identities are pre-seeded:

| Role | Display Name | Email Address | Associated Accounts |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Prasanna Anjaneyulu | `prasanna.admin@example.com` | Full administrative oversight |
| **AUDITOR** | Sasank | `sasank.auditor@example.com` | System-wide read-only inspection |
| **ACCOUNT_HOLDER** | Kavi | `kavi@example.com` | `LL-ACC-1001` (Savings: ₹5,000.00)<br/>`LL-ACC-1002` (Checking: ₹2,500.00) |
| **ACCOUNT_HOLDER** | Ravi | `ravi@example.com` | `LL-ACC-2001` (Savings: ₹10,000.00) |

> [!WARNING]
> **Local Demonstration Only:** Demonstration credentials are for local testing only. Passwords are logged to the console on server startup (`npm start`) and securely hashed in PostgreSQL. Never store or commit plaintext credentials.

---

## 9. Environment Variables & Configuration

Create `backend/.env` based on `backend/.env.example`:

```env
# Neon PostgreSQL Connection Strings
DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-POOLED-HOST/neondb?sslmode=verify-full
DIRECT_URL=postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/neondb?sslmode=verify-full

# Isolated Test Database Connection Strings
TEST_DATABASE_URL=postgresql://USER:PASSWORD@YOUR-NEON-POOLED-HOST/ledgerline_test?sslmode=verify-full
TEST_DIRECT_URL=postgresql://USER:PASSWORD@YOUR-NEON-DIRECT-HOST/ledgerline_test?sslmode=verify-full

# Server Configuration
PORT=5000
NODE_ENV=development

# Security & Authentication
JWT_SECRET=super_secret_jwt_key_at_least_32_characters_long
JWT_EXPIRES_IN=1d
BCRYPT_SALT_ROUNDS=12

# Logging & Telemetry
LOG_LEVEL=info

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
```

---

## 10. Installation & Startup Commands

### 10.1 Install Dependencies
```bash
cd backend
npm install
```

### 10.2 Run Database Migrations
```bash
npm run migrate
```

### 10.3 Seed Demonstration Database
```bash
npm run seed
```

### 10.4 Configure Runtime Role (Optional / Production)
```bash
npm run setup:runtime-role
```

### 10.5 Start API Server
```bash
npm start
# For development with file watching:
npm run dev
```
The server will start at `http://localhost:5000`.
- Health check: `http://localhost:5000/health`
- Interactive Swagger docs: `http://localhost:5000/api-docs`

---

## 11. Deployment Instructions (Render)

1. Connect your repository to [Render](https://render.com) as a **Web Service**.
2. **Environment:** Node.
3. **Build Command:**
   ```bash
   cd backend && npm install && npm run migrate
   ```
4. **Start Command:**
   ```bash
   cd backend && npm start
   ```
5. **Environment Variables:** Provide `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `NODE_ENV=production`, `PORT=10000`.
6. **Health Check Path:** `/health`.
