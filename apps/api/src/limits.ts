import type { SQLConnection } from './database.ts';
import { APIProblem } from './errors.ts';

/** Product limits from the customer specification, in integer cents. */
export interface CardLimits { singleTopUp: bigint; monthlyTopUp: bigint; dailySpend: bigint; monthlySpend: bigint }
export const DEFAULT_LIMITS: CardLimits = { singleTopUp: 50_000n, monthlyTopUp: 500_000n, dailySpend: 100_000n, monthlySpend: 500_000n };

/**
 * Operation counts in rolling windows (last 60 minutes / last 24 hours). Working assumptions,
 * not customer values: the specification asks for velocity limits without numbers.
 */
export interface VelocityLimits { topUpsPerHour: number; topUpsPerDay: number; purchasesPerHour: number; purchasesPerDay: number }
export const DEFAULT_VELOCITY: VelocityLimits = { topUpsPerHour: 5, topUpsPerDay: 10, purchasesPerHour: 10, purchasesPerDay: 30 };
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** Intents that never became a transfer attempt do not count toward top-up velocity. */
const COUNTED_TOP_UP = `status NOT IN ('cancelled') AND NOT (status = 'expired' AND failure_reason = 'quote_expired')`;

/** Demo periods are UTC calendar days and months: [start, end). */
export function utcPeriods(now: Date) {
  const y = now.getUTCFullYear(), m = now.getUTCMonth(), d = now.getUTCDate();
  return {
    dayStart: new Date(Date.UTC(y, m, d)), dayEnd: new Date(Date.UTC(y, m, d + 1)),
    monthStart: new Date(Date.UTC(y, m, 1)), monthEnd: new Date(Date.UTC(y, m + 1, 1)),
  };
}

const RELEASED_TOP_UP = `('failed', 'cancelled', 'expired')`;

/**
 * Limit checks run inside the caller's transaction after it locked the card row
 * (SELECT ... FOR UPDATE), so concurrent requests for one card are serialized and
 * cannot both pass a check against the same remaining allowance.
 */
export class LimitsService {
  readonly limits: CardLimits;
  readonly velocity: VelocityLimits;
  constructor(limits: CardLimits = DEFAULT_LIMITS, velocity: VelocityLimits = DEFAULT_VELOCITY) {
    for (const value of Object.values(limits)) if (value <= 0n) throw new Error('Limits must be positive.');
    for (const value of Object.values(velocity)) if (!Number.isInteger(value) || value < 1 || value > 10_000) throw new Error('Velocity limits must be positive integers.');
    if (velocity.topUpsPerHour > velocity.topUpsPerDay || velocity.purchasesPerHour > velocity.purchasesPerDay) throw new Error('Hourly velocity cannot exceed daily velocity.');
    this.limits = limits;
    this.velocity = velocity;
  }

