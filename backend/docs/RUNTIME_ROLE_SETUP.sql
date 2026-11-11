
-- 1. Create the restricted runtime role if it does not exist.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_roles
        WHERE rolname = 'ledgerline_runtime'
    ) THEN
        CREATE ROLE ledgerline_runtime
            WITH LOGIN
            NOSUPERUSER
            NOCREATEDB
            NOCREATEROLE
            NOINHERIT;
    END IF;
END
$$;

-- 2. Grant connection to the current database.
DO $$
BEGIN
    EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO ledgerline_runtime',
        current_database()
    );
END
$$;

-- 3. Schema access.
GRANT USAGE ON SCHEMA public TO ledgerline_runtime;

-- 4. Core application tables.
GRANT SELECT, INSERT, UPDATE
ON TABLE users, accounts, transactions
TO ledgerline_runtime;

-- 5. Idempotency cleanup requires DELETE.
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE idempotency_keys
TO ledgerline_runtime;

-- 6. Audit events: read and append only.
GRANT SELECT, INSERT
ON TABLE audit_events
TO ledgerline_runtime;

-- 7. Ledger entries: read and append only.
GRANT SELECT, INSERT
ON TABLE ledger_entries
TO ledgerline_runtime;

REVOKE UPDATE, DELETE, TRUNCATE
ON TABLE ledger_entries
FROM ledgerline_runtime;

-- 8. Sequence access (review whether every sequence is required).
GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO ledgerline_runtime;

-- 9. Verify effective ledger privileges.
SELECT
    has_table_privilege(
        'ledgerline_runtime', 'ledger_entries', 'SELECT'
    ) AS can_select,
    has_table_privilege(
        'ledgerline_runtime', 'ledger_entries', 'INSERT'
    ) AS can_insert,
    has_table_privilege(
        'ledgerline_runtime', 'ledger_entries', 'UPDATE'
    ) AS can_update,
    has_table_privilege(
        'ledgerline_runtime', 'ledger_entries', 'DELETE'
    ) AS can_delete,
    has_table_privilege(
        'ledgerline_runtime', 'ledger_entries', 'TRUNCATE'
    ) AS can_truncate;
