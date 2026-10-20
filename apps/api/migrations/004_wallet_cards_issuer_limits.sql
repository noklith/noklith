-- Wallet identities become card owners through their own app user row.
-- Fixture users and wallet users never share a row: the kind fixes which identity is allowed.
ALTER TABLE app_users DROP CONSTRAINT app_users_authentication_check;
ALTER TABLE app_users ADD COLUMN wallet_identity_id uuid UNIQUE REFERENCES wallet_identities(id);
ALTER TABLE app_users ADD CONSTRAINT app_users_identity_kind CHECK (
  (authentication = 'fixture' AND wallet_identity_id IS NULL) OR
  (authentication = 'siwe' AND wallet_identity_id IS NOT NULL)
);

-- Purchases reference their authorization, corrections are compensating rows, never edits or deletes.
ALTER TABLE ledger_entries ADD COLUMN parent_id uuid REFERENCES ledger_entries(id);
ALTER TABLE ledger_entries ADD COLUMN merchant text CHECK (merchant IS NULL OR length(merchant) BETWEEN 1 AND 120);
ALTER TABLE ledger_entries ADD COLUMN network text CHECK (network IS NULL OR network ~ '^eip155:[0-9]+$');
ALTER TABLE ledger_entries ADD COLUMN transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$');
CREATE INDEX ledger_parent ON ledger_entries(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX ledger_spend_period ON ledger_entries(card_id, kind, occurred_at);

-- Audit of short-lived demo credential reveals. The synthetic number itself is derived, never stored.
CREATE TABLE card_credential_reveals (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES cards(id),
  revealed_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > revealed_at)
);
CREATE INDEX card_credential_reveal_window ON card_credential_reveals(card_id, revealed_at);

-- Top-up intents double as limit reservations: an active intent counts toward the monthly top-up limit
-- until it is credited (still counted) or ends as failed/cancelled/expired (released).
CREATE TABLE top_up_intents (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES cards(id),
  user_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL CHECK (status IN ('quoted', 'awaiting_signature', 'submitted', 'confirming', 'funding_pending', 'credited', 'failed', 'cancelled', 'expired')),
  failure_reason text,
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  asset text NOT NULL CHECK (asset ~ '^[A-Z0-9]{2,12}$'),
  token_address text NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  token_decimals integer NOT NULL CHECK (token_decimals BETWEEN 2 AND 36),
  sender_address text NOT NULL CHECK (sender_address ~ '^0x[0-9a-f]{40}$'),
  recipient_address text NOT NULL CHECK (recipient_address ~ '^0x[0-9a-f]{40}$'),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  token_units numeric(78, 0) NOT NULL CHECK (token_units > 0),
  transaction_hash text CHECK (transaction_hash IS NULL OR transaction_hash ~ '^0x[0-9a-f]{64}$'),
  confirmations integer NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  funding_attempts integer NOT NULL DEFAULT 0 CHECK (funding_attempts >= 0),
  created_at timestamptz NOT NULL,
  quote_expires_at timestamptz NOT NULL,
  submit_deadline timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  next_check_at timestamptz,
  credited_at timestamptz,
  CHECK (quote_expires_at > created_at AND submit_deadline >= quote_expires_at),
  CHECK ((status = 'failed') = (failure_reason IS NOT NULL) OR status IN ('cancelled', 'expired')),
  CHECK (status NOT IN ('submitted', 'confirming', 'funding_pending', 'credited') OR transaction_hash IS NOT NULL)
);
CREATE INDEX top_up_intents_card_period ON top_up_intents(card_id, created_at);
CREATE INDEX top_up_intents_work ON top_up_intents(next_check_at) WHERE status IN ('submitted', 'confirming', 'funding_pending');
-- One hash is claimed by at most one active or credited intent.
CREATE UNIQUE INDEX top_up_intents_hash ON top_up_intents(chain_id, transaction_hash)
  WHERE transaction_hash IS NOT NULL AND status NOT IN ('failed', 'cancelled', 'expired');

-- Each verified on-chain transfer event can be credited exactly once (chain, hash and log index).
CREATE TABLE chain_transfers (
  chain_id bigint NOT NULL,
  transaction_hash text NOT NULL CHECK (transaction_hash ~ '^0x[0-9a-f]{64}$'),
  log_index integer NOT NULL CHECK (log_index >= 0),
  intent_id uuid NOT NULL UNIQUE REFERENCES top_up_intents(id),
  block_number numeric(78, 0) NOT NULL,
  token_address text NOT NULL,
  sender_address text NOT NULL,
  recipient_address text NOT NULL,
  token_units numeric(78, 0) NOT NULL,
  verified_at timestamptz NOT NULL,
  PRIMARY KEY (chain_id, transaction_hash, log_index)
);

-- Signed issuer notifications (DemoIssuer today). Processing is idempotent per event id.
CREATE TABLE issuer_events (
  id text PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{8,80}$'),
  card_id uuid REFERENCES cards(id),
  type text NOT NULL,
  status text NOT NULL CHECK (status IN ('received', 'verified', 'processed', 'declined', 'failed')),
  payload jsonb NOT NULL,
  result text,
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  received_at timestamptz NOT NULL,
  processed_at timestamptz
);

-- Ordered change signals per user. REST stays the source of truth, clients recover by sequence.
CREATE TABLE user_events (
  seq bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id),
  type text NOT NULL CHECK (type IN ('card', 'history', 'top_up')),
  reference_id uuid,
  occurred_at timestamptz NOT NULL
);
CREATE INDEX user_events_user_seq ON user_events(user_id, seq)
