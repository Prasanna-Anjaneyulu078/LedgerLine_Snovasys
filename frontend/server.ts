import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import crypto from 'crypto';

interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: 'ACCOUNT_HOLDER' | 'ADMIN' | 'AUDITOR';
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
}

interface Account {
  id: string;
  accountNumber: string;
  userId: string;
  holderName: string;
  accountType: 'SAVINGS' | 'CURRENT' | 'BUSINESS';
  balance: number; // In Rupees (e.g. 125000.50)
  currency: string;
  status: 'ACTIVE' | 'FROZEN' | 'CLOSED';
  ifscCode: string;
  branchName: string;
  createdAt: string;
}

interface Transaction {
  id: string;
  reference: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TRANSFER';
  fromAccountId?: string;
  toAccountId?: string;
  amount: number;
  description: string;
  status: 'SUCCESS' | 'REFUSED' | 'PENDING';
  initiatorId: string;
  initiatorName: string;
  refusalReason?: string;
  createdAt: string;
}

interface LedgerEntry {
  id: string;
  transactionId: string;
  transactionReference: string;
  accountId: string;
  accountNumber: string;
  entryType: 'DEBIT' | 'CREDIT';
  amount: number;
  balanceAfter: number;
  description: string;
  timestamp: string;
}

interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resource: string;
  status: 'SUCCESS' | 'FAILURE';
  ipAddress: string;
  details: string;
}

// In-Memory Database
const users: User[] = [
  {
    id: 'usr_001',
    name: 'Rahul Sharma',
    email: 'rahul.sharma@ledgerline.com',
    passwordHash: 'password123',
    role: 'ACCOUNT_HOLDER',
    status: 'ACTIVE',
    createdAt: '2026-01-15T09:30:00Z',
  },
  {
    id: 'usr_002',
    name: 'Kavita Iyer',
    email: 'admin.kavita@ledgerline.com',
    passwordHash: 'admin123',
    role: 'ADMIN',
    status: 'ACTIVE',
    createdAt: '2025-11-10T08:00:00Z',
  },
  {
    id: 'usr_003',
    name: 'Arun Varma',
    email: 'auditor.arun@ledgerline.com',
    passwordHash: 'audit123',
    role: 'AUDITOR',
    status: 'ACTIVE',
    createdAt: '2025-12-01T10:15:00Z',
  },
  {
    id: 'usr_004',
    name: 'Pooja Patel',
    email: 'pooja.patel@ledgerline.com',
    passwordHash: 'password123',
    role: 'ACCOUNT_HOLDER',
    status: 'ACTIVE',
    createdAt: '2026-02-18T11:45:00Z',
  },
  {
    id: 'usr_005',
    name: 'Suresh Nambiar',
    email: 'suresh.n@ledgerline.com',
    passwordHash: 'password123',
    role: 'ACCOUNT_HOLDER',
    status: 'SUSPENDED',
    createdAt: '2026-01-20T14:20:00Z',
  },
];

const accounts: Account[] = [
  {
    id: 'acc_001',
    accountNumber: 'LL-10024981',
    userId: 'usr_001',
    holderName: 'Rahul Sharma',
    accountType: 'SAVINGS',
    balance: 245000.00,
    currency: 'INR',
    status: 'ACTIVE',
    ifscCode: 'LGLN0001042',
    branchName: 'Mumbai Fort Institutional',
    createdAt: '2026-01-15T10:00:00Z',
  },
  {
    id: 'acc_002',
    accountNumber: 'LL-10024982',
    userId: 'usr_001',
    holderName: 'Rahul Sharma',
    accountType: 'CURRENT',
    balance: 1850000.50,
    currency: 'INR',
    status: 'ACTIVE',
    ifscCode: 'LGLN0001042',
    branchName: 'Mumbai Fort Institutional',
    createdAt: '2026-01-16T11:30:00Z',
  },
  {
    id: 'acc_003',
    accountNumber: 'LL-20058190',
    userId: 'usr_004',
    holderName: 'Pooja Patel',
    accountType: 'SAVINGS',
    balance: 92450.00,
    currency: 'INR',
    status: 'ACTIVE',
    ifscCode: 'LGLN0001042',
    branchName: 'Bengaluru Indiranagar',
    createdAt: '2026-02-18T12:00:00Z',
  },
  {
    id: 'acc_004',
    accountNumber: 'LL-30089211',
    userId: 'usr_005',
    holderName: 'Suresh Nambiar',
    accountType: 'BUSINESS',
    balance: 512000.00,
    currency: 'INR',
    status: 'FROZEN',
    ifscCode: 'LGLN0001042',
    branchName: 'Chennai Central',
    createdAt: '2026-01-20T15:00:00Z',
  },
];

