-- frozen_by_risk_rule: an automatic pause the cardholder may lift. blocked_by_risk stays operator-only.
ALTER TABLE cards DROP CONSTRAINT cards_status_check;
ALTER TABLE cards ADD CONSTRAINT cards_status_check CHECK (status IN (
  'provisioning', 'active', 'frozen_by_user', 'frozen_by_risk_rule', 'blocked_by_risk', 'closed', 'replaced'));

-- State changes made by the system carry a reason and no user actor.
ALTER TABLE card_state_events ADD COLUMN reason text CHECK (reason IS NULL OR reason ~ '^[a-z_]{3,64}$');
ALTER TABLE card_state_events ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE card_state_events ADD CONSTRAINT card_state_events_actor CHECK (actor_user_id IS NOT NULL OR reason IS NOT NULL);
CREATE INDEX card_state_events_card_time ON card_state_events(card_id, occurred_at);

-- Velocity and rule lookups by time.
CREATE INDEX top_up_intents_card_credited ON top_up_intents(card_id, credited_at) WHERE status = 'credited'
