CREATE TABLE IF NOT EXISTS styles (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, design TEXT NOT NULL, created_at INTEGER, updated_at INTEGER);
CREATE INDEX IF NOT EXISTS styles_user ON styles (user_id);
