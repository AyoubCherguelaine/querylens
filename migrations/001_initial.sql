CREATE SCHEMA IF NOT EXISTS chat_olap;
CREATE TABLE IF NOT EXISTS chat_olap.schema_migrations (
    version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_olap.users (
    id uuid PRIMARY KEY, email text NOT NULL UNIQUE, full_name text NOT NULL DEFAULT '',
    password_hash text NOT NULL, is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_olap.cubes (
    id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES chat_olap.users(id) ON DELETE CASCADE,
    source_schema text NOT NULL, source_table text NOT NULL, definition jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id, source_schema, source_table)
);
CREATE TABLE IF NOT EXISTS chat_olap.sessions (
    id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES chat_olap.users(id) ON DELETE CASCADE,
    cube_id uuid NOT NULL REFERENCES chat_olap.cubes(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS chat_olap.messages (
    id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES chat_olap.sessions(id) ON DELETE CASCADE,
    question text NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_owner_idx ON chat_olap.sessions(owner_id);
CREATE INDEX IF NOT EXISTS messages_session_idx ON chat_olap.messages(session_id, created_at);
INSERT INTO chat_olap.schema_migrations(version) VALUES (1) ON CONFLICT DO NOTHING;
