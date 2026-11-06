import pg from 'pg';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const { Client } = pg;

/**
 * Provisions or verifies the restricted runtime role in PostgreSQL/Neon
 * @param {Object} options
 * @param {boolean} options.isTest - whether configuring the test database
 * @param {string} [options.roleName] - custom role name (defaults to 'ledgerline_runtime')
 * @param {string} [options.password] - custom password (defaults to env or generated)
 */
export async function setupRuntimeRole({
  isTest = false,
  roleName = process.env.RUNTIME_DB_USER || 'ledgerline_runtime',
  password = process.env.RUNTIME_DB_PASSWORD || null,
} = {}) {
  const adminConnectionString = isTest
    ? env.TEST_DIRECT_URL || env.TEST_DATABASE_URL
    : env.DIRECT_URL || env.DATABASE_URL;

  if (!adminConnectionString) {
    throw new Error(
      isTest
        ? 'No test direct/admin database URL configured (TEST_DIRECT_URL or TEST_DATABASE_URL required)'
        : 'No direct/admin database URL configured (DIRECT_URL or DATABASE_URL required)'
    );
  }

  const isSslRequired =
    adminConnectionString.includes('sslmode=require') ||
    adminConnectionString.includes('sslmode=verify-full') ||
    adminConnectionString.includes('ssl=true');

  const client = new Client({
    connectionString: adminConnectionString,
    ssl: isSslRequired ? { rejectUnauthorized: true } : false,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();

    const identityRes = await client.query('SELECT current_database(), current_user;');
    const currentDb = identityRes.rows[0].current_database;
    const currentUser = identityRes.rows[0].current_user;

    logger.info(
      { currentDb, currentUser, roleName, isTest },
      'Connected with administrative credentials to configure runtime role'
    );

    // Safeguard: Refuse to run test role configuration against production databases
    if (isTest && !currentDb.toLowerCase().includes('test')) {
      throw new Error(
        `Safety violation: Test role setup must run against a database containing "test". Current database is "${currentDb}".`
      );
    }

    // 1. Check if role exists
    const roleCheck = await client.query('SELECT rolname FROM pg_roles WHERE rolname = $1;', [roleName]);
    const roleExists = roleCheck.rows.length > 0;

    let effectivePassword = password;
    if (!roleExists && !effectivePassword) {
      effectivePassword = crypto.randomBytes(24).toString('base64url');
    }

    if (!roleExists) {
      logger.info({ roleName }, 'Creating restricted runtime role');
      // Parameterized CREATE ROLE is not directly supported by Postgres grammar for identifiers/passwords
      // Escape securely
      const escapedRole = roleName.replace(/"/g, '""');
      const escapedPassword = effectivePassword.replace(/'/g, "''");
      await client.query(`CREATE ROLE "${escapedRole}" WITH LOGIN PASSWORD '${escapedPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;`);
    } else if (effectivePassword) {
      const escapedRole = roleName.replace(/"/g, '""');
      const escapedPassword = effectivePassword.replace(/'/g, "''");
      await client.query(`ALTER ROLE "${escapedRole}" WITH PASSWORD '${escapedPassword}';`);
    }

    // 2. Grant Database and Schema Access
    const escapedRole = roleName.replace(/"/g, '""');
    const escapedDb = currentDb.replace(/"/g, '""');
    await client.query(`GRANT CONNECT ON DATABASE "${escapedDb}" TO "${escapedRole}";`);
    await client.query(`GRANT USAGE ON SCHEMA public TO "${escapedRole}";`);

    // 3. Grant table permissions strictly by application need
    await client.query(`
      GRANT SELECT, INSERT, UPDATE ON users, accounts, transactions TO "${escapedRole}";
      GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO "${escapedRole}";
      GRANT SELECT, INSERT ON audit_events TO "${escapedRole}";
      GRANT SELECT, INSERT ON ledger_entries TO "${escapedRole}";
      REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM "${escapedRole}";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${escapedRole}";
    `);

    // 4. Verify privileges
    const privRes = await client.query(`
      SELECT 
        has_table_privilege($1, 'ledger_entries', 'SELECT') as can_select,
        has_table_privilege($1, 'ledger_entries', 'INSERT') as can_insert,
        has_table_privilege($1, 'ledger_entries', 'UPDATE') as can_update,
        has_table_privilege($1, 'ledger_entries', 'DELETE') as can_delete,
        has_table_privilege($1, 'ledger_entries', 'TRUNCATE') as can_truncate;
    `, [roleName]);

    const privs = privRes.rows[0];
    logger.info({ roleName, privileges: privs }, 'Runtime role permissions verified');

    if (privs.can_update || privs.can_delete || privs.can_truncate) {
      throw new Error(`Security check failed: Role "${roleName}" has prohibited privileges on ledger_entries: ${JSON.stringify(privs)}`);
    }

    return {
      database: currentDb,
      roleName,
      passwordGenerated: !roleExists && !password,
      privileges: privs,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const isTest = process.argv.includes('--test') || process.env.NODE_ENV === 'test';
  setupRuntimeRole({ isTest })
    .then((result) => {
      console.log(`Runtime role [${result.roleName}] configured successfully on database [${result.database}].`);
      console.log(`Verified privileges on ledger_entries: SELECT=${result.privileges.can_select}, INSERT=${result.privileges.can_insert}, UPDATE=${result.privileges.can_update}, DELETE=${result.privileges.can_delete}, TRUNCATE=${result.privileges.can_truncate}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Setup runtime role failed:', err.message);
      process.exit(1);
    });
}

