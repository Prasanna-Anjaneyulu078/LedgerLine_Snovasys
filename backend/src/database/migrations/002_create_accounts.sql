-- 002_create_accounts.sql
-- LedgerLine Migration: Accounts Table

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_number VARCHAR(64) UNIQUE NOT NULL,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    account_type VARCHAR(50) NOT NULL DEFAULT 'SAVINGS' CHECK (account_type IN ('SAVINGS', 'CHECKING', 'OPERATIONAL')),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR',
    balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FROZEN', 'CLOSED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounts_owner_id ON accounts(owner_id);
CREATE INDEX IF NOT EXISTS idx_accounts_account_number ON accounts(account_number);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);

