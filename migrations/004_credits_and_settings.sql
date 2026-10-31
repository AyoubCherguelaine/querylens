ALTER TABLE chat_olap.users ADD COLUMN IF NOT EXISTS credits integer NOT NULL DEFAULT 100 CHECK (credits >= 0);
ALTER TABLE chat_olap.users ADD COLUMN IF NOT EXISTS model_settings jsonb NOT NULL DEFAULT '{"model": "gpt-4o-mini", "process_mode": "standard", "temperature": 0.1, "max_steps": 12, "custom_instructions": ""}'::jsonb;

CREATE TABLE IF NOT EXISTS chat_olap.credit_transactions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES chat_olap.users(id) ON DELETE CASCADE,
    amount integer NOT NULL,
    action text NOT NULL,
    balance_after integer NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_transactions_user_idx ON chat_olap.credit_transactions(user_id, created_at DESC);

INSERT INTO chat_olap.schema_migrations(version) VALUES(4) ON CONFLICT DO NOTHING;

