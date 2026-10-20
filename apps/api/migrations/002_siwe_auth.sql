-- Standalone authentication storage. No HTTP wallet route uses these tables yet.
-- These identities/sessions are deliberately separate from synthetic fixture users.
CREATE TABLE wallet_identities (
  id uuid PRIMARY KEY,
  address text NOT NULL UNIQUE CHECK (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL
);
CREATE TABLE siwe_challenges (
  id uuid PRIMARY KEY,
  nonce text NOT NULL UNIQUE CHECK (nonce ~ '^[0-9a-f]{64}$'),
  address text NOT NULL CHECK (address ~ '^0x[0-9a-f]{40}$'),
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  message text NOT NULL CHECK (length(message) <= 2048),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > issued_at)
);
CREATE INDEX siwe_challenge_expiry ON siwe_challenges(expires_at);
CREATE TABLE siwe_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  identity_id uuid NOT NULL REFERENCES wallet_identities(id),
  challenge_id uuid NOT NULL UNIQUE REFERENCES siwe_challenges(id),
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  origin text NOT NULL,
  uri text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX siwe_session_expiry ON siwe_sessions(expires_at);
