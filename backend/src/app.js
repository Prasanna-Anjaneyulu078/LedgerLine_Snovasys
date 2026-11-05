import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';

import { env } from './config/env.js';
import { checkDatabaseConnection } from './config/database.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { generalLimiter } from './middleware/rateLimiter.js';
import { AppError } from './utils/appError.js';
import { ApiResponse } from './utils/apiResponse.js';
import { swaggerDocument } from './docs/swagger.js';

// Route imports
import { authRouter } from './modules/auth/auth.routes.js';
import { accountRouter } from './modules/accounts/account.routes.js';
import { transactionRouter } from './modules/transactions/transaction.routes.js';
import { ledgerRouter } from './modules/ledger/ledger.routes.js';
import { statementRouter } from './modules/statements/statement.routes.js';
import { auditRouter } from './modules/audit/audit.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
  })
);

// Body parsing with limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Global request logger
app.use(requestLogger);

// Global rate limiting
app.use(generalLimiter);

// Interactive Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Health Check Endpoint (Deployment and Monitoring requirement)
app.get('/health', async (req, res, next) => {
  try {
    const dbStatus = await checkDatabaseConnection();
    res.status(200).json(
      ApiResponse.success(
        {
          status: 'UP',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          database: {
            connected: true,
            serverTime: dbStatus.current_time,
          },
          environment: env.NODE_ENV,
        },
        'LedgerLine system operational'
      )
    );
  } catch (err) {
    res.status(503).json({
      success: false,
      statusCode: 503,
      message: 'Database service unavailable',
      error: err.message,
    });
  }
});

// Root Information Endpoint
app.get('/', (req, res) => {
  res.status(200).json(
    ApiResponse.success(
      {
        name: 'LedgerLine Financial Core API',
        version: '1.0.0',
        documentation: '/api-docs',
        health: '/health',
      },
      'Welcome to LedgerLine Financial Management Core'
    )
  );
});

// API v1 Routes
const apiV1Router = express.Router();
apiV1Router.use('/auth', authRouter);
apiV1Router.use('/accounts', accountRouter);
apiV1Router.use('/transactions', transactionRouter);
apiV1Router.use('/ledger', ledgerRouter);
apiV1Router.use('/statements', statementRouter);
apiV1Router.use('/audit-events', auditRouter);
apiV1Router.use('/admin', adminRouter);

app.use('/api/v1', apiV1Router);

// 404 Route Not Found Handler
app.use((req, res, next) => {
  next(AppError.notFound(`Endpoint not found: [${req.method}] ${req.originalUrl}`));
});

// Centralized Global Error Handler
app.use(errorHandler);

export default app;

