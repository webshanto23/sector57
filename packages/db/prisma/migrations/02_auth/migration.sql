-- Step 4: phone + password login.

-- Lockout: 4 wrong passwords in a row lock the account for 60 minutes.
ALTER TABLE users
  ADD COLUMN failed_login_count smallint NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  ADD COLUMN locked_until timestamptz;

-- One row per refresh token. A login starts a family; every refresh replaces the
-- row with a new one in the same family. Presenting a replaced (revoked) token
-- again means it was copied, so the whole family is revoked.
CREATE TABLE user_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  society_id    uuid NOT NULL REFERENCES societies(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id     uuid NOT NULL,
  token_hash    text NOT NULL UNIQUE,          -- SHA-256 (hex) of the refresh token; the token itself is never stored
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  ip_address    inet,
  user_agent    text,
  revoked_at    timestamptz
);
CREATE INDEX user_sessions_user_idx   ON user_sessions(user_id) WHERE revoked_at IS NULL;
CREATE INDEX user_sessions_family_idx ON user_sessions(family_id);
