-- Adds Kakao/Google social login on top of the existing username/password
-- accounts. Safe to run against a DB already provisioned from the
-- pre-OAuth db/schema.sql -- apply once via:
--   psql "$DATABASE_URL" -f db/migrations/001_oauth_login.sql
-- (Fresh installs don't need this: db/schema.sql already includes it.)

ALTER TABLE students ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE students ADD COLUMN IF NOT EXISTS oauth_provider TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS oauth_id TEXT;

ALTER TABLE students ADD CONSTRAINT students_exactly_one_auth_method CHECK (
  (password_hash IS NOT NULL AND oauth_provider IS NULL AND oauth_id IS NULL) OR
  (password_hash IS NULL AND oauth_provider IS NOT NULL AND oauth_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS students_oauth_identity_uidx ON students (oauth_provider, oauth_id)
  WHERE oauth_provider IS NOT NULL;