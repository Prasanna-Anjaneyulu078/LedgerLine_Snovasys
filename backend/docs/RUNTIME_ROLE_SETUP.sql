-- ==============================================================================
-- LedgerLine: Dedicated Restricted Application Runtime Role Setup (PostgreSQL / Neon)
-- ==============================================================================
--
-- This script configures the least-privilege PostgreSQL runtime role `ledgerline_runtime`.
-- The application runtime credentials MUST use this restricted role.
-- Migrations, DDL, and disaster-recovery maintenance MUST use the database owner (`neondb_owner`).
--
-- Defense-in-depth:
--   1. Privilege Layer: Explicitly grants only SELECT and INSERT on `ledger_entries`,
--      revoking UPDATE, DELETE, and TRUNCATE.
--   2. Trigger Layer: Migration 007 (`prevent_ledger_modification()`) stops any
--      UPDATE or DELETE at the database engine level, even if attempted by table owner.
--   3. Ownership Isolation: `ledgerline_runtime` does not own the schema, tables,
--      or trigger functions, preventing privilege escalation.
--
-- ==============================================================================

-- 1. Create the runtime role if it does not already exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerline_runtime') THEN
        CREATE ROLE ledgerline_runtime WITH LOGIN PASSWORD 'YOUR_SECURE_RUNTIME_PASSWORD_HERE' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
    END IF;
END
$$;

-- 2. Grant Database Connection and Schema Usage
GRANT CONNECT ON DATABASE current_database() TO ledgerline_runtime;
GRANT USAGE ON SCHEMA public TO ledgerline_runtime;

-- 3. Grant Application Table Privileges (Least Privilege)
-- Users, Accounts, Transactions: Core mutable tables needed for application operations
GRANT SELECT, INSERT, UPDATE ON users, accounts, transactions TO ledgerline_runtime;

-- Idempotency Keys: Requires DELETE for expired idempotency key cleanup
GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO ledgerline_runtime;

-- Audit Events: Append-only audit trail
GRANT SELECT, INSERT ON audit_events TO ledgerline_runtime;

-- Ledger Entries: STRICTLY APPEND-ONLY
-- SELECT and INSERT are permitted for recording double-entry bookkeeping and generating statements.
-- UPDATE, DELETE, and TRUNCATE are explicitly REVOKED.
GRANT SELECT, INSERT ON ledger_entries TO ledgerline_runtime;
REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM ledgerline_runtime;

-- 4. Sequences: Required for any serial/sequence values
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerline_runtime;

-- 5. Verification Query (Run as runtime role or owner to verify privileges)
SELECT 
    current_user,
    has_table_privilege('ledgerline_runtime', 'ledger_entries', 'SELECT') as can_select,
    has_table_privilege('ledgerline_runtime', 'ledger_entries', 'INSERT') as can_insert,
    has_table_privilege('ledgerline_runtime', 'ledger_entries', 'UPDATE') as can_update,
    has_table_privilege('ledgerline_runtime', 'ledger_entries', 'DELETE') as can_delete,
    has_table_privilege('ledgerline_runtime', 'ledger_entries', 'TRUNCATE') as can_truncate;

