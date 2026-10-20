CREATE TABLE app_users (
  id uuid PRIMARY KEY,
  authentication text NOT NULL CHECK (authentication = 'fixture'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE cards (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES app_users(id),
  status text NOT NULL CHECK (status IN ('provisioning', 'active', 'frozen_by_user', 'blocked_by_risk', 'closed', 'replaced')),
  last_four text NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
  issuer_mode text NOT NULL DEFAULT 'demo' CHECK (issuer_mode = 'demo'),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Immutable monetary history. Balances derive from deltas, without a mutable balance column.
CREATE TABLE ledger_entries (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES cards(id),
  source_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('top_up', 'authorization', 'capture', 'reversal', 'refund')),
  status text NOT NULL CHECK (status IN ('credited', 'held', 'completed', 'reversed')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  available_delta_cents bigint NOT NULL,
  held_delta_cents bigint NOT NULL,
  title text NOT NULL,
  occurred_at timestamptz NOT NULL,
  demonstration boolean NOT NULL DEFAULT true CHECK (demonstration = true),
  UNIQUE(card_id, source_key),
  CHECK (
    (kind IN ('top_up', 'refund') AND available_delta_cents = amount_cents AND held_delta_cents = 0) OR
    (kind = 'authorization' AND available_delta_cents = -amount_cents AND held_delta_cents = amount_cents) OR
    (kind = 'capture' AND available_delta_cents = 0 AND held_delta_cents = -amount_cents) OR
    (kind = 'reversal' AND available_delta_cents = amount_cents AND held_delta_cents = -amount_cents)
  )
);
CREATE INDEX ledger_history ON ledger_entries(card_id, occurred_at DESC, id DESC);
CREATE TABLE idempotency_keys (
  user_id uuid NOT NULL REFERENCES app_users(id),
  key text NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, key)
);
CREATE TABLE card_state_events (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES cards(id),
  previous_status text NOT NULL,
  next_status text NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES app_users(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
