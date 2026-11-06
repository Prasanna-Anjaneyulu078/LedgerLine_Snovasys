-- 007_prevent_ledger_modification.sql
-- LedgerLine Migration: Prevent UPDATE and DELETE on ledger_entries (Append-Only Invariant)

-- 1. Trigger function that raises an exception on any UPDATE or DELETE attempt
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Ledger entries are strictly append-only: UPDATE operations are prohibited on table % (entry id: %)',
            TG_TABLE_NAME, OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'LedgerLine financial ledger records are immutable. To adjust balances, record a new double-entry transaction.';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Ledger entries are strictly append-only: DELETE operations are prohibited on table % (entry id: %)',
            TG_TABLE_NAME, OLD.id
            USING ERRCODE = 'integrity_constraint_violation',
            HINT = 'LedgerLine financial ledger records are immutable. Entries cannot be deleted.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 2. Drop existing trigger if present and attach to ledger_entries table
DROP TRIGGER IF EXISTS trg_prevent_ledger_modification ON ledger_entries;

CREATE TRIGGER trg_prevent_ledger_modification
    BEFORE UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

-- 3. Defense-in-depth: If restricted application runtime role exists, grant least-privilege permissions
DO $$
DECLARE
    db_name TEXT;
BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerline_runtime') THEN
        SELECT current_database() INTO db_name;
        EXECUTE format('GRANT CONNECT ON DATABASE %I TO ledgerline_runtime;', db_name);
        GRANT USAGE ON SCHEMA public TO ledgerline_runtime;
        GRANT SELECT, INSERT, UPDATE ON users, accounts, transactions TO ledgerline_runtime;
        GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO ledgerline_runtime;
        GRANT SELECT, INSERT ON audit_events TO ledgerline_runtime;
        GRANT SELECT, INSERT ON ledger_entries TO ledgerline_runtime;
        REVOKE UPDATE, DELETE, TRUNCATE ON ledger_entries FROM ledgerline_runtime;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerline_runtime;
    END IF;
END
$$;

