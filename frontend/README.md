# LedgerLine — Frontend Client Application

The **LedgerLine Frontend** is a modern, responsive single-page application (SPA) built with **React 19** and **Vite**. It provides institutional-grade interfaces for Account Holders, System Administrators, and Compliance Auditors to interact with the LedgerLine financial engine.

Designed around principles of financial clarity, transparency, and role separation, the UI renders real-time database-backed telemetry, enforces client-side idempotency protection, prevents negative balance inputs, and provides full double-entry ledger inspection.

---

## 1. Technology Stack

- **Framework:** React 19 (`react`, `react-dom` `^19.0.1`)
- **Build Tool & Dev Server:** Vite (`vite` `^8.3.0`, `@vitejs/plugin-react` `^6.1.1`)
- **Routing:** React Router v7 (`react-router-dom` `^7.18.5`)
- **HTTP Client:** Axios (`axios` `^1.21.0`) with request/response interceptors
- **Icons:** Lucide React (`lucide-react` `^0.546.0`)
- **Styling Architecture:** Plain Modular CSS with CSS Custom Properties (Zero Tailwind, Zero TypeScript)
- **Language:** JavaScript / JSX (ECMAScript 2023+)

---

## 2. Directory & Component Structure

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

---

## 3. Authentication & Routing Architecture

### 3.1 Authentication Context (`AuthContext.jsx`)
- **Cookie-Based Session Continuity:** On initial application load, `AuthContext` requests `POST /api/v1/auth/refresh`. The browser transmits the persistent `HttpOnly` cookie via credentialed CORS (`withCredentials: true`), restoring the session without storing tokens in `localStorage`.
- **In-Memory Access Tokens:** Short-lived access tokens are held in JavaScript memory via `setAccessToken` in `services/api.js`.
- **Event-Driven Multi-Tab Sync:** Custom window events (`ledgerline:token_refreshed` and `ledgerline:session_expired`) coordinate state across active browser tabs when a session refreshes or expires.
- **Immediate Deactivation Defense:** If an administrator suspends a user, the next API request triggers automatic logout and displays a deactivation notice.

### 3.2 Declarative Route Guards
- **`ProtectedRoute`:** Enforces authentication. If `isAuthenticated === false`, users are redirected to `/login`, preserving the intended destination in `location.state.from`.
- **`RoleBasedRoute`:** Enforces role-based access control (RBAC). If the authenticated user's role is not within `allowedRoles`, the application routes to `/unauthorized`.
- **`RootRedirect`:** Inspects user role upon navigating to `/` and automatically redirects to the appropriate dashboard:
  - `ACCOUNT_HOLDER` ➔ `/dashboard`
  - `ADMIN` ➔ `/admin/dashboard`
  - `AUDITOR` ➔ `/auditor/dashboard`

---

## 4. API Service & Axios Interceptor Architecture

All backend communication flows through `frontend/src/services/api.js`:

```
   Component Request
          │
          ▼
   Axios Request Interceptor
   - Injects `Authorization: Bearer <memory_token>`
   - Ensures `withCredentials: true`
          │
          ▼
   Express API Gateway (/api/v1)
          │
          ▼
   Axios Response Interceptor
   ┌──────────────────────────────────────────────────────────┐
   │ HTTP 200/201: Unwraps standardized envelope response    │
   │ HTTP 401: Triggers transparent single-flight refresh     │
   │           Queues concurrent in-flight requests           │
   │           Retries failed requests with new token         │
   │ HTTP 403: Detects deactivated account or forbidden role  │
   └──────────────────────────────────────────────────────────┘
```

### 4.1 Client-Side Idempotency
To prevent accidental double-clicks or duplicate financial postings during network instability, `transactionService.js` automatically attaches a cryptographically random UUIDv4 header to all mutation requests:
```javascript
headers: {
  'Idempotency-Key': crypto.randomUUID(),
}
```
If a request is retried, the backend identifies the key, returns the cached result, and avoids double-posting.

---

## 5. Role-Specific User Interfaces

