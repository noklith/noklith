-- Personal deposit addresses: each user gets one address derived from the operator's extended public key
-- (DEPOSIT_XPUB, path <xpub>/0/<derivation_index>). The server never holds the private keys, it only
-- watches incoming stablecoin transfers to these addresses and credits the card. Sweeping the funds is an
-- operator task with the offline seed.
CREATE TABLE deposit_addresses (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  derivation_index integer NOT NULL UNIQUE CHECK (derivation_index >= 0 AND derivation_index < 2147483648),
  address text NOT NULL UNIQUE CHECK (address ~ '^0x[0-9a-f]{40}$'),
  created_at timestamptz NOT NULL
);

-- Last fully scanned block per network and token. Blocks are scanned only once they have the network's
-- required confirmations, so a scanned transfer is final for crediting purposes.
CREATE TABLE deposit_scan_cursors (
  chain_id bigint NOT NULL CHECK (chain_id > 0),
  token_address text NOT NULL CHECK (token_address ~ '^0x[0-9a-f]{40}$'),
  last_block numeric(78, 0) NOT NULL CHECK (last_block >= 0),
  updated_at timestamptz NOT NULL,
  PRIMARY KEY (chain_id, token_address)
);

-- Deposits become ordinary top-up intents (already funding_pending, with the transfer recorded), so the
-- existing card credit, retries, review and history apply unchanged.
ALTER TABLE top_up_intents ADD COLUMN source text NOT NULL DEFAULT 'wallet' CHECK (source IN ('wallet', 'deposit'));
