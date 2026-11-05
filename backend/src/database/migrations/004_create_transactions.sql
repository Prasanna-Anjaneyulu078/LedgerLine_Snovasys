-- 004_create_transactions.sql
-- LedgerLine Migration: Transactions Table & Foreign Key to Ledger

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_reference VARCHAR(128) UNIQUE NOT NULL,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER')),
    source_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    destination_account_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL CHECK (amount > 0),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUSED')),
    initiated_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Consistency check constraint for source/destination accounts
    CONSTRAINT chk_transaction_accounts CHECK (
        (transaction_type = 'DEPOSIT' AND destination_account_id IS NOT NULL) OR
        (transaction_type = 'WITHDRAWAL' AND source_account_id IS NOT NULL) OR
        (transaction_type = 'TRANSFER' AND source_account_id IS NOT NULL AND destination_account_id IS NOT NULL AND source_account_id <> destination_account_id)
    )
);

CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_source ON transactions(source_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_dest ON transactions(destination_account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_initiated_by ON transactions(initiated_by);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at DESC);

-- Enforce Foreign Key link from ledger_entries to transactions
ALTER TABLE ledger_entries
    ADD CONSTRAINT fk_ledger_entries_transaction
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE RESTRICT;

