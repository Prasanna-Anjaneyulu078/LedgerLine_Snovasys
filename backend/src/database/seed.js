import bcrypt from 'bcrypt';
import { pool, getClient, closePool } from '../config/database.js';
import { logger } from '../config/logger.js';
import { toPaise } from '../utils/money.js';

export async function seedDatabase() {
  const client = await getClient();

  try {
    await client.query('BEGIN;');
    logger.info('Starting database seeding...');

    // Hash passwords
    const saltRounds = 12;
    const adminPassword = await bcrypt.hash('Admin@123456', saltRounds);
    const alicePassword = await bcrypt.hash('Alice@123456', saltRounds);
    const bobPassword = await bcrypt.hash('Bob@123456', saltRounds);
    const auditorPassword = await bcrypt.hash('Auditor@123456', saltRounds);

    // 1. Seed Users (Upsert on email)
    const userQueries = [
      {
        email: 'admin@ledgerline.internal',
        fullName: 'System Administrator',
        passwordHash: adminPassword,
        role: 'ADMIN',
      },
      {
        email: 'alice@example.com',
        fullName: 'Alice Sharma',
        passwordHash: alicePassword,
        role: 'ACCOUNT_HOLDER',
      },
      {
        email: 'bob@example.com',
        fullName: 'Bob Verma',
        passwordHash: bobPassword,
        role: 'ACCOUNT_HOLDER',
      },
      {
        email: 'auditor@ledgerline.internal',
        fullName: 'Regulatory Compliance Auditor',
        passwordHash: auditorPassword,
        role: 'AUDITOR',
      },
    ];

    const usersMap = {};

    for (const u of userQueries) {
      const res = await client.query(
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
      usersMap[u.email] = res.rows[0];
    }

    logger.info('Users seeded successfully');

    // 2. Seed Accounts with Initial Opening Balances
    const accountConfigs = [
      {
        accountNumber: 'LL-ACC-1001',
        ownerEmail: 'alice@example.com',
        accountType: 'SAVINGS',
        initialRupees: '5000.00',
      },
      {
        accountNumber: 'LL-ACC-1002',
        ownerEmail: 'alice@example.com',
        accountType: 'CHECKING',
        initialRupees: '2500.00',
      },
      {
        accountNumber: 'LL-ACC-2001',
        ownerEmail: 'bob@example.com',
        accountType: 'SAVINGS',
        initialRupees: '10000.00',
      },
    ];

    for (const acc of accountConfigs) {
      const owner = usersMap[acc.ownerEmail];
      const initialPaise = toPaise(acc.initialRupees);

      // Check if account already exists
      const existingAcc = await client.query('SELECT id, balance FROM accounts WHERE account_number = $1', [
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
      }
    }

    await client.query('COMMIT;');
    logger.info('Database seeded successfully with users, accounts, and ledger entries');
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

