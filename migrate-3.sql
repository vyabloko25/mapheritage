ALTER TABLE users ADD COLUMN terms_accepted_at INTEGER;
ALTER TABLE users ADD COLUMN terms_version TEXT;
ALTER TABLE users ADD COLUMN age_confirmed INTEGER DEFAULT 0;
CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, n INTEGER NOT NULL, reset INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS print_orders (id TEXT PRIMARY KEY, user_id TEXT, map_id TEXT, file_key TEXT NOT NULL, file_token TEXT NOT NULL, format TEXT, paper TEXT, frame TEXT, name TEXT, street TEXT, zip TEXT, city TEXT, country TEXT, email TEXT, phone TEXT, note TEXT, items REAL, shipping REAL, total REAL, currency TEXT, status TEXT DEFAULT 'new', terms_version TEXT, created_at INTEGER);
CREATE INDEX IF NOT EXISTS print_orders_user ON print_orders (user_id);
