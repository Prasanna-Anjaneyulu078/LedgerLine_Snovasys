import bcrypt from 'bcrypt';
import { pool, getClient, closePool } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { toPaise } from '../utils/money.js';

const DEMO_USERS_CONFIG = [
  {
    passwordEnvKey: 'SEED_ADMIN_PASSWORD',
    legacyEmail: 'admin@ledgerline.internal',
    email: 'prasanna.admin@example.com',
    fullName: 'Prasanna Anjaneyulu',
    role: 'ADMIN',
  },
  {
    passwordEnvKey: 'SEED_AUDITOR_PASSWORD',
    legacyEmail: 'auditor@ledgerline.internal',
    email: 'sasank.auditor@example.com',
    fullName: 'Sasank',
    role: 'AUDITOR',
  },
  {
    passwordEnvKey: 'SEED_KAVI_PASSWORD',
    legacyEmail: 'alice@example.com',
    email: 'kavi@example.com',
    fullName: 'Kavi',
    role: 'ACCOUNT_HOLDER',
  },
  {
    passwordEnvKey: 'SEED_RAVI_PASSWORD',
    legacyEmail: 'bob@example.com',
    email: 'ravi@example.com',
    fullName: 'Ravi',
    role: 'ACCOUNT_HOLDER',
  },
];

