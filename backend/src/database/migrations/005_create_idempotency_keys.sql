-- 005_create_idempotency_keys.sql
-- LedgerLine Migration: Idempotency Keys Table

CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_hash VARCHAR(64) NOT NULL,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    response_status INTEGER,
    response_body JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Enforce unique idempotency key per authenticated user
    CONSTRAINT uq_user_idempotency_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_user_key ON idempotency_keys(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys(expires_at);

