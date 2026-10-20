import { randomBytes, randomUUID } from 'node:crypto';
import type { CardEventResult, DemoCardEventRequest, IssuerNotification } from '../../../../packages/api-contracts/src/index.ts';
import type { Database, SQLConnection } from '../database.ts';
import { parsePositiveCents } from '../domain/money.ts';
import { APIProblem } from '../errors.ts';
import type { LimitsService } from '../limits.ts';
import { RiskService } from '../risk.ts';
import { recordUserEvent } from '../service.ts';
import type { CardIssuerAdapter } from './issuer.ts';

export const NOTIFICATION_TOLERANCE_MS = 5 * 60_000;
export const DEMO_EVENTS_PER_HOUR = 60;
type LedgerKind = 'authorization' | 'capture' | 'reversal' | 'refund';
const ENTRY: Record<LedgerKind, { status: string; available: (cents: bigint) => bigint; held: (cents: bigint) => bigint; label: string }> = {
  authorization: { status: 'held', available: c => -c, held: c => c, label: 'Pending' },
  capture: { status: 'completed', available: () => 0n, held: c => -c, label: 'Completed' },
  reversal: { status: 'reversed', available: c => c, held: c => -c, label: 'Released' },
  refund: { status: 'credited', available: c => c, held: () => 0n, label: 'Refund' },
};

/**
 * Card network events from the issuer. Signed notifications are verified before parsing, stored once
 * by event ID (received → verified → processed / declined / failed) and replay the stored result.
 * Authorizations are decided here, synchronously, which is what a future issuer must support for
 * limits to be enforceable before spending.
 */
export class CardEventProcessor {
  private readonly db: Database;
  private readonly issuer: CardIssuerAdapter;
  private readonly limits: LimitsService;
  private readonly now: () => Date;
  private readonly risk: RiskService;
  constructor(db: Database, issuer: CardIssuerAdapter, limits: LimitsService, now: () => Date = () => new Date(), risk?: RiskService) {
    this.db = db; this.issuer = issuer; this.limits = limits; this.now = now; this.risk = risk ?? new RiskService(limits);
  }

  /** Webhook entry point: raw body + signature headers. */
  async receive(rawBody: string, timestampHeader: unknown, signatureHeader: unknown): Promise<CardEventResult> {
    const timestamp = typeof timestampHeader === 'string' && /^[0-9]{10,13}$/.test(timestampHeader) ? Number(timestampHeader) : NaN;
    const signature = typeof signatureHeader === 'string' ? signatureHeader : '';
    if (!Number.isFinite(timestamp) || Math.abs(this.now().getTime() - timestamp) > NOTIFICATION_TOLERANCE_MS
        || !this.issuer.verifyNotification(rawBody, timestamp, signature)) {
      throw new APIProblem(401, 'invalid_notification_signature', 'The notification signature is invalid or expired.');
    }
    let event: IssuerNotification;
    try { event = JSON.parse(rawBody) as IssuerNotification; } catch { throw new APIProblem(400, 'invalid_notification', 'Malformed notification.'); }
    return this.process(event, rawBody);
  }

  /** Restricted demo tool: builds and signs an event for the caller's own card, then uses the webhook path. */
  async simulate(userID: string, request: DemoCardEventRequest): Promise<CardEventResult> {
    const card = (await this.db.query<{ id: string }>('SELECT id FROM cards WHERE user_id = $1', [userID])).rows[0];
    if (!card) throw new APIProblem(409, 'card_required', 'Create your card first.');
    const recent = await this.db.query<{ count: string }>(`SELECT count(*)::text AS count FROM issuer_events WHERE card_id = $1
      AND received_at > $2 AND payload->>'source' = 'demo_tool'`, [card.id, new Date(this.now().getTime() - 3600_000).toISOString()]);
    if (Number(recent.rows[0]?.count ?? 0) >= DEMO_EVENTS_PER_HOUR) throw new APIProblem(429, 'too_many_demo_events', 'Too many test card events. Try again later.');
    const event: IssuerNotification = {
      id: `evt_${randomBytes(12).toString('hex')}`, type: request.type, card_id: card.id, amount_cents: request.amount_cents,
      merchant: request.merchant ?? null, authorization_id: request.authorization_id ?? null, occurred_at: this.now().toISOString(), source: 'demo_tool',
    };
    const body = JSON.stringify(event);
    const timestamp = this.now().getTime();
    return this.receive(body, String(timestamp), this.issuer.signNotification(body, timestamp));
  }

