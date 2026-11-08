-- Migration 008: Create refresh_tokens table for persistent, secure cookie-based session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ DEFAULT NULL,
    replaced_by_token_hash VARCHAR(255) DEFAULT NULL,
    user_agent TEXT DEFAULT NULL,
    ip_address VARCHAR(45) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Grant privileges to runtime role if it exists
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'ledgerline_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO "ledgerline_runtime";
  END IF;
END
$$;

