CREATE TABLE IF NOT EXISTS chat_olap.sources (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES chat_olap.users(id) ON DELETE CASCADE,
    name text NOT NULL,
    schema_name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('csv', 'sqlite', 'existing')),
    filename text,
    file_sha256 text,
    manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(owner_id, schema_name)
);
CREATE UNIQUE INDEX IF NOT EXISTS sources_imported_schema_idx ON chat_olap.sources(schema_name) WHERE kind IN ('csv','sqlite');
CREATE INDEX IF NOT EXISTS sources_owner_idx ON chat_olap.sources(owner_id);
ALTER TABLE chat_olap.cubes ADD COLUMN IF NOT EXISTS source_id uuid REFERENCES chat_olap.sources(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS cubes_source_idx ON chat_olap.cubes(source_id);
INSERT INTO chat_olap.sources(id,owner_id,name,schema_name,kind)
SELECT gen_random_uuid(), owner_id, source_schema, source_schema, 'existing'
FROM chat_olap.cubes GROUP BY owner_id,source_schema
ON CONFLICT(owner_id,schema_name) DO NOTHING;
UPDATE chat_olap.cubes c SET source_id=s.id
FROM chat_olap.sources s WHERE c.owner_id=s.owner_id AND c.source_schema=s.schema_name AND c.source_id IS NULL;
INSERT INTO chat_olap.schema_migrations(version) VALUES(2) ON CONFLICT DO NOTHING;