export async function seedDatabase(options = {}) {
  const effectiveEnv = options.nodeEnv ?? process.env.NODE_ENV ?? env.NODE_ENV;

  // Production Safeguard: Never overwrite production credentials or seed demo data in production
  if (effectiveEnv === 'production' || env.NODE_ENV === 'production') {
    logger.warn('Database seeding is strictly disabled in production environment');
    throw new Error('Database seeding cannot execute in production environment');
  }

  // Explicit Opt-In Safeguard: Refuse accidental runs against shared/non-test databases unless opted in
  const allowDemoSeed =
    options.allowDemoSeed ??
    (process.env.ALLOW_DEMO_SEED === 'true'
      ? true
      : process.env.ALLOW_DEMO_SEED === 'false'
        ? false
        : effectiveEnv === 'test');

  if (!allowDemoSeed) {
    throw new Error(
      'Database seeding requires explicit opt-in: set ALLOW_DEMO_SEED=true or pass --confirm when executing seed.js.'
    );
  }

  const migrateLegacyUsers =
    options.migrateLegacyUsers ?? process.env.SEED_MIGRATE_LEGACY_USERS === 'true';

  const missingPasswordVars = DEMO_USERS_CONFIG
    .map((u) => u.passwordEnvKey)
    .filter((key) => !process.env[key] || !process.env[key].trim());

  if (missingPasswordVars.length > 0) {
    throw new Error(
      `Missing required seed password environment variable(s): ${missingPasswordVars.join(', ')}. Configure them in backend/.env before running the seed script.`
    );
  }

  const client = await getClient();

  try {
    await client.query('BEGIN;');
    logger.info('Starting idempotent database seeding for demonstration environment...');

    const saltRounds = env.BCRYPT_SALT_ROUNDS || 12;
    const usersMap = {};

    for (const u of DEMO_USERS_CONFIG) {
      // 1. Check if user already exists under target email — preserve existing ID, credentials, role, and status
      const targetRes = await client.query(
        'SELECT id, email, full_name, role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
        [u.email]
      );

      if (targetRes.rows.length > 0) {
        const existingUser = targetRes.rows[0];
        if (existingUser.role !== u.role) {
          logger.warn(
            { userId: existingUser.id, email: existingUser.email, existingRole: existingUser.role, configuredRole: u.role },
            'Existing seed user has a different role; preserving existing role and credentials'
          );
        }
        usersMap[u.email] = existingUser;
        continue;
      }

      // 2. Check if legacy demo email exists; migrate email/display name ONLY with explicit opt-in,
      // and NEVER reset password_hash, role, or is_active.
      const legacyRes = await client.query(
        'SELECT id, email, full_name, role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
        [u.legacyEmail]
      );

      if (legacyRes.rows.length > 0) {
        const legacyUser = legacyRes.rows[0];
        if (migrateLegacyUsers) {
          const migrated = await client.query(
            `
            UPDATE users
            SET full_name = $1,
                email = $2,
                updated_at = NOW()
            WHERE id = $3
            RETURNING id, email, full_name, role, is_active;
            `,
            [u.fullName, u.email, legacyUser.id]
          );
          logger.info(
            { userId: legacyUser.id, fromEmail: legacyUser.email, toEmail: u.email, preservedRole: legacyUser.role },
            'Explicitly migrated legacy demonstration user email while preserving credentials and role'
          );
          usersMap[u.email] = migrated.rows[0];
        } else {
          logger.info(
            { userId: legacyUser.id, legacyEmail: legacyUser.email, targetEmail: u.email },
            'Legacy demonstration user found; preserving existing record without migration (set SEED_MIGRATE_LEGACY_USERS=true to migrate email)'
          );
          usersMap[u.email] = legacyUser;
        }
        continue;
      }

      // 3. Fresh insertion for new demonstration user (never overwrites existing users on conflict)
      const passwordHash = await bcrypt.hash(process.env[u.passwordEnvKey], saltRounds);
      const inserted = await client.query(
        `
        INSERT INTO users (full_name, email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (email) DO NOTHING
        RETURNING id, email, full_name, role, is_active;
        `,
        [u.fullName, u.email, passwordHash, u.role]
      );

      if (inserted.rows.length > 0) {
        usersMap[u.email] = inserted.rows[0];
      } else {
        const concurrentUser = await client.query(
          'SELECT id, email, full_name, role, is_active FROM users WHERE LOWER(email) = LOWER($1)',
          [u.email]
        );
        usersMap[u.email] = concurrentUser.rows[0];
      }
    }

    logger.info('Demonstration user verification/seeding completed safely');

    // 2. Seed Accounts with Initial Opening Balances (idempotent; preserves existing ownership & balances)
    const accountConfigs = [
      {
        accountNumber: 'LL-ACC-1001',
        ownerEmail: 'kavi@example.com',
        accountType: 'SAVINGS',
        initialRupees: '5000.00',
      },
      {
        accountNumber: 'LL-ACC-1002',
        ownerEmail: 'kavi@example.com',
        accountType: 'CHECKING',
        initialRupees: '2500.00',
      },
      {
        accountNumber: 'LL-ACC-2001',
        ownerEmail: 'ravi@example.com',
        accountType: 'SAVINGS',
        initialRupees: '10000.00',
      },
    ];

    for (const acc of accountConfigs) {
      const owner = usersMap[acc.ownerEmail];
      if (!owner) continue;
      const initialPaise = toPaise(acc.initialRupees);

      // Check if account already exists
      const existingAcc = await client.query(
        'SELECT id, account_number, balance, owner_id, status FROM accounts WHERE account_number = $1',
        [acc.accountNumber]
      );

      if (existingAcc.rows.length === 0) {
        // Insert account idempotently
        const accRes = await client.query(
          `
          INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
          VALUES ($1, $2, $3, 'INR', $4, 'ACTIVE')
          ON CONFLICT (account_number) DO NOTHING
          RETURNING id, account_number, balance;
        `,
          [acc.accountNumber, owner.id, acc.accountType, initialPaise]
        );

        if (accRes.rows.length === 0) {
          continue;
        }

        const newAccount = accRes.rows[0];

        // Create opening deposit transaction and ledger entry idempotently
        const txnRef = `INIT-DEP-${acc.accountNumber}`;
        const txnRes = await client.query(
          `
          INSERT INTO transactions (
            transaction_reference, transaction_type, destination_account_id,
            amount, status, initiated_by, description
          )
          VALUES ($1, 'DEPOSIT', $2, $3, 'SUCCESS', $4, 'Initial account opening deposit')
          ON CONFLICT (transaction_reference) DO NOTHING
          RETURNING id;
        `,
          [txnRef, newAccount.id, initialPaise, owner.id]
        );

        if (txnRes.rows.length === 0) {
          continue;
        }

        const txnId = txnRes.rows[0].id;

        // Insert double-entry ledger entry for deposit (CREDIT to customer account)
        await client.query(
          `
          INSERT INTO ledger_entries (
            transaction_id, account_id, entry_type, amount, balance_after
          )
          VALUES ($1, $2, 'CREDIT', $3, $4);
        `,
          [txnId, newAccount.id, initialPaise, initialPaise]
        );

        // Record audit event
        await client.query(
          `
          INSERT INTO audit_events (
            actor_id, action, resource_type, resource_id, metadata
          )
          VALUES ($1, 'INITIAL_SEED_DEPOSIT', 'ACCOUNT', $2, $3);
        `,
          [owner.id, newAccount.id, JSON.stringify({ amountPaise: initialPaise.toString() })]
        );
      } else if (existingAcc.rows[0].owner_id !== owner.id) {
        // Never reassign an existing account to a different owner
        logger.warn(
          {
            accountNumber: acc.accountNumber,
            existingOwnerId: existingAcc.rows[0].owner_id,
            configuredOwnerId: owner.id,
          },
          'Existing demonstration account has a different owner; preserving existing account ownership'
        );
      }
    }

    await client.query('COMMIT;');
    logger.info('Database seeded successfully with 4 demonstration identities and accounts');
  } catch (err) {
    await client.query('ROLLBACK;');
    logger.error({ err }, 'Error seeding database');
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const hasConfirmFlag = process.argv.includes('--confirm');
  seedDatabase({
    allowDemoSeed: hasConfirmFlag ? true : undefined,
    migrateLegacyUsers: process.argv.includes('--migrate-legacy') ? true : undefined,
  })
    .then(async () => {
      console.log('Seeding completed successfully.');
      await closePool();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('Seeding failed:', err);
      await closePool();
      process.exit(1);
    });
}
