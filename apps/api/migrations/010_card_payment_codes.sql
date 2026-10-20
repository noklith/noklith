-- One-time payment codes (3-D Secure OTP) that IZIPAY e-mails to a card's cardholder address. Wallet users
-- have no e-mail of their own, so the mail for card-<id>@<domain> is received for them and only the code
-- is kept, for a few minutes, to show in the app. The message itself is never stored.
CREATE TABLE card_payment_codes (
  id uuid PRIMARY KEY,
  card_id uuid NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]{4,8}$'),
  received_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL CHECK (expires_at > received_at)
);
CREATE INDEX card_payment_codes_card ON card_payment_codes(card_id, received_at DESC);