  private async process(event: IssuerNotification, rawBody: string): Promise<CardEventResult> {
    if (!event || typeof event !== 'object' || typeof event.id !== 'string' || !/^[A-Za-z0-9_-]{8,80}$/.test(event.id)
        || !['authorization', 'capture', 'reversal', 'refund'].includes(event.type) || typeof event.card_id !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(event.card_id)) {
      throw new APIProblem(400, 'invalid_notification', 'Malformed notification.');
    }
    const now = this.now();
    const existing = await this.db.query<{ status: string; result: string | null; payload: unknown }>('SELECT status, result, payload FROM issuer_events WHERE id = $1', [event.id]);
    if (existing.rows[0]) return this.replay(event.id);
    // Stored before processing so a crash leaves a visible "verified" record rather than nothing.
    await this.db.query(`INSERT INTO issuer_events (id, card_id, type, status, payload, received_at)
      VALUES ($1, NULL, $2, 'verified', $3::jsonb, $4) ON CONFLICT (id) DO UPDATE SET attempts = issuer_events.attempts + 1`,
    [event.id, event.type, rawBody, now.toISOString()]);
    try {
      return await this.db.transaction(async tx => {
        const locked = (await tx.query<{ status: string }>('SELECT status FROM issuer_events WHERE id = $1 FOR UPDATE', [event.id])).rows[0];
        if (locked && locked.status !== 'verified') return this.replay(event.id, tx);
        const outcome = await this.apply(tx, event, now);
        await tx.query('UPDATE issuer_events SET status = $2, result = $3, card_id = $4, processed_at = $5 WHERE id = $1',
          [event.id, outcome.decision === 'declined' ? 'declined' : 'processed', JSON.stringify(outcome), outcome.card_id, now.toISOString()]);
        return outcome;
      });
    } catch (error) {
      const message = error instanceof APIProblem ? error.code : 'processing_error';
      await this.db.query("UPDATE issuer_events SET status = 'failed', result = $2 WHERE id = $1 AND status = 'verified'", [event.id, message]);
      throw error;
    }
  }

  private async replay(id: string, connection: SQLConnection = this.db): Promise<CardEventResult> {
    const row = (await connection.query<{ status: string; result: string | null }>('SELECT status, result FROM issuer_events WHERE id = $1', [id])).rows[0];
    if (row?.status === 'failed') throw new APIProblem(409, row.result ?? 'notification_failed', 'This notification was rejected earlier.');
    if (!row?.result) throw new APIProblem(409, 'notification_in_progress', 'This notification is being processed.');
    return { ...JSON.parse(row.result) as CardEventResult, duplicate: true };
  }

