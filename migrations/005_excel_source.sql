ALTER TABLE chat_olap.sources DROP CONSTRAINT IF EXISTS sources_kind_check;
ALTER TABLE chat_olap.sources ADD CONSTRAINT sources_kind_check CHECK (kind IN ('csv', 'sqlite', 'excel', 'existing'));
DROP INDEX IF EXISTS chat_olap.sources_imported_schema_idx;
CREATE UNIQUE INDEX IF NOT EXISTS sources_imported_schema_idx ON chat_olap.sources(schema_name) WHERE kind IN ('csv', 'sqlite', 'excel');
INSERT INTO chat_olap.schema_migrations(version) VALUES(5) ON CONFLICT DO NOTHING;