const transactions: Transaction[] = [
  {
    id: 'tx_001',
    reference: 'TXN-20260301-8910',
    type: 'DEPOSIT',
    toAccountId: 'acc_001',
    amount: 100000.00,
    description: 'Initial institutional reserve allocation',
    status: 'SUCCESS',
    initiatorId: 'usr_001',
    initiatorName: 'Rahul Sharma',
    createdAt: '2026-03-01T10:00:00Z',
  },
  {
    id: 'tx_002',
    reference: 'TXN-20260302-3321',
    type: 'DEPOSIT',
    toAccountId: 'acc_002',
    amount: 2000000.00,
    description: 'Corporate operating balance replenishment',
    status: 'SUCCESS',
    initiatorId: 'usr_001',
    initiatorName: 'Rahul Sharma',
    createdAt: '2026-03-02T11:15:00Z',
  },
  {
    id: 'tx_003',
    reference: 'TXN-20260303-4412',
    type: 'WITHDRAWAL',
    fromAccountId: 'acc_002',
    amount: 150000.00,
    description: 'Vendor operational disbursement - Q1 IT Services',
    status: 'SUCCESS',
    initiatorId: 'usr_001',
    initiatorName: 'Rahul Sharma',
    createdAt: '2026-03-03T14:40:00Z',
  },
  {
    id: 'tx_004',
    reference: 'TXN-20260304-9981',
    type: 'TRANSFER',
    fromAccountId: 'acc_001',
    toAccountId: 'acc_003',
    amount: 25000.00,
    description: 'Inter-account liquidity transfer',
    status: 'SUCCESS',
    initiatorId: 'usr_001',
    initiatorName: 'Rahul Sharma',
    createdAt: '2026-03-04T09:20:00Z',
  },
  {
    id: 'tx_005',
    reference: 'TXN-20260304-7719',
    type: 'WITHDRAWAL',
    fromAccountId: 'acc_004',
    amount: 50000.00,
    description: 'Cashier withdrawal attempt',
    status: 'REFUSED',
    initiatorId: 'usr_005',
    initiatorName: 'Suresh Nambiar',
    refusalReason: 'Account status is FROZEN. Administrative hold prevents debit transactions.',
    createdAt: '2026-03-04T16:05:00Z',
  },
];

const ledgerEntries: LedgerEntry[] = [
  {
    id: 'led_001',
    transactionId: 'tx_001',
    transactionReference: 'TXN-20260301-8910',
    accountId: 'acc_001',
    accountNumber: 'LL-10024981',
    entryType: 'CREDIT',
    amount: 100000.00,
    balanceAfter: 100000.00,
    description: 'Initial institutional reserve allocation',
    timestamp: '2026-03-01T10:00:00Z',
  },
  {
    id: 'led_002',
    transactionId: 'tx_002',
    transactionReference: 'TXN-20260302-3321',
    accountId: 'acc_002',
    accountNumber: 'LL-10024982',
    entryType: 'CREDIT',
    amount: 2000000.00,
    balanceAfter: 2000000.00,
    description: 'Corporate operating balance replenishment',
    timestamp: '2026-03-02T11:15:00Z',
  },
  {
    id: 'led_003',
    transactionId: 'tx_003',
    transactionReference: 'TXN-20260303-4412',
    accountId: 'acc_002',
    accountNumber: 'LL-10024982',
    entryType: 'DEBIT',
    amount: 150000.00,
    balanceAfter: 1850000.00,
    description: 'Vendor operational disbursement - Q1 IT Services',
    timestamp: '2026-03-03T14:40:00Z',
  },
  {
    id: 'led_004',
    transactionId: 'tx_004',
    transactionReference: 'TXN-20260304-9981',
    accountId: 'acc_001',
    accountNumber: 'LL-10024981',
    entryType: 'DEBIT',
    amount: 25000.00,
    balanceAfter: 75000.00,
    description: 'Inter-account liquidity transfer to LL-20058190',
    timestamp: '2026-03-04T09:20:00Z',
  },
  {
    id: 'led_005',
    transactionId: 'tx_004',
    transactionReference: 'TXN-20260304-9981',
    accountId: 'acc_003',
    accountNumber: 'LL-20058190',
    entryType: 'CREDIT',
    amount: 25000.00,
    balanceAfter: 92450.00,
    description: 'Inter-account liquidity transfer from LL-10024981',
    timestamp: '2026-03-04T09:20:00Z',
  },
];

