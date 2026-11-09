CREATE TABLE IF NOT EXISTS chat_olap.dashboard_cards (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES chat_olap.users(id) ON DELETE CASCADE,
    title text NOT NULL,
    card_type text NOT NULL CHECK (card_type IN ('chart', 'report', 'table', 'metric')),
    content jsonb NOT NULL,
    query_text text,
    source_id uuid,
    cube_id uuid,
    session_id uuid,
    layout_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dashboard_cards_owner_idx ON chat_olap.dashboard_cards(owner_id, layout_order, created_at DESC);
INSERT INTO chat_olap.schema_migrations(version) VALUES (6) ON CONFLICT DO NOTHING;