  private async apply(tx: SQLConnection, event: IssuerNotification, now: Date): Promise<CardEventResult> {
    let cents: bigint;
    try { cents = parsePositiveCents(event.amount_cents); }
    catch { throw new APIProblem(400, 'invalid_amount', 'Amount must be a positive whole number of cents.'); }
    const card = (await tx.query<{ id: string; user_id: string; status: string }>('SELECT id, user_id, status FROM cards WHERE id = $1 FOR UPDATE', [event.card_id])).rows[0];
    if (!card) throw new APIProblem(404, 'card_not_found', 'Card not found.');
    const result = (decision: 'approved' | 'declined', reason: string | null, entryID: string | null): CardEventResult =>
      ({ event_id: event.id, type: event.type, decision, reason, card_id: card.id, ledger_entry_id: entryID, duplicate: false });

    if (event.type === 'authorization') {
      const merchant = typeof event.merchant === 'string' ? event.merchant.trim().slice(0, 120) : '';
      if (!merchant) throw new APIProblem(400, 'merchant_required', 'An authorization needs a merchant name.');
      if (card.status === 'frozen_by_user') return result('declined', 'card_frozen', null);
      if (card.status === 'frozen_by_risk_rule') return result('declined', 'card_paused_by_rule', null);
      if (card.status !== 'active') return result('declined', 'card_blocked', null);
      const balance = (await tx.query<{ available: string }>('SELECT coalesce(sum(available_delta_cents), 0)::text AS available FROM ledger_entries WHERE card_id = $1', [card.id])).rows[0];
      const available = BigInt(balance?.available ?? '0');
      if (available < cents) return result('declined', 'insufficient_funds', null);
      try { await this.limits.checkSpend(tx, card.id, cents, now); }
      catch (error) { if (error instanceof APIProblem) return result('declined', error.code, null); throw error; }
      const velocity = await this.limits.purchaseVelocityReason(tx, card.id, now);
      if (velocity) return result('declined', velocity, null);
      // A rule match declines this authorization and pauses the card; the decline and the pause commit together.
      const risky = await this.risk.beforeAuthorization(tx, card.id, cents, available, now);
      if (risky) {
        await this.risk.pause(tx, card, risky, now);
        return result('declined', risky, null);
      }
      const id = await this.entry(tx, card.id, event, 'authorization', cents, merchant, null, now);
      await this.signal(tx, card, now);
      return result('approved', null, id);
    }

    // Capture, reversal and refund settle an earlier authorization on the same card; they are not
    // blocked by a later freeze, because the merchant already holds an approved authorization.
    const parent = typeof event.authorization_id === 'string' && /^[0-9a-f-]{36}$/.test(event.authorization_id)
      ? (await tx.query<{ id: string; amount_cents: string; merchant: string | null }>(`SELECT id, amount_cents::text, merchant FROM ledger_entries
          WHERE id = $1 AND card_id = $2 AND kind = 'authorization' FOR UPDATE`, [event.authorization_id, card.id])).rows[0] : undefined;
    if (!parent) throw new APIProblem(404, 'authorization_not_found', 'The referenced authorization does not exist on this card.');
    const children = (await tx.query<{ kind: string; total: string }>(`SELECT kind, sum(amount_cents)::text AS total FROM ledger_entries
      WHERE parent_id = $1 GROUP BY kind`, [parent.id])).rows;
    const sum = (kind: string) => BigInt(children.find(row => row.kind === kind)?.total ?? '0');
    const authorized = BigInt(parent.amount_cents);
    if (event.type === 'capture') {
      if (sum('capture') > 0n || sum('reversal') > 0n) throw new APIProblem(409, 'authorization_settled', 'This authorization is already settled.');
      if (cents !== authorized) throw new APIProblem(422, 'capture_amount_mismatch', 'Demo captures settle the full authorized amount.');
    } else if (event.type === 'reversal') {
      if (sum('capture') > 0n || sum('reversal') > 0n) throw new APIProblem(409, 'authorization_settled', 'This authorization is already settled.');
      if (cents !== authorized) throw new APIProblem(422, 'reversal_amount_mismatch', 'Demo reversals release the full authorized amount.');
    } else {
      if (sum('capture') === 0n) throw new APIProblem(409, 'not_captured', 'Only a completed purchase can be refunded.');
      if (sum('refund') + cents > sum('capture')) throw new APIProblem(422, 'refund_exceeds_capture', 'Refunds cannot exceed the completed amount.');
    }
    const id = await this.entry(tx, card.id, event, event.type, cents, parent.merchant, parent.id, now);
    await this.signal(tx, card, now);
    return result('approved', null, id);
  }

  private async entry(tx: SQLConnection, cardID: string, event: IssuerNotification, kind: LedgerKind, cents: bigint,
    merchant: string | null, parentID: string | null, now: Date): Promise<string> {
    const id = randomUUID();
    const spec = ENTRY[kind];
    const occurred = typeof event.occurred_at === 'string' && !Number.isNaN(Date.parse(event.occurred_at)) ? new Date(event.occurred_at) : now;
    await tx.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents,
      title, parent_id, merchant, occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [id, cardID, `issuer:${event.id}`, kind, spec.status, cents.toString(), spec.available(cents).toString(), spec.held(cents).toString(),
      `${merchant ?? 'Test purchase'} · ${spec.label}`, parentID, merchant, occurred.toISOString()]);
    return id;
  }

  private async signal(tx: SQLConnection, card: { id: string; user_id: string }, now: Date) {
    await recordUserEvent(tx, card.user_id, 'history', card.id, now);
    await recordUserEvent(tx, card.user_id, 'card', card.id, now);
  }
}