### 5.1 Account Holder Portal
- **Dashboard (`/dashboard`):** Total liquid balance across all owned accounts, rapid access to transfers, deposits, and withdrawals, and recent account activity.
- **My Accounts (`/accounts`):** Grid of user-owned accounts showing account numbers, account types (`SAVINGS`, `CHECKING`), real-time balances, and modal dialog to open new operational accounts.
- **Transact (`/transactions`):** Multi-tab interface for executing **Deposits**, **Withdrawals**, and **Inter-Account Transfers**:
  - Validates transfer destination account numbers.
  - Automatically converts entered rupees into minor-unit integer paise.
  - Disables submit buttons during transit to prevent double-submissions.
  - Displays filterable transaction history with status badges (`SUCCESS`, `REFUSED`, `FAILED`).
- **Statements (`/statements`):** Comprehensive account statement viewer with running balances, double-entry ledger breakdown (Credit/Debit), and explicit audit logs of refused attempts with refusal reasons.

### 5.2 System Administrator Portal
- **Operational Control Panel (`/admin/dashboard`):**
  - **Metric KPI Grid:** 8 PostgreSQL database-backed aggregate metrics (Total Users, Active/Inactive Users, Total Accounts, Total Vault Assets, Total Transactions, Total Deposits, Total Withdrawals, Total Transfer Volume, Audit Logs).
  - **Transaction Analytics Chart:** Daily financial throughput bar chart proportional to transaction volume.
  - **Volume Composition:** Visual liquidity breakdown across deposits, withdrawals, and peer transfers.
  - **Operational System Health:** Real-time uptime and PostgreSQL connectivity probe.
  - **Recent Transactions & Ledger Inspector:** Inspect full double-entry postings (`CREDIT`/`DEBIT`) for any transaction.
  - **Recent Registered Identities Table:** Live list of registered identities directly from PostgreSQL.
- **User Governance (`/admin/users`):** Server-side paginated management table with real-time search, role filtering (`ACCOUNT_HOLDER`, `ADMIN`, `AUDITOR`), status filtering (`ACTIVE`, `SUSPENDED`), and one-click user activation/suspension.
- **Account Management (`/admin/accounts`):** System-wide institutional account management with freeze, close, and activation toggles.
- **Global Ledger (`/admin/ledger`):** Full, append-only double-entry journal across all institutional accounts.
- **Security Audit Register (`/admin/audit-events`):** Filterable security audit events with expandable metadata inspection.

### 5.3 Compliance Auditor Portal
- **Regulatory Dashboard (`/auditor/dashboard`):** High-level view of reserve integrity, audit stream velocity, and compliance telemetry.
- **Read-Only Verification:** Global Ledger, Audit Stream, and Statements are accessible for inspection. All mutation controls (Deposit, Withdraw, Transfer, User Modification) are strictly hidden and disabled.

---

## 6. Formatting & Minor-Unit Math

Floating-point math is strictly forbidden in financial calculations:
- **`formatCurrency(amount)`:** Converts raw numbers or strings into formatted INR (`₹12,34,567.89`) using the Indian Numbering System (Lakhs and Crores).
- **`formatPaise(paise)`:** Accepts integer paise (e.g., `50000`) and safely divides by 100 via BigInt arithmetic to format as rupees (`₹500.00`).
- **`formatDate(isoString)`:** Parses UTC ISO strings into locale-aware, human-readable date and time representations.

---

## 7. Environment Configuration

Create a `.env` file in the `frontend/` directory based on `.env.example`:

```env
# URL pointing to the LedgerLine Express API
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

In production (e.g. Render), this points to the deployed backend domain.

---

## 8. Installation & Development Commands

### 8.1 Install Dependencies
```bash
cd frontend
npm install
```

### 8.2 Start Development Server
```bash
npm run dev
```
The Vite development server will launch at `http://localhost:5173`.

### 8.3 Production Build
Compile the application into static production assets:
```bash
npm run build
```
Production assets are generated in the `dist/` directory.

### 8.4 Local Production Preview
Preview the production build locally:
```bash
npm run preview
```