  async topUpCount(tx: SQLConnection, cardId: string, since: Date): Promise<number> {
    const result = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM top_up_intents
      WHERE card_id = $1 AND created_at > $2 AND ${COUNTED_TOP_UP}`, [cardId, since.toISOString()]);
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Approved test purchases (authorizations); declined attempts never create a ledger entry. */
  async purchaseCount(tx: SQLConnection, cardId: string, since: Date): Promise<number> {
    const result = await tx.query<{ count: string }>(`SELECT count(*)::text AS count FROM ledger_entries
      WHERE card_id = $1 AND kind = 'authorization' AND occurred_at > $2`, [cardId, since.toISOString()]);
    return Number(result.rows[0]?.count ?? 0);
  }

  /** Caller holds the card row lock, so concurrent requests are counted one after another. */
  async checkTopUpVelocity(tx: SQLConnection, cardId: string, now: Date): Promise<void> {
    if (await this.topUpCount(tx, cardId, new Date(now.getTime() - HOUR_MS)) >= this.velocity.topUpsPerHour) {
      throw new APIProblem(429, 'limit_top_ups_per_hour', 'Too many top-ups in the last hour. Try again later.');
    }
    if (await this.topUpCount(tx, cardId, new Date(now.getTime() - DAY_MS)) >= this.velocity.topUpsPerDay) {
      throw new APIProblem(429, 'limit_top_ups_per_day', 'Too many top-ups in the last 24 hours. Try again tomorrow.');
    }
  }

  /** Returns a decline reason, or null when another purchase is allowed. */
  async purchaseVelocityReason(tx: SQLConnection, cardId: string, now: Date): Promise<string | null> {
    if (await this.purchaseCount(tx, cardId, new Date(now.getTime() - HOUR_MS)) >= this.velocity.purchasesPerHour) return 'limit_purchases_per_hour';
    if (await this.purchaseCount(tx, cardId, new Date(now.getTime() - DAY_MS)) >= this.velocity.purchasesPerDay) return 'limit_purchases_per_day';
    return null;
  }

  async topUpUsage(tx: SQLConnection, cardId: string, now: Date): Promise<bigint> {
    const { monthStart, monthEnd } = utcPeriods(now);
    const result = await tx.query<{ total: string }>(`SELECT coalesce(sum(amount_cents), 0)::text AS total FROM top_up_intents
      WHERE card_id = $1 AND created_at >= $2 AND created_at < $3 AND status NOT IN ${RELEASED_TOP_UP}`,
    [cardId, monthStart.toISOString(), monthEnd.toISOString()]);
    return BigInt(result.rows[0]?.total ?? '0');
  }

  /** Spend counts authorizations in the period minus reversals of those authorizations. Refunds do not restore it. */
  async spendUsage(tx: SQLConnection, cardId: string, start: Date, end: Date): Promise<bigint> {
    const result = await tx.query<{ total: string }>(`SELECT coalesce(sum(CASE WHEN l.kind = 'authorization' THEN l.amount_cents ELSE -l.amount_cents END), 0)::text AS total
      FROM ledger_entries l LEFT JOIN ledger_entries p ON p.id = l.parent_id
      WHERE l.card_id = $1 AND (
        (l.kind = 'authorization' AND l.occurred_at >= $2 AND l.occurred_at < $3) OR
        (l.kind = 'reversal' AND p.kind = 'authorization' AND p.occurred_at >= $2 AND p.occurred_at < $3))`,
    [cardId, start.toISOString(), end.toISOString()]);
    return BigInt(result.rows[0]?.total ?? '0');
  }

  async checkTopUp(tx: SQLConnection, cardId: string, cents: bigint, now: Date): Promise<void> {
    if (cents <= 0n) throw new APIProblem(400, 'invalid_amount', 'Amount must be greater than zero.');
    if (cents > this.limits.singleTopUp) throw new APIProblem(422, 'limit_single_top_up', 'Amount exceeds the single top-up limit.');
    if (await this.topUpUsage(tx, cardId, now) + cents > this.limits.monthlyTopUp) {
      throw new APIProblem(422, 'limit_monthly_top_up', 'Amount exceeds the remaining monthly top-up limit.');
    }
  }

  async checkSpend(tx: SQLConnection, cardId: string, cents: bigint, now: Date): Promise<void> {
    if (cents <= 0n) throw new APIProblem(400, 'invalid_amount', 'Amount must be greater than zero.');
    const { dayStart, dayEnd, monthStart, monthEnd } = utcPeriods(now);
    if (await this.spendUsage(tx, cardId, dayStart, dayEnd) + cents > this.limits.dailySpend) {
      throw new APIProblem(422, 'limit_daily_spend', 'Purchase exceeds the daily spend limit.');
    }
    if (await this.spendUsage(tx, cardId, monthStart, monthEnd) + cents > this.limits.monthlySpend) {
      throw new APIProblem(422, 'limit_monthly_spend', 'Purchase exceeds the monthly spend limit.');
    }
  }

  async usage(tx: SQLConnection, cardId: string, now: Date) {
    const { dayStart, dayEnd, monthStart, monthEnd } = utcPeriods(now);
    const hourAgo = new Date(now.getTime() - HOUR_MS), dayAgo = new Date(now.getTime() - DAY_MS);
    return {
      monthly_top_up_cents: String(await this.topUpUsage(tx, cardId, now)),
      daily_spend_cents: String(await this.spendUsage(tx, cardId, dayStart, dayEnd)),
      monthly_spend_cents: String(await this.spendUsage(tx, cardId, monthStart, monthEnd)),
      top_ups_last_hour: await this.topUpCount(tx, cardId, hourAgo),
      top_ups_last_day: await this.topUpCount(tx, cardId, dayAgo),
      purchases_last_hour: await this.purchaseCount(tx, cardId, hourAgo),
      purchases_last_day: await this.purchaseCount(tx, cardId, dayAgo),
    };
  }

  /** Public values for /v1/config and /v1/limits. */
  publicValues() {
    return {
      single_top_up_cents: String(this.limits.singleTopUp), monthly_top_up_cents: String(this.limits.monthlyTopUp),
      daily_spend_cents: String(this.limits.dailySpend), monthly_spend_cents: String(this.limits.monthlySpend), period_timezone: 'UTC' as const,
      top_ups_per_hour: this.velocity.topUpsPerHour, top_ups_per_day: this.velocity.topUpsPerDay,
      purchases_per_hour: this.velocity.purchasesPerHour, purchases_per_day: this.velocity.purchasesPerDay,
    };
  }
}
