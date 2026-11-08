-- 009_update_demo_users.sql
-- LedgerLine Migration: Synchronize Demonstration Accounts & Enforce 4 Active Identities
-- Non-destructive update preserving all user IDs, account associations, ledger entries, and audit logs.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Update ADMIN Demonstration Account
UPDATE users
SET full_name = 'Prasanna Anjaneyulu',
    email = 'prasanna.admin@example.com',
    password_hash = crypt('Prasanna@LL26#Admin', gen_salt('bf', 12)),
    role = 'ADMIN',
    is_active = true,
    updated_at = NOW()
WHERE id = 'dae3d013-d69a-43e1-bc72-fa155d30b39f'
   OR email = 'admin@ledgerline.internal';

-- 2. Update AUDITOR Demonstration Account
UPDATE users
SET full_name = 'Sasank',
    email = 'sasank.auditor@example.com',
    password_hash = crypt('Sasank@LL26#Audit', gen_salt('bf', 12)),
    role = 'AUDITOR',
    is_active = true,
    updated_at = NOW()
WHERE id = '09f51207-fe7c-4bd8-910f-07aed3285b2d'
   OR email = 'auditor@ledgerline.internal';

-- 3. Update ACCOUNT_HOLDER Demonstration Account 1 (Kavi, formerly Alice)
UPDATE users
SET full_name = 'Kavi',
    email = 'kavi@example.com',
    password_hash = crypt('Kavi@LL26#User01', gen_salt('bf', 12)),
    role = 'ACCOUNT_HOLDER',
    is_active = true,
    updated_at = NOW()
WHERE id = '5bd2ab30-5a86-4298-924a-558b88838a10'
   OR email = 'alice@example.com';

-- 4. Update ACCOUNT_HOLDER Demonstration Account 2 (Ravi, formerly Bob)
UPDATE users
SET full_name = 'Ravi',
    email = 'ravi@example.com',
    password_hash = crypt('Ravi@LL26#User02', gen_salt('bf', 12)),
    role = 'ACCOUNT_HOLDER',
    is_active = true,
    updated_at = NOW()
WHERE id = '6650c072-cf53-4e6f-a200-ed9e9cb4701c'
   OR email = 'bob@example.com';

-- 5. Additional User Cleanup: Non-destructive deactivation
-- Preserves all foreign key relationships, accounts, transactions, and audit events.
UPDATE users
SET is_active = false,
    updated_at = NOW()
WHERE email NOT IN (
    'prasanna.admin@example.com',
    'sasank.auditor@example.com',
    'kavi@example.com',
    'ravi@example.com'
) AND id NOT IN (
    'dae3d013-d69a-43e1-bc72-fa155d30b39f',
    '09f51207-fe7c-4bd8-910f-07aed3285b2d',
    '5bd2ab30-5a86-4298-924a-558b88838a10',
    '6650c072-cf53-4e6f-a200-ed9e9cb4701c'
);

-- 6. Revoke active refresh tokens for deactivated users to invalidate sessions
UPDATE refresh_tokens
SET revoked_at = NOW()
WHERE user_id IN (
    SELECT id FROM users WHERE is_active = false
) AND revoked_at IS NULL;

