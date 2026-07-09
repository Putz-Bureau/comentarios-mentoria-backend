CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  is_reply INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_comments_ts ON comments (ts);
