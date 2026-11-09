export const swaggerDocument = {
  openapi: '3.0.0',
  info: {
    title: 'LedgerLine Financial Core API',
    version: '1.0.0',
    description:
      'High-integrity double-entry ledger & money movement management system backend developed for Snovasys Fresher Hiring Challenge 2026.',
    contact: {
      name: 'LedgerLine Core Architecture Team',
    },
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base URL',
    },
    {
      url: '/',
      description: 'Root URL',
    },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT access token retrieved from /auth/login or /auth/register',
      },
      IdempotencyHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'Idempotency-Key',
        description: 'UUID or unique string ensuring financial transaction request idempotency',
      },
    },
    schemas: {
      ApiResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          statusCode: { type: 'integer', example: 200 },
          message: { type: 'string', example: 'Operation successful' },
          data: { type: 'object' },
        },
      },
      UserRegister: {
        type: 'object',
        required: ['fullName', 'email', 'password'],
        properties: {
          fullName: { type: 'string', example: 'Kavi' },
          email: { type: 'string', format: 'email', example: 'kavi@example.com' },
          password: { type: 'string', format: 'password', example: 'Kavi@LL26#User01' },
        },
      },
      UserLogin: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'kavi@example.com' },
          password: { type: 'string', format: 'password', example: 'Kavi@LL26#User01' },
        },
      },
      CreateAccountRequest: {
        type: 'object',
        properties: {
          accountType: { type: 'string', enum: ['SAVINGS', 'CHECKING', 'OPERATIONAL'], example: 'SAVINGS' },
          currency: { type: 'string', example: 'INR' },
        },
      },
      DepositRequest: {
        type: 'object',
        required: ['accountNumber', 'amount'],
        properties: {
          accountNumber: {
            type: 'string',
            example: 'LL-ACC-1001',
            description: 'Destination bank account number',
          },
          amount: { type: 'string', example: '500.00' },
          description: { type: 'string', example: 'Direct salary deposit' },
        },
      },
      WithdrawalRequest: {
        type: 'object',
        required: ['accountNumber', 'amount'],
        properties: {
          accountNumber: {
            type: 'string',
            example: 'LL-ACC-1001',
            description: 'Source bank account number owned by authenticated user',
          },
          amount: { type: 'string', example: '150.00' },
          description: { type: 'string', example: 'ATM Cash Withdrawal' },
        },
      },
      TransferRequest: {
        type: 'object',
        required: ['sourceAccountNumber', 'destinationAccountNumber', 'amount'],
        properties: {
          sourceAccountNumber: {
            type: 'string',
            example: 'LL-ACC-1001',
            description: 'Source bank account number owned by authenticated user (or managed by Admin)',
          },
          destinationAccountNumber: {
            type: 'string',
            example: 'LL-ACC-2001',
            description: 'Destination bank account number to receive the funds',
          },
          amount: {
            type: 'string',
            example: '250.00',
            description: 'Monetary amount in INR (converted to integer paise minor units)',
          },
          description: {
            type: 'string',
            example: 'Rent payment split',
            description: 'Optional transaction memo (max 255 chars)',
          },
        },
      },
      UserStatusUpdateRequest: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean', example: false },
        },
      },
      AccountStatusUpdateRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { type: 'string', enum: ['ACTIVE', 'FROZEN', 'CLOSED'], example: 'FROZEN' },
        },
      },
    },
  },
  paths: {
    '/health': {
      servers: [
        {
          url: '/',
          description: 'Root URL',
        },
      ],
      get: {
        summary: 'System and database health check',
        description: 'Public health-check endpoint reporting server status, uptime, and live PostgreSQL connection state.',
        responses: {
          200: { description: 'System healthy' },
          503: { description: 'Database unreachable' },
        },
      },
    },
    '/auth/register': {
      post: {
        summary: 'Register new user',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserRegister' } } },
        },
        responses: { 201: { description: 'Registered successfully' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Authenticate and receive JWT access token with persistent HttpOnly refresh cookie',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserLogin' } } },
        },
        responses: { 200: { description: 'Login successful' } },
      },
    },
    '/auth/refresh': {
      post: {
        summary: 'Rotate refresh token and issue new access token using persistent HttpOnly cookie',
        description: 'Verifies the persistent HttpOnly refresh cookie, rotates the token in PostgreSQL, and returns a fresh short-lived JWT access token.',
        responses: {
          200: { description: 'Token refreshed successfully' },
          401: { description: 'Invalid, expired, or revoked refresh token' },
          403: { description: 'User account deactivated' },
        },
      },
    },
    '/auth/logout': {
      post: {
        summary: 'Invalidate active refresh token session and clear persistent cookie',
        description: 'Revokes the refresh token record in the database and clears the HttpOnly cookie.',
        responses: {
          200: { description: 'Logged out successfully' },
        },
      },
    },
    '/auth/me': {
      get: {
        summary: 'Get current user profile and accounts',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'User profile retrieved' } },
      },
    },
    '/accounts': {
      get: {
        summary: 'List user accounts (or all accounts if Admin/Auditor)',
        security: [{ BearerAuth: [] }],
        responses: { 200: { description: 'Accounts list' } },
      },
      post: {
        summary: 'Create a new account',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateAccountRequest' } } },
        },
        responses: { 201: { description: 'Account created' } },
      },
    },
    '/accounts/recipient/{accountNumber}': {
      get: {
        summary: 'Safe recipient account verification for inter-user transfers',
        description:
          'Validates an account number (or UUID) for receiving transfers. Returns safe public details (account number, account type, currency, active status, and account holder name) without exposing account balances, owner IDs, or personal contact info.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'accountNumber',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'LL-ACC-2001' },
            description: 'Public account number (e.g. LL-ACC-2001) or UUID of recipient account',
          },
        ],
        responses: {
          200: {
            description: 'Recipient account verified',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    statusCode: { type: 'integer', example: 200 },
                    message: { type: 'string', example: 'Recipient account verified' },
                    data: {
                      type: 'object',
                      properties: {
                        accountNumber: { type: 'string', example: 'LL-ACC-2001' },
                        accountType: { type: 'string', example: 'SAVINGS' },
                        currency: { type: 'string', example: 'INR' },
                        status: { type: 'string', example: 'ACTIVE' },
                        holderName: { type: 'string', example: 'Ravi' },
                        isEligible: { type: 'boolean', example: true },
                        isOwnAccount: { type: 'boolean', example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Missing or empty account identifier' },
          401: { description: 'Missing or invalid authentication token' },
          404: { description: 'Recipient account not found' },
        },
      },
    },
    '/accounts/{accountNumber}': {
      get: {
        summary: 'Get single account details',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'accountNumber',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'LL-ACC-1001' },
            description: 'Account number (or UUID)',
          },
        ],
        responses: { 200: { description: 'Account details retrieved' } },
      },
    },
    '/accounts/{accountNumber}/balance': {
      get: {
        summary: 'Get account balance',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'accountNumber',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'LL-ACC-1001' },
            description: 'Account number (or UUID)',
          },
        ],
        responses: { 200: { description: 'Balance retrieved' } },
      },
    },
    '/accounts/{accountNumber}/statement': {
      get: {
        summary: 'Get account statement and running balances',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'accountNumber',
            in: 'path',
            required: true,
            schema: { type: 'string', example: 'LL-ACC-1001' },
            description: 'Account number (or UUID)',
          },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Statement retrieved' } },
      },
    },
    '/transactions/deposit': {
      post: {
        summary: 'Deposit funds into an account (Account Holder only)',
        description:
          'Executes an atomic deposit into an owned account. Restricted to ACCOUNT_HOLDER role only (ADMIN and AUDITOR receive 403 Forbidden). Enforces account ownership, row-level locking, and creates balanced debit/credit ledger postings.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/DepositRequest' } } },
        },
        responses: {
          200: { description: 'Deposit successful' },
          400: { description: 'Validation failed, negative amount, or inactive account' },
          401: { description: 'Missing or invalid authentication token' },
          403: { description: 'Forbidden: caller is not an ACCOUNT_HOLDER or does not own the account' },
          404: { description: 'Account not found' },
        },
      },
    },
    '/transactions/withdraw': {
      post: {
        summary: 'Withdraw funds from an account (Account Holder only)',
        description:
          'Executes an atomic withdrawal from an owned account. Restricted to ACCOUNT_HOLDER role only (ADMIN and AUDITOR receive 403 Forbidden). Enforces account ownership, row-level locking, positive balance invariants, and creates balanced debit/credit ledger postings.',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/WithdrawalRequest' } } },
        },
        responses: {
          200: { description: 'Withdrawal successful' },
          400: { description: 'Validation failed, insufficient funds, or inactive account' },
          401: { description: 'Missing or invalid authentication token' },
          403: { description: 'Forbidden: caller is not an ACCOUNT_HOLDER or does not own the account' },
          404: { description: 'Account not found' },
        },
      },
    },
    '/transactions/transfer': {
      post: {
        summary: 'Transfer funds between accounts with double-entry ledger postings (Account Holder only)',
        description:
          'Executes an atomic double-entry transfer between accounts identified by source and destination account numbers (or legacy UUIDs). Restricted exclusively to ACCOUNT_HOLDER role (ADMIN and AUDITOR receive 403 Forbidden). Enforces source account ownership, row-level locking, deadlock prevention, positive balance invariants, and creates balanced debit/credit ledger postings.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'Idempotency-Key',
            in: 'header',
            required: false,
            schema: { type: 'string' },
            description: 'Optional unique client key guaranteeing at-most-once execution',
          },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/TransferRequest' } } },
        },
        responses: {
          200: {
            description: 'Transfer completed successfully with balanced double-entry ledger postings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean', example: true },
                    statusCode: { type: 'integer', example: 200 },
                    message: { type: 'string', example: 'Transfer completed successfully' },
                    data: {
                      type: 'object',
                      properties: {
                        transactionId: { type: 'string', format: 'uuid' },
                        transactionReference: { type: 'string', example: 'TRF-1730911200000-A1B2' },
                        type: { type: 'string', example: 'TRANSFER' },
                        status: { type: 'string', example: 'SUCCESS' },
                        sourceAccountId: { type: 'string', format: 'uuid' },
                        sourceAccountNumber: { type: 'string', example: 'LL-ACC-1001' },
                        destinationAccountId: { type: 'string', format: 'uuid' },
                        destinationAccountNumber: { type: 'string', example: 'LL-ACC-2001' },
                        amountPaise: { type: 'string', example: '25000' },
                        amountFormatted: { type: 'string', example: '250.00' },
                        sourceBalanceAfterPaise: { type: 'string', example: '75000' },
                        sourceBalanceAfterFormatted: { type: 'string', example: '750.00' },
                        destinationBalanceAfterPaise: { type: 'string', example: '125000' },
                        destinationBalanceAfterFormatted: { type: 'string', example: '1250.00' },
                        ledgerEntries: { type: 'array', items: { type: 'string', format: 'uuid' } },
                        createdAt: { type: 'string', format: 'date-time' },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: 'Validation failed, insufficient funds, or inactive account' },
          401: { description: 'Missing or invalid authentication token' },
          403: { description: 'Forbidden: caller is not an ACCOUNT_HOLDER or does not own the source account' },
          404: { description: 'Source or destination account not found' },
          409: { description: 'Idempotency key conflict or in-flight transaction collision' },
        },
      },
    },
    '/transactions': {
      get: {
        summary: 'List transactions',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'accountNumber', in: 'query', required: false, schema: { type: 'string', example: 'LL-ACC-1001' }, description: 'Filter by account number' },
          { name: 'accountId', in: 'query', required: false, schema: { type: 'string', format: 'uuid' }, description: 'Filter by account UUID (legacy)' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Transactions list' } },
      },
    },
    '/transactions/{transactionId}': {
      get: {
        summary: 'Get single transaction details and double-entry ledger postings',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'transactionId', in: 'path', required: true, schema: { type: 'string', example: 'TRF-1730911200000-A1B2' }, description: 'Transaction UUID or reference' }],
        responses: { 200: { description: 'Transaction details retrieved' } },
      },
    },
    '/statements/{accountNumber}': {
      get: {
        summary: 'Get full account statement with committed postings and audited refused attempts',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'accountNumber', in: 'path', required: true, schema: { type: 'string', example: 'LL-ACC-1001' }, description: 'Account number (or UUID)' },
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Statement retrieved' } },
      },
    },
    '/ledger': {
      get: {
        summary: 'Get global double-entry ledger records (Admin/Auditor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Ledger list' } },
      },
    },
    '/ledger/{accountNumber}': {
      get: {
        summary: 'Get account ledger entries and consistency verification',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'accountNumber', in: 'path', required: true, schema: { type: 'string', example: 'LL-ACC-1001' }, description: 'Account number (or UUID)' }],
        responses: { 200: { description: 'Account ledger' } },
      },
    },
    '/audit-events': {
      get: {
        summary: 'List audit trail events (Admin/Auditor)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'limit', in: 'query', required: false, schema: { type: 'integer', default: 50 } },
          { name: 'offset', in: 'query', required: false, schema: { type: 'integer', default: 0 } },
        ],
        responses: { 200: { description: 'Audit trail' } },
      },
    },
    '/admin/users': {
      get: {
        summary: 'List all system users (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', required: false, schema: { type: 'string', enum: ['ADMIN', 'ACCOUNT_HOLDER', 'AUDITOR'] } },
          { name: 'isActive', in: 'query', required: false, schema: { type: 'boolean' } },
        ],
        responses: { 200: { description: 'Users list' } },
      },
    },
    '/admin/accounts': {
      get: {
        summary: 'List all system accounts (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', required: false, schema: { type: 'string', enum: ['ACTIVE', 'FROZEN', 'CLOSED'] } },
        ],
        responses: { 200: { description: 'Accounts list' } },
      },
    },
    '/admin/users/{userId}/status': {
      patch: {
        summary: 'Update user active status (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'userId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UserStatusUpdateRequest' } } },
        },
        responses: { 200: { description: 'User status updated' } },
      },
    },
    '/admin/accounts/{accountId}/status': {
      patch: {
        summary: 'Update account status (Admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'accountId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/AccountStatusUpdateRequest' } } },
        },
        responses: { 200: { description: 'Account status updated' } },
      },
    },
  },
};
