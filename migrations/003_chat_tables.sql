CREATE TABLE IF NOT EXISTS chat_olap.session_cubes (
    session_id uuid NOT NULL REFERENCES chat_olap.sessions(id) ON DELETE CASCADE,
    cube_id uuid NOT NULL REFERENCES chat_olap.cubes(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position >= 0),
    PRIMARY KEY(session_id, cube_id)
);
INSERT INTO chat_olap.session_cubes(session_id, cube_id, position)
SELECT id, cube_id, 0 FROM chat_olap.sessions
ON CONFLICT DO NOTHING;
INSERT INTO chat_olap.schema_migrations(version) VALUES(3) ON CONFLICT DO NOTHING;
