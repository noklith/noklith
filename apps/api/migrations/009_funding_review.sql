-- An issuer load that kept failing, or answered with an amount we did not ask for, stops retrying on its own
-- and waits for the operator: needs_review_at is when that happened. Clearing it (with funding_attempts = 0)
-- resumes automatic retries. The status stays funding_pending, so the user still sees "awaiting card credit".
ALTER TABLE top_up_intents ADD COLUMN needs_review_at timestamptz;
