-- A card is issued either by the DemoIssuer stub or by IZIPAY. The issuer's own card ID links the two
-- records. It is unique and, for IZIPAY, set as soon as the issuer accepts the request.
ALTER TABLE cards DROP CONSTRAINT cards_issuer_mode_check;
ALTER TABLE cards ADD CONSTRAINT cards_issuer_mode_check CHECK (issuer_mode IN ('demo', 'izipay'));
ALTER TABLE cards ADD COLUMN issuer_card_id text UNIQUE CHECK (issuer_card_id IS NULL OR issuer_card_id ~ '^[A-Za-z0-9_-]{1,80}$');
ALTER TABLE cards ADD CONSTRAINT cards_issuer_reference CHECK (issuer_mode = 'demo' OR status = 'provisioning' OR issuer_card_id IS NOT NULL);
