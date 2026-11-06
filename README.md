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

## 3. Quick Start

```bash
cd backend
npm install
npm run migrate
npm run seed
npm test
npm start
```

Interactive API documentation available at: `http://localhost:5000/api-docs`  
Health check endpoint: `http://localhost:5000/health`

Please see [backend/README.md](backend/README.md) for full architecture and API documentation.

---

## 4. Challenge Verification & Architecture Documentation

- **Official Challenge Checklist**: [CHALLENGE_CHECKLIST.md](CHALLENGE_CHECKLIST.md) (10/10 compliance verification & test evidence)
- **Frontend Integration Plan**: [FRONTEND_INTEGRATION_PLAN.md](FRONTEND_INTEGRATION_PLAN.md) (Exhaustive route inventory, schemas, & component hierarchy)
- **Threat Model & Security**: [THREATS.md](THREATS.md) (Threat vectors, concurrency races, & mitigations)
- **AI Session History**: [PROMPTS.md](PROMPTS.md) (Genuine architectural session logs & design trade-offs)


