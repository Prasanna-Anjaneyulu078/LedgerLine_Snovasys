-- 006_create_audit_events.sql
-- LedgerLine Migration: Audit Events Table

CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(255),
    metadata JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON audit_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at DESC);

