-- The amount that reached the card can differ from the amount paid: our service fee and the issuer's
-- own top-up fee are deducted. credited_cents is the issuer-confirmed card credit, set when credited.
ALTER TABLE top_up_intents ADD COLUMN service_fee_cents bigint NOT NULL DEFAULT 0 CHECK (service_fee_cents >= 0);
ALTER TABLE top_up_intents ADD COLUMN credited_cents bigint CHECK (credited_cents IS NULL OR credited_cents > 0);
