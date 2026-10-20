import { randomUUID } from 'node:crypto';
import type { SQLConnection } from './database.ts';
import type { LimitsService } from './limits.ts';
import { recordUserEvent } from './service.ts';

/**
 * Automatic rules from the specification's fraud section. A match pauses the card with status
 * frozen_by_risk_rule, which the cardholder may lift (spec: "user can self-serve unfreeze").
 * blocked_by_risk remains an operator-only state. Thresholds are working assumptions.
 */
export interface RiskRules {
  /** N credited top-ups, each at least P% of the single top-up limit, within W minutes. */
  maxTopUpSeries: { enabled: boolean; count: number; windowMinutes: number; minPercentOfSingleLimit: number };
  /** One authorization of at least P% of the available balance within W minutes after a credited top-up. */
  drainAfterTopUp: { enabled: boolean; windowMinutes: number; minPercentOfAvailable: number; minAvailableCents: bigint };
}
export const DEFAULT_RISK_RULES: RiskRules = {
  maxTopUpSeries: { enabled: true, count: 3, windowMinutes: 60, minPercentOfSingleLimit: 90 },
  drainAfterTopUp: { enabled: true, windowMinutes: 30, minPercentOfAvailable: 90, minAvailableCents: 5_000n },
};
export type RiskReason = 'rule_max_top_up_series' | 'rule_drain_after_top_up';

export class RiskService {
  readonly rules: RiskRules;
  private readonly limits: LimitsService;

  constructor(limits: LimitsService, rules: RiskRules = DEFAULT_RISK_RULES) {
    const series = rules.maxTopUpSeries, drain = rules.drainAfterTopUp;
    if (!Number.isInteger(series.count) || series.count < 2 || !Number.isInteger(series.windowMinutes) || series.windowMinutes < 1
        || series.minPercentOfSingleLimit < 1 || series.minPercentOfSingleLimit > 100
        || !Number.isInteger(drain.windowMinutes) || drain.windowMinutes < 1
        || drain.minPercentOfAvailable < 1 || drain.minPercentOfAvailable > 100 || drain.minAvailableCents < 0n) {
      throw new Error('Invalid risk rule configuration.');
    }
    this.limits = limits;
    this.rules = rules;
  }

  /** Evaluated in the credit transaction, after the ledger entry exists. */
  async afterTopUpCredited(tx: SQLConnection, cardId: string, now: Date): Promise<RiskReason | null> {
    const rule = this.rules.maxTopUpSeries;
    if (!rule.enabled) return null;
    const minimum = this.limits.limits.singleTopUp * BigInt(rule.minPercentOfSingleLimit) / 100n;
    const result = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM top_up_intents
      WHERE card_id = $1 AND status = 'credited' AND credited_at > $2 AND amount_cents >= $3`,
    [cardId, new Date(now.getTime() - rule.windowMinutes * 60_000).toISOString(), minimum.toString()]);
    return Number(result.rows[0]?.count ?? 0) >= rule.count ? 'rule_max_top_up_series' : null;
  }

  /** Evaluated before approving an authorization; `available` is the balance before it. */
  async beforeAuthorization(tx: SQLConnection, cardId: string, cents: bigint, available: bigint, now: Date): Promise<RiskReason | null> {
    const rule = this.rules.drainAfterTopUp;
    if (!rule.enabled || available < rule.minAvailableCents || cents * 100n < available * BigInt(rule.minPercentOfAvailable)) return null;
    const recent = await tx.query(`SELECT 1 FROM top_up_intents WHERE card_id = $1 AND status = 'credited' AND credited_at > $2 LIMIT 1`,
      [cardId, new Date(now.getTime() - rule.windowMinutes * 60_000).toISOString()]);
    return recent.rows.length ? 'rule_drain_after_top_up' : null;
  }

  /** Pauses an active card (caller holds the card row lock). Returns false if the card was not active. */
  async pause(tx: SQLConnection, card: { id: string; user_id: string; status: string }, reason: RiskReason, now: Date): Promise<boolean> {
    if (card.status !== 'active') return false;
    await tx.query("UPDATE cards SET status = 'frozen_by_risk_rule' WHERE id = $1", [card.id]);
    await tx.query(`INSERT INTO card_state_events (id, card_id, previous_status, next_status, actor_user_id, reason, occurred_at)
      VALUES ($1, $2, 'active', 'frozen_by_risk_rule', NULL, $3, $4)`, [randomUUID(), card.id, reason, now.toISOString()]);
    card.status = 'frozen_by_risk_rule';
    await recordUserEvent(tx, card.user_id, 'card', card.id, now);
    await recordUserEvent(tx, card.user_id, 'history', card.id, now);
    return true;
  }
}