const auditEvents: AuditEvent[] = [
  {
    id: 'aud_001',
    timestamp: '2026-03-01T09:59:00Z',
    actorId: 'usr_001',
    actorEmail: 'rahul.sharma@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'USER_LOGIN',
    resource: 'AUTH_SESSION',
    status: 'SUCCESS',
    ipAddress: '192.168.1.104',
    details: 'User authenticated via password credentials from institutional subnet',
  },
  {
    id: 'aud_002',
    timestamp: '2026-03-01T10:00:00Z',
    actorId: 'usr_001',
    actorEmail: 'rahul.sharma@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'POST_DEPOSIT',
    resource: 'acc_001',
    status: 'SUCCESS',
    ipAddress: '192.168.1.104',
    details: 'Executed deposit of ₹1,00,000.00 to account LL-10024981 (Ref: TXN-20260301-8910)',
  },
  {
    id: 'aud_003',
    timestamp: '2026-03-02T11:15:00Z',
    actorId: 'usr_001',
    actorEmail: 'rahul.sharma@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'POST_DEPOSIT',
    resource: 'acc_002',
    status: 'SUCCESS',
    ipAddress: '192.168.1.104',
    details: 'Executed deposit of ₹20,00,000.00 to account LL-10024982 (Ref: TXN-20260302-3321)',
  },
  {
    id: 'aud_004',
    timestamp: '2026-03-03T14:40:00Z',
    actorId: 'usr_001',
    actorEmail: 'rahul.sharma@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'POST_WITHDRAWAL',
    resource: 'acc_002',
    status: 'SUCCESS',
    ipAddress: '192.168.1.104',
    details: 'Disbursement of ₹1,50,000.00 from LL-10024982 approved and debited',
  },
  {
    id: 'aud_005',
    timestamp: '2026-03-04T09:20:00Z',
    actorId: 'usr_001',
    actorEmail: 'rahul.sharma@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'POST_TRANSFER',
    resource: 'acc_001 -> acc_003',
    status: 'SUCCESS',
    ipAddress: '192.168.1.104',
    details: 'Double-entry transfer ₹25,000.00 posted across LL-10024981 and LL-20058190',
  },
  {
    id: 'aud_006',
    timestamp: '2026-03-04T16:05:00Z',
    actorId: 'usr_005',
    actorEmail: 'suresh.n@ledgerline.com',
    actorRole: 'ACCOUNT_HOLDER',
    action: 'POST_WITHDRAWAL',
    resource: 'acc_004',
    status: 'FAILURE',
    ipAddress: '192.168.2.55',
    details: 'Refused debit attempt: Account LL-30089211 is FROZEN under regulatory hold',
  },
  {
    id: 'aud_007',
    timestamp: '2026-03-05T08:30:00Z',
    actorId: 'usr_002',
    actorEmail: 'admin.kavita@ledgerline.com',
    actorRole: 'ADMIN',
    action: 'UPDATE_ACCOUNT_STATUS',
    resource: 'acc_004',
    status: 'SUCCESS',
    ipAddress: '10.0.1.20',
    details: 'Updated account LL-30089211 status to FROZEN following audit check',
  },
];

// Idempotency cache: key -> response
const idempotencyStore = new Map<string, any>();

function generateToken(user: User): string {
  const payload = {
    sub: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 86400 * 7,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

function parseToken(authHeader?: string): User | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const raw = authHeader.slice(7);
    const json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    const user = users.find((u) => u.id === json.sub);
    return user || null;
  } catch {
    return null;
  }
}

function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const user = parseToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Authentication token missing, invalid, or expired.',
    });
  }
  if (user.status === 'SUSPENDED') {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Your account has been suspended by an administrator.',
    });
  }
  (req as any).user = user;
  next();
}

