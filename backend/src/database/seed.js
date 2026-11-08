import bcrypt from 'bcrypt';
import { pool, getClient, closePool } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { toPaise } from '../utils/money.js';

export async function seedDatabase() {
  // Production Safeguard: Never overwrite production credentials or seed demo data in production
  if (env.NODE_ENV === 'production') {
    logger.warn('Database seeding is strictly disabled in production environment');
    throw new Error('Database seeding cannot execute in production environment');
  }

  const client = await getClient();

  try {
    await client.query('BEGIN;');
    logger.info('Starting database seeding for demonstration environment...');

    const saltRounds = env.BCRYPT_SALT_ROUNDS || 12;

    // Securely hash local-only demonstration credentials using existing bcrypt implementation
    const adminPassword = await bcrypt.hash('Prasanna@LL26#Admin', saltRounds);
    const auditorPassword = await bcrypt.hash('Sasank@LL26#Audit', saltRounds);
    const kaviPassword = await bcrypt.hash('Kavi@LL26#User01', saltRounds);
    const raviPassword = await bcrypt.hash('Ravi@LL26#User02', saltRounds);

    // Demonstration identities specification
    const demoUsers = [
      {
        legacyEmail: 'admin@ledgerline.internal',
        email: 'prasanna.admin@example.com',
        fullName: 'Prasanna Anjaneyulu',
        passwordHash: adminPassword,
        role: 'ADMIN',
      },
      {
        legacyEmail: 'auditor@ledgerline.internal',
        email: 'sasank.auditor@example.com',
        fullName: 'Sasank',
        passwordHash: auditorPassword,
        role: 'AUDITOR',
      },
      {
        legacyEmail: 'alice@example.com',
        email: 'kavi@example.com',
        fullName: 'Kavi',
        passwordHash: kaviPassword,
        role: 'ACCOUNT_HOLDER',
      },
      {
        legacyEmail: 'bob@example.com',
        email: 'ravi@example.com',
        fullName: 'Ravi',
        passwordHash: raviPassword,
        role: 'ACCOUNT_HOLDER',
      },
    ];

    const usersMap = {};

    for (const u of demoUsers) {
      // 1. Check if user already exists under target email
      const targetRes = await client.query('SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)', [u.email]);
      
      if (targetRes.rows.length > 0) {
        // Update existing record under target email
        const updated = await client.query(
          `
          UPDATE users
          SET full_name = $1,
              password_hash = $2,
              role = $3,
              is_active = true,
              updated_at = NOW()
          WHERE id = $4
          RETURNING id, email, role;
          `,
          [u.fullName, u.passwordHash, u.role, targetRes.rows[0].id]
        );
        usersMap[u.email] = updated.rows[0];
      } else {
        // 2. Check if legacy demo email exists and migrate it seamlessly, preserving ID, accounts, and history
        const legacyRes = await client.query('SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1)', [u.legacyEmail]);
        
        if (legacyRes.rows.length > 0) {
          const updated = await client.query(
            `
            UPDATE users
            SET full_name = $1,
                email = $2,
                password_hash = $3,
                role = $4,
                is_active = true,
                updated_at = NOW()
            WHERE id = $5
            RETURNING id, email, role;
            `,
            [u.fullName, u.email, u.passwordHash, u.role, legacyRes.rows[0].id]
          );
          usersMap[u.email] = updated.rows[0];
        } else {
          // 3. Fresh insertion for new database installations
          const inserted = await client.query(
            `
            INSERT INTO users (full_name, email, password_hash, role, is_active)
            VALUES ($1, $2, $3, $4, true)
            ON CONFLICT (email) DO UPDATE
              SET full_name = EXCLUDED.full_name,
                  password_hash = EXCLUDED.password_hash,
                  role = EXCLUDED.role,
                  is_active = true,
                  updated_at = NOW()
            RETURNING id, email, role;
            `,
            [u.fullName, u.email, u.passwordHash, u.role]
          );
          usersMap[u.email] = inserted.rows[0];
        }
      }
    }

    logger.info('Four demonstration users seeded/updated successfully');

    // 2. Seed Accounts with Initial Opening Balances
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
      const existingAcc = await client.query('SELECT id, balance, owner_id FROM accounts WHERE account_number = $1', [
        acc.accountNumber,
      ]);

      if (existingAcc.rows.length === 0) {
        // Insert account
        const accRes = await client.query(
          `
          INSERT INTO accounts (account_number, owner_id, account_type, currency, balance, status)
          VALUES ($1, $2, $3, 'INR', $4, 'ACTIVE')
          RETURNING id, account_number, balance;
        `,
          [acc.accountNumber, owner.id, acc.accountType, initialPaise]
        );

        const newAccount = accRes.rows[0];

        // Create opening deposit transaction and ledger entry
        const txnRef = `INIT-DEP-${acc.accountNumber}`;
        const txnRes = await client.query(
          `
          INSERT INTO transactions (
            transaction_reference, transaction_type, destination_account_id,
            amount, status, initiated_by, description
          )
          VALUES ($1, 'DEPOSIT', $2, $3, 'SUCCESS', $4, 'Initial account opening deposit')
          RETURNING id;
        `,
          [txnRef, newAccount.id, initialPaise, owner.id]
        );

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
      } else {
        // If account exists, ensure owner_id matches demo owner
        if (existingAcc.rows[0].owner_id !== owner.id) {
          await client.query('UPDATE accounts SET owner_id = $1 WHERE id = $2', [owner.id, existingAcc.rows[0].id]);
        }
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
  seedDatabase()
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
