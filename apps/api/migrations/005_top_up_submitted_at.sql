-- Time the transaction hash was received. The not-found timeout counts from here, not from the last poll.
ALTER TABLE top_up_intents ADD COLUMN submitted_at timestamptz