function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user as User;
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `Access denied. Requires one of roles: ${roles.join(', ')}`,
      });
    }
    next();
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // CORS / Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Idempotency Middleware for mutating transaction endpoints
  app.use((req, res, next) => {
    const key = req.headers['idempotency-key'] as string;
    if (key && req.method === 'POST') {
      const cached = idempotencyStore.get(key);
      if (cached) {
        return res.status(cached.status).json(cached.body);
      }
    }
    next();
  });

  // --- AUTH ENDPOINTS ---
  // POST /api/v1/auth/register (ACCOUNT_HOLDER only)
  app.post('/api/v1/auth/register', (req: Request, res: Response) => {
    const { name, fullName, email, password, confirmPassword } = req.body;
    const resolvedName = (name || fullName || '').trim();
    if (!resolvedName || !email || !password) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Name, email, and password are required.' });
    }
    if (confirmPassword && password !== confirmPassword) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Passwords do not match.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Password must be at least 6 characters.' });
    }
    const existing = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return res.status(409).json({ error: 'CONFLICT', message: 'An account with this email already exists.' });
    }

    const newUser: User = {
      id: `usr_${Date.now()}`,
      name: resolvedName,
      email: email.trim().toLowerCase(),
      passwordHash: password,
      role: 'ACCOUNT_HOLDER', // Strictly server-assigned
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);

    // Create an initial savings account for the new user
    const newAccount: Account = {
      id: `acc_${Date.now()}`,
      accountNumber: `LL-${Math.floor(10000000 + Math.random() * 90000000)}`,
      userId: newUser.id,
      holderName: newUser.name,
      accountType: 'SAVINGS',
      balance: 10000.00, // Welcome opening balance
      currency: 'INR',
      status: 'ACTIVE',
      ifscCode: 'LGLN0001042',
      branchName: 'National Digital Banking Unit',
      createdAt: new Date().toISOString(),
    };
    accounts.push(newAccount);

    // Initial Ledger Entry
    ledgerEntries.push({
      id: `led_${Date.now()}`,
      transactionId: `tx_init_${newUser.id}`,
      transactionReference: `INIT-${Date.now()}`,
      accountId: newAccount.id,
      accountNumber: newAccount.accountNumber,
      entryType: 'CREDIT',
      amount: 10000.00,
      balanceAfter: 10000.00,
      description: 'Account activation opening balance',
      timestamp: new Date().toISOString(),
    });

    // Audit Event
    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: newUser.id,
      actorEmail: newUser.email,
      actorRole: 'ACCOUNT_HOLDER',
      action: 'USER_REGISTER',
      resource: newUser.id,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `New account holder registered with account ${newAccount.accountNumber}`,
    });

    const token = generateToken(newUser);
    return res.status(201).json({
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        status: newUser.status,
        createdAt: newUser.createdAt,
      },
    });
  });

  // POST /api/v1/auth/login
  app.post('/api/v1/auth/login', (req: Request, res: Response) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Email and password are required.' });
    }
    const user = users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    if (!user || user.passwordHash !== password) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid email or password credentials.' });
    }
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Your account has been suspended by an administrator.' });
    }

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'USER_LOGIN',
      resource: 'AUTH_SESSION',
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `User signed in successfully with role ${user.role}`,
    });

    const token = generateToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  // GET /api/v1/auth/me
  app.get('/api/v1/auth/me', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
      },
    });
  });

  // --- ACCOUNTS ENDPOINTS ---
  // GET /api/v1/accounts
  app.get('/api/v1/accounts', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    if (user.role === 'ACCOUNT_HOLDER') {
      const userAccounts = accounts.filter((a) => a.userId === user.id);
      return res.json({ accounts: userAccounts });
    } else if (user.role === 'ADMIN') {
      return res.json({ accounts });
    } else if (user.role === 'AUDITOR') {
      // Auditor view of accounts
      return res.json({ accounts });
    }
    return res.json({ accounts: [] });
  });

  // GET /api/v1/accounts/:id/balance
  app.get('/api/v1/accounts/:id/balance', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { id } = req.params;
    const account = accounts.find((a) => a.id === id || a.accountNumber === id);
    if (!account) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
    }
    if (user.role === 'ACCOUNT_HOLDER' && account.userId !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access balance for accounts you do not own.' });
    }
    return res.json({
      accountId: account.id,
      accountNumber: account.accountNumber,
      balance: account.balance,
      currency: account.currency,
      status: account.status,
      lastUpdated: new Date().toISOString(),
    });
  });

  // GET /api/v1/accounts/:id/statement
  app.get('/api/v1/accounts/:id/statement', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { id } = req.params;
    const account = accounts.find((a) => a.id === id || a.accountNumber === id);
    if (!account) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
    }
    if (user.role === 'ACCOUNT_HOLDER' && account.userId !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You cannot access statements for accounts you do not own.' });
    }

    // Committed ledger postings for this account
    const entries = ledgerEntries.filter((l) => l.accountId === account.id);

    // Refused attempts for this account
    const refusedAttempts = transactions.filter(
      (t) => (t.fromAccountId === account.id || t.toAccountId === account.id) && t.status === 'REFUSED'
    );

    return res.json({
      account: {
        id: account.id,
        accountNumber: account.accountNumber,
        holderName: account.holderName,
        accountType: account.accountType,
        balance: account.balance,
        currency: account.currency,
        status: account.status,
        ifscCode: account.ifscCode,
        branchName: account.branchName,
      },
      entries,
      refusedAttempts,
      generatedAt: new Date().toISOString(),
    });
  });

  // --- TRANSACTIONS ENDPOINTS ---
  // POST /api/v1/transactions/deposit
  app.post('/api/v1/transactions/deposit', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    if (user.role === 'AUDITOR') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Auditor accounts cannot initiate deposits.' });
    }

    const { accountId, amount, description } = req.body;
    const numAmount = parseFloat(amount);
    if (!accountId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid accountId and positive amount are required.' });
    }

    const account = accounts.find((a) => a.id === accountId || a.accountNumber === accountId);
    if (!account) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Target account not found.' });
    }

    if (user.role === 'ACCOUNT_HOLDER' && account.userId !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only deposit into eligible owned accounts.' });
    }

    if (account.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'ACCOUNT_INACTIVE', message: `Cannot deposit into an account with status ${account.status}.` });
    }

    // Execute deposit
    account.balance = Math.round((account.balance + numAmount) * 100) / 100;

    const txId = `tx_${Date.now()}`;
    const txRef = `DEP-${Math.floor(100000 + Math.random() * 900000)}`;
    const tx: Transaction = {
      id: txId,
      reference: txRef,
      type: 'DEPOSIT',
      toAccountId: account.id,
      amount: numAmount,
      description: description || 'Account deposit',
      status: 'SUCCESS',
      initiatorId: user.id,
      initiatorName: user.name,
      createdAt: new Date().toISOString(),
    };
    transactions.unshift(tx);

    const ledger: LedgerEntry = {
      id: `led_${Date.now()}`,
      transactionId: tx.id,
      transactionReference: tx.reference,
      accountId: account.id,
      accountNumber: account.accountNumber,
      entryType: 'CREDIT',
      amount: numAmount,
      balanceAfter: account.balance,
      description: description || 'Account credit deposit',
      timestamp: tx.createdAt,
    };
    ledgerEntries.unshift(ledger);

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'POST_DEPOSIT',
      resource: account.id,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `Credited ₹${numAmount.toFixed(2)} to ${account.accountNumber} (Ref: ${tx.reference})`,
    });

    const responsePayload = { transaction: tx, account, ledgerEntry: ledger };
    const idemKey = req.headers['idempotency-key'] as string;
    if (idemKey) {
      idempotencyStore.set(idemKey, { status: 201, body: responsePayload });
    }

    return res.status(201).json(responsePayload);
  });

  // POST /api/v1/transactions/withdraw
  app.post('/api/v1/transactions/withdraw', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    if (user.role === 'AUDITOR') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Auditor accounts cannot initiate withdrawals.' });
    }

    const { accountId, amount, description } = req.body;
    const numAmount = parseFloat(amount);
    if (!accountId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid accountId and positive amount are required.' });
    }

    const account = accounts.find((a) => a.id === accountId || a.accountNumber === accountId);
    if (!account) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Source account not found.' });
    }

    if (user.role === 'ACCOUNT_HOLDER' && account.userId !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only withdraw from eligible owned accounts.' });
    }

    if (account.status !== 'ACTIVE') {
      const refusedTx: Transaction = {
        id: `tx_${Date.now()}`,
        reference: `WTH-REF-${Math.floor(100000 + Math.random() * 900000)}`,
        type: 'WITHDRAWAL',
        fromAccountId: account.id,
        amount: numAmount,
        description: description || 'Account withdrawal',
        status: 'REFUSED',
        initiatorId: user.id,
        initiatorName: user.name,
        refusalReason: `Account status is ${account.status}. Debits are not permitted.`,
        createdAt: new Date().toISOString(),
      };
      transactions.unshift(refusedTx);
      return res.status(400).json({ error: 'ACCOUNT_INACTIVE', message: `Withdrawal refused: account status is ${account.status}.` });
    }

    if (account.balance < numAmount) {
      const refusedTx: Transaction = {
        id: `tx_${Date.now()}`,
        reference: `WTH-REF-${Math.floor(100000 + Math.random() * 900000)}`,
        type: 'WITHDRAWAL',
        fromAccountId: account.id,
        amount: numAmount,
        description: description || 'Account withdrawal',
        status: 'REFUSED',
        initiatorId: user.id,
        initiatorName: user.name,
        refusalReason: 'Insufficient funds for requested withdrawal amount.',
        createdAt: new Date().toISOString(),
      };
      transactions.unshift(refusedTx);
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance to complete withdrawal.' });
    }

    // Execute withdrawal
    account.balance = Math.round((account.balance - numAmount) * 100) / 100;

    const txId = `tx_${Date.now()}`;
    const txRef = `WTH-${Math.floor(100000 + Math.random() * 900000)}`;
    const tx: Transaction = {
      id: txId,
      reference: txRef,
      type: 'WITHDRAWAL',
      fromAccountId: account.id,
      amount: numAmount,
      description: description || 'Account withdrawal',
      status: 'SUCCESS',
      initiatorId: user.id,
      initiatorName: user.name,
      createdAt: new Date().toISOString(),
    };
    transactions.unshift(tx);

    const ledger: LedgerEntry = {
      id: `led_${Date.now()}`,
      transactionId: tx.id,
      transactionReference: tx.reference,
      accountId: account.id,
      accountNumber: account.accountNumber,
      entryType: 'DEBIT',
      amount: numAmount,
      balanceAfter: account.balance,
      description: description || 'Account debit withdrawal',
      timestamp: tx.createdAt,
    };
    ledgerEntries.unshift(ledger);

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'POST_WITHDRAWAL',
      resource: account.id,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `Debited ₹${numAmount.toFixed(2)} from ${account.accountNumber} (Ref: ${tx.reference})`,
    });

    const responsePayload = { transaction: tx, account, ledgerEntry: ledger };
    const idemKey = req.headers['idempotency-key'] as string;
    if (idemKey) {
      idempotencyStore.set(idemKey, { status: 201, body: responsePayload });
    }

    return res.status(201).json(responsePayload);
  });

  // POST /api/v1/transactions/transfer
  app.post('/api/v1/transactions/transfer', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    if (user.role === 'AUDITOR') {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Auditor accounts cannot initiate transfers.' });
    }

    const { sourceAccountId, destinationAccountId, amount, description } = req.body;
    const numAmount = parseFloat(amount);
    if (!sourceAccountId || !destinationAccountId || isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid source, destination, and positive amount are required.' });
    }

    if (sourceAccountId === destinationAccountId) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Source and destination accounts must be different.' });
    }

    const sourceAccount = accounts.find((a) => a.id === sourceAccountId || a.accountNumber === sourceAccountId);
    const destAccount = accounts.find((a) => a.id === destinationAccountId || a.accountNumber === destinationAccountId);

    if (!sourceAccount) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Source account not found.' });
    }
    if (!destAccount) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Destination account not found.' });
    }

    if (user.role === 'ACCOUNT_HOLDER' && sourceAccount.userId !== user.id) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'You can only transfer from accounts you own.' });
    }

    if (sourceAccount.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'ACCOUNT_INACTIVE', message: `Source account status is ${sourceAccount.status}.` });
    }
    if (destAccount.status !== 'ACTIVE') {
      return res.status(400).json({ error: 'ACCOUNT_INACTIVE', message: `Destination account status is ${destAccount.status}.` });
    }

    if (sourceAccount.balance < numAmount) {
      const refusedTx: Transaction = {
        id: `tx_${Date.now()}`,
        reference: `TRF-REF-${Math.floor(100000 + Math.random() * 900000)}`,
        type: 'TRANSFER',
        fromAccountId: sourceAccount.id,
        toAccountId: destAccount.id,
        amount: numAmount,
        description: description || 'Inter-account transfer',
        status: 'REFUSED',
        initiatorId: user.id,
        initiatorName: user.name,
        refusalReason: 'Insufficient funds in source account.',
        createdAt: new Date().toISOString(),
      };
      transactions.unshift(refusedTx);
      return res.status(400).json({ error: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance to complete transfer.' });
    }

    // Double-entry execution
    sourceAccount.balance = Math.round((sourceAccount.balance - numAmount) * 100) / 100;
    destAccount.balance = Math.round((destAccount.balance + numAmount) * 100) / 100;

    const txId = `tx_${Date.now()}`;
    const txRef = `TRF-${Math.floor(100000 + Math.random() * 900000)}`;
    const tx: Transaction = {
      id: txId,
      reference: txRef,
      type: 'TRANSFER',
      fromAccountId: sourceAccount.id,
      toAccountId: destAccount.id,
      amount: numAmount,
      description: description || `Transfer to ${destAccount.accountNumber}`,
      status: 'SUCCESS',
      initiatorId: user.id,
      initiatorName: user.name,
      createdAt: new Date().toISOString(),
    };
    transactions.unshift(tx);

    // Double-entry ledger postings: Debit source, Credit destination
    const debitEntry: LedgerEntry = {
      id: `led_${Date.now()}_dr`,
      transactionId: tx.id,
      transactionReference: tx.reference,
      accountId: sourceAccount.id,
      accountNumber: sourceAccount.accountNumber,
      entryType: 'DEBIT',
      amount: numAmount,
      balanceAfter: sourceAccount.balance,
      description: `Transfer out to ${destAccount.accountNumber}: ${description || 'Inter-account transfer'}`,
      timestamp: tx.createdAt,
    };
    const creditEntry: LedgerEntry = {
      id: `led_${Date.now()}_cr`,
      transactionId: tx.id,
      transactionReference: tx.reference,
      accountId: destAccount.id,
      accountNumber: destAccount.accountNumber,
      entryType: 'CREDIT',
      amount: numAmount,
      balanceAfter: destAccount.balance,
      description: `Transfer in from ${sourceAccount.accountNumber}: ${description || 'Inter-account transfer'}`,
      timestamp: tx.createdAt,
    };
    ledgerEntries.unshift(debitEntry, creditEntry);

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: 'POST_TRANSFER',
      resource: `${sourceAccount.accountNumber} -> ${destAccount.accountNumber}`,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `Double-entry transfer ₹${numAmount.toFixed(2)} posted from ${sourceAccount.accountNumber} to ${destAccount.accountNumber} (Ref: ${tx.reference})`,
    });

    const responsePayload = { transaction: tx, sourceAccount, destAccount, ledgerEntries: [debitEntry, creditEntry] };
    const idemKey = req.headers['idempotency-key'] as string;
    if (idemKey) {
      idempotencyStore.set(idemKey, { status: 201, body: responsePayload });
    }

    return res.status(201).json(responsePayload);
  });

  // GET /api/v1/transactions
  app.get('/api/v1/transactions', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    if (user.role === 'ACCOUNT_HOLDER') {
      const userAccIds = accounts.filter((a) => a.userId === user.id).map((a) => a.id);
      const userTx = transactions.filter(
        (t) => (t.fromAccountId && userAccIds.includes(t.fromAccountId)) || (t.toAccountId && userAccIds.includes(t.toAccountId))
      );
      return res.json({ transactions: userTx });
    }
    // Admin and Auditor can inspect transactions
    return res.json({ transactions });
  });

  // GET /api/v1/transactions/:id
  app.get('/api/v1/transactions/:id', authMiddleware, (req: Request, res: Response) => {
    const user = (req as any).user as User;
    const { id } = req.params;
    const tx = transactions.find((t) => t.id === id || t.reference === id);
    if (!tx) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Transaction not found.' });
    }

    if (user.role === 'ACCOUNT_HOLDER') {
      const userAccIds = accounts.filter((a) => a.userId === user.id).map((a) => a.id);
      const isOwned = (tx.fromAccountId && userAccIds.includes(tx.fromAccountId)) || (tx.toAccountId && userAccIds.includes(tx.toAccountId));
      if (!isOwned) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'You are not authorized to view this transaction.' });
      }
    }

    const entries = ledgerEntries.filter((l) => l.transactionId === tx.id);
    return res.json({ transaction: tx, ledgerEntries: entries });
  });

  // --- GLOBAL LEDGER ENDPOINTS (Strictly read-only) ---
  // GET /api/v1/ledger
  app.get('/api/v1/ledger', authMiddleware, requireRole('ADMIN', 'AUDITOR'), (req: Request, res: Response) => {
    return res.json({
      ledger: ledgerEntries,
      count: ledgerEntries.length,
      auditTimestamp: new Date().toISOString(),
    });
  });

  // GET /api/v1/ledger/:id
  app.get('/api/v1/ledger/:id', authMiddleware, requireRole('ADMIN', 'AUDITOR'), (req: Request, res: Response) => {
    const { id } = req.params;
    const entry = ledgerEntries.find((l) => l.id === id);
    if (!entry) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Ledger entry not found.' });
    }
    return res.json({ entry });
  });

  // --- AUDIT EVENTS ENDPOINTS ---
  // GET /api/v1/audit-events
  app.get('/api/v1/audit-events', authMiddleware, requireRole('ADMIN', 'AUDITOR'), (req: Request, res: Response) => {
    return res.json({
      events: auditEvents,
      count: auditEvents.length,
    });
  });

  // --- ADMIN MANAGEMENT ENDPOINTS ---
  // GET /api/v1/admin/users
  app.get('/api/v1/admin/users', authMiddleware, requireRole('ADMIN'), (req: Request, res: Response) => {
    const safeUsers = users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
    }));
    return res.json({ users: safeUsers });
  });

  // GET /api/v1/admin/accounts
  app.get('/api/v1/admin/accounts', authMiddleware, requireRole('ADMIN'), (req: Request, res: Response) => {
    return res.json({ accounts });
  });

  // PATCH /api/v1/admin/users/:id/status
  app.patch('/api/v1/admin/users/:id/status', authMiddleware, requireRole('ADMIN'), (req: Request, res: Response) => {
    const adminUser = (req as any).user as User;
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Status must be either ACTIVE or SUSPENDED.' });
    }

    const userToUpdate = users.find((u) => u.id === id);
    if (!userToUpdate) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found.' });
    }

    if (userToUpdate.id === adminUser.id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Administrators cannot alter their own active status.' });
    }

    const oldStatus = userToUpdate.status;
    userToUpdate.status = status;

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: 'UPDATE_USER_STATUS',
      resource: userToUpdate.id,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `Changed status for ${userToUpdate.email} from ${oldStatus} to ${status}`,
    });

    return res.json({
      message: `User status successfully updated to ${status}`,
      user: {
        id: userToUpdate.id,
        name: userToUpdate.name,
        email: userToUpdate.email,
        role: userToUpdate.role,
        status: userToUpdate.status,
      },
    });
  });

  // PATCH /api/v1/admin/accounts/:id/status
  app.patch('/api/v1/admin/accounts/:id/status', authMiddleware, requireRole('ADMIN'), (req: Request, res: Response) => {
    const adminUser = (req as any).user as User;
    const { id } = req.params;
    const { status } = req.body;

    if (!['ACTIVE', 'FROZEN', 'CLOSED'].includes(status)) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Status must be ACTIVE, FROZEN, or CLOSED.' });
    }

    const accountToUpdate = accounts.find((a) => a.id === id || a.accountNumber === id);
    if (!accountToUpdate) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Account not found.' });
    }

    const oldStatus = accountToUpdate.status;
    accountToUpdate.status = status;

    auditEvents.unshift({
      id: `aud_${Date.now()}`,
      timestamp: new Date().toISOString(),
      actorId: adminUser.id,
      actorEmail: adminUser.email,
      actorRole: adminUser.role,
      action: 'UPDATE_ACCOUNT_STATUS',
      resource: accountToUpdate.id,
      status: 'SUCCESS',
      ipAddress: req.ip || '127.0.0.1',
      details: `Changed account ${accountToUpdate.accountNumber} status from ${oldStatus} to ${status}`,
    });

    return res.json({
      message: `Account status updated to ${status}`,
      account: accountToUpdate,
    });
  });

  // Serve static assets in production or Vite middleware in dev
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[LedgerLine] Full-stack banking server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[LedgerLine] Server startup failed:', err);
  process.exit(1);
});
