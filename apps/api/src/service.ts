import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type {
  Card, CardResponse, CardStatus, CredentialsResponse, EventsResponse, FixtureProfile, HistoryItem, HistoryResponse, IssuerMode,
  LimitsResponse, SessionResponse, User,
} from '../../../packages/api-contracts/src/index.ts';
import type { Database, SQLConnection } from './database.ts';
import { APIProblem } from './errors.ts';
import type { CardIssuerAdapter, ProvisionResult } from './issuer/issuer.ts';
import { DemoIssuer } from './issuer/issuer.ts';
import { LimitsService } from './limits.ts';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const iso = (value: unknown) => new Date(String(value)).toISOString();
type CardRow = { id: string; status: CardStatus; last_four: string; issuer_mode: IssuerMode; available_cents: string; held_cents: string };
const balanceSQL = `SELECT c.id, c.status, c.last_four, c.issuer_mode,
  coalesce(sum(l.available_delta_cents), 0)::text AS available_cents,
  coalesce(sum(l.held_delta_cents), 0)::text AS held_cents
  FROM cards c LEFT JOIN ledger_entries l ON l.card_id = c.id
  WHERE c.user_id = $1 GROUP BY c.id`;
export const CREDENTIALS_TTL_MS = 60_000;
export const CREDENTIAL_REVEALS_PER_HOUR = 10;
const PROVISIONING_REFRESH_MS = 10_000;
/** IZIPAY allows 30 requests a minute per account; one balance read per card at most this often. */
const ISSUER_BALANCE_REFRESH_MS = 30_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UserEventType = 'card' | 'history' | 'top_up';
export const USER_EVENTS_CHANNEL = 'user_events';
export async function recordUserEvent(tx: SQLConnection, userID: string, type: UserEventType, referenceID: string | null, now: Date) {
  await tx.query('INSERT INTO user_events (user_id, type, reference_id, occurred_at) VALUES ($1,$2,$3,$4)',
    [userID, type, referenceID, now.toISOString()]);
  // Delivered at commit (never for a rolled-back change); the payload is only the owner ID.
  await tx.query('SELECT pg_notify($1, $2)', [USER_EVENTS_CHANNEL, userID]);
}

export class CardService {
  db: Database;
  now: () => Date;
  issuer: CardIssuerAdapter;
  limits: LimitsService;
  constructor(db: Database, now = () => new Date(), issuer: CardIssuerAdapter = new DemoIssuer(), limits = new LimitsService()) {
    this.db = db; this.now = now; this.issuer = issuer; this.limits = limits;
  }

  async createFixtureSession(profile: FixtureProfile): Promise<SessionResponse> {
    const userID = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const expires = new Date(this.now().getTime() + 60 * 60 * 1000).toISOString();
    await this.db.transaction(async tx => {
      await tx.query("INSERT INTO app_users (id, authentication) VALUES ($1, 'fixture')", [userID]);
      await tx.query('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)', [tokenHash(token), userID, expires]);
      if (profile !== 'empty') {
        const cardID = randomUUID();
        await tx.query('INSERT INTO cards (id, user_id, status, last_four) VALUES ($1, $2, $3, $4)', [cardID, userID, profile === 'risk' ? 'blocked_by_risk' : 'active', '0428']);
        // Screen fixtures only: no on-chain transfer, exchange, or actual purchase is asserted.
        const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
        const rows: [string, string, string, string, string, string, string | null, string | null][] = [
          ['top_up', 'credited', '25000', '25000', '0', 'Demo top-up', null, null],
          ['authorization', 'held', '1840', '-1840', '1840', 'Demo bookstore · authorization', null, 'Demo bookstore'],
          ['capture', 'completed', '1840', '0', '-1840', 'Demo bookstore · completed', ids[1]!, 'Demo bookstore'],
          ['authorization', 'held', '850', '-850', '850', 'Demo coffee · pending', null, 'Demo coffee'],
        ];
        for (const [index, entry] of rows.entries()) {
          const time = new Date(this.now().getTime() - (rows.length - index) * 60000).toISOString();
          await tx.query(`INSERT INTO ledger_entries
            (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, parent_id, merchant, occurred_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, [ids[index], cardID, `seed:${index}`, ...entry, time]);
        }
      }
    });
    return { access_token: token, expires_at: expires, user: { id: userID, wallet_address: null, authentication: 'fixture' } };
  }

  async authenticate(authorization: string | undefined): Promise<User> {
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (!token) throw new APIProblem(401, 'unauthorized', 'A valid session is required.');
    const result = await this.db.query<{ user_id: string }>(
      'SELECT user_id FROM sessions WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2', [tokenHash(token), this.now().toISOString()]);
    const row = result.rows[0];
    if (!row) throw new APIProblem(401, 'session_expired', 'The session is expired or revoked.');
    return { id: row.user_id, wallet_address: null, authentication: 'fixture' };
  }

  /** The card owner for a verified wallet identity. A different address is a different owner. */
  async walletOwner(identityID: string): Promise<string> {
    await this.db.query(`INSERT INTO app_users (id, authentication, wallet_identity_id) VALUES ($1, 'siwe', $2)
      ON CONFLICT (wallet_identity_id) DO NOTHING`, [randomUUID(), identityID]);
    const result = await this.db.query<{ id: string }>('SELECT id FROM app_users WHERE wallet_identity_id = $1', [identityID]);
    const id = result.rows[0]?.id;
    if (!id) throw new Error('Wallet owner creation failed.');
    return id;
  }

  async logout(authorization: string | undefined): Promise<void> {
    // Revocation is idempotent even after expiry. An arbitrary token cannot revoke another session.
    const token = authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
    if (token) await this.db.query('UPDATE sessions SET revoked_at = coalesce(revoked_at, $2) WHERE token_hash = $1', [tokenHash(token), this.now().toISOString()]);
  }

  async getCard(userID: string, connection: SQLConnection = this.db): Promise<CardResponse> {
    const result = await connection.query<CardRow>(balanceSQL, [userID]);
    const row = result.rows[0];
    const card: Card | null = row ? { ...row, currency: 'USD' } : null;
    return { card };
  }

  /** Locks and returns the caller's own card. Another user's card ID is indistinguishable from a missing one. */
  async lockOwnCard(tx: SQLConnection, userID: string, cardID: string) {
    if (!UUID_PATTERN.test(cardID)) throw new APIProblem(404, 'card_not_found', 'Card not found.');
    const result = await tx.query<{ id: string; status: CardStatus; last_four: string; issuer_card_id: string | null; issuer_mode: IssuerMode }>(
      'SELECT id, status, last_four, issuer_card_id, issuer_mode FROM cards WHERE id = $1 AND user_id = $2 FOR UPDATE', [cardID, userID]);
    const row = result.rows[0];
    if (!row) throw new APIProblem(404, 'card_not_found', 'Card not found.');
    return row;
  }

  async mutation<T>(userID: string, key: string, fingerprint: string, work: (tx: SQLConnection) => Promise<T>): Promise<T> {
    return this.db.transaction(async tx => {
      // Serialize a user's mutations, including requests that reuse a key on different cards/routes.
      await tx.query('SELECT id FROM app_users WHERE id = $1 FOR UPDATE', [userID]);
      const previous = await tx.query<{ fingerprint: string; response: T }>(
        'SELECT fingerprint, response FROM idempotency_keys WHERE user_id = $1 AND key = $2', [userID, key]);
      if (previous.rows[0]) {
        if (previous.rows[0].fingerprint !== fingerprint) throw new APIProblem(409, 'idempotency_conflict', 'This key was already used for a different request.');
        return previous.rows[0].response;
      }
      const response = await work(tx);
      await tx.query('INSERT INTO idempotency_keys (user_id, key, fingerprint, response) VALUES ($1,$2,$3,$4::jsonb)', [userID, key, fingerprint, JSON.stringify(response)]);
      return response;
    });
  }

  async createCard(userID: string, key: string): Promise<CardResponse> {
    return this.mutation(userID, key, 'POST:/v1/cards', async tx => {
      const existing = await this.getCard(userID, tx);
      if (existing.card) return existing;
      const cardID = randomUUID();
      // Reserve the single card slot first, then ask the issuer; a failure rolls both back.
      // A partner issuer keys the card by user ID, so a retry after a rollback adopts the card it already made.
      await tx.query("INSERT INTO cards (id, user_id, status, last_four, issuer_mode) VALUES ($1,$2,'provisioning','0000',$3)",
        [cardID, userID, this.issuer.mode]);
      const result = await this.issuerCall(() => this.issuer.provision({ cardId: cardID, userId: userID }));
      if (result.failed) throw new APIProblem(502, 'card_issue_failed', 'The card issuer could not issue the card. Try again later.');
      if (result.issuerCardId) await tx.query('UPDATE cards SET issuer_card_id = $2 WHERE id = $1', [cardID, result.issuerCardId]);
      if (result.lastFour) await this.activate(tx, cardID, userID, result.lastFour);
      await recordUserEvent(tx, userID, 'card', cardID, this.now());
      return this.getCard(userID, tx);
    });
  }

  private readonly refreshedAt = new Map<string, number>();

  /** Moves a card the issuer is still preparing to active once it is issued. Throttled per card. */
  async syncProvisioning(userID: string): Promise<void> {
    const pending = (await this.db.query<{ id: string; issuer_card_id: string }>(
      "SELECT id, issuer_card_id FROM cards WHERE user_id = $1 AND status = 'provisioning' AND issuer_card_id IS NOT NULL", [userID])).rows[0];
    if (!pending) return;
    const now = this.now().getTime();
    if (now - (this.refreshedAt.get(pending.id) ?? 0) < PROVISIONING_REFRESH_MS) return;
    this.refreshedAt.set(pending.id, now);
    let result: ProvisionResult;
    try { result = await this.issuer.refresh(pending.issuer_card_id); } catch { return; } // Still preparing as far as the user can tell.
    if (!result.lastFour && !result.failed) return;
    await this.db.transaction(async tx => {
      const row = (await tx.query<{ status: CardStatus }>('SELECT status FROM cards WHERE id = $1 FOR UPDATE', [pending.id])).rows[0];
      if (row?.status !== 'provisioning') return;
      if (result.lastFour) await this.activate(tx, pending.id, userID, result.lastFour);
      else {
        await tx.query("UPDATE cards SET status = 'closed' WHERE id = $1", [pending.id]);
        await tx.query(`INSERT INTO card_state_events (id, card_id, previous_status, next_status, actor_user_id, occurred_at)
          VALUES ($1,$2,'provisioning','closed',$3,$4)`, [randomUUID(), pending.id, userID, this.now().toISOString()]);
      }
      await recordUserEvent(tx, userID, 'card', pending.id, this.now());
    });
    this.refreshedAt.delete(pending.id);
  }

  private readonly balanceCheckedAt = new Map<string, number>();

  /**
   * Cards of an issuer that is spent outside this API (IZIPAY): the issuer's balance is the truth. A lower
   * balance is recorded as completed card purchases, a higher one as a refund, so the shown balance and the
   * history always match the issuer. Skipped while a refill is being verified or loaded, which would otherwise
   * look like a difference. Throttled per card; an unreachable issuer leaves the last known balance.
   */
  async syncIssuerBalance(userID: string): Promise<void> {
    if (!this.issuer.cardBalanceCents) return;
    const card = (await this.db.query<{ id: string; issuer_card_id: string }>(`SELECT id, issuer_card_id FROM cards WHERE user_id = $1
      AND issuer_mode = 'izipay' AND issuer_card_id IS NOT NULL AND status IN ('active', 'frozen_by_user', 'frozen_by_risk_rule')`, [userID])).rows[0];
    if (!card) return;
    const started = this.now();
    if (started.getTime() - (this.balanceCheckedAt.get(card.id) ?? 0) < ISSUER_BALANCE_REFRESH_MS) return;
    this.balanceCheckedAt.set(card.id, started.getTime());
    const refillInFlight = (tx: SQLConnection) => tx.query(`SELECT 1 FROM top_up_intents WHERE card_id = $1
      AND (status IN ('submitted', 'confirming', 'funding_pending') OR credited_at > $2) LIMIT 1`, [card.id, started.toISOString()]);
    if ((await refillInFlight(this.db)).rows.length) return;
    let issuerCents: bigint;
    try { issuerCents = await this.issuer.cardBalanceCents(card.issuer_card_id); } catch { return; }
    await this.db.transaction(async tx => {
      await tx.query('SELECT id FROM cards WHERE id = $1 FOR UPDATE', [card.id]);
      if ((await refillInFlight(tx)).rows.length) return;
      const sums = (await tx.query<{ total: string }>(`SELECT (coalesce(sum(available_delta_cents), 0) + coalesce(sum(held_delta_cents), 0))::text AS total
        FROM ledger_entries WHERE card_id = $1`, [card.id])).rows[0]!;
      const difference = issuerCents - BigInt(sums.total);
      if (difference === 0n) return;
      const now = this.now();
      const key = `issuer_balance:${now.getTime()}`;
      if (difference < 0n) {
        const amount = (-difference).toString();
        const authorization = randomUUID();
        await tx.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at)
          VALUES ($1,$2,$3,'authorization','held',$4,$5,$4,'Card purchases',$6)`, [authorization, card.id, `${key}:authorization`, amount, `-${amount}`, now.toISOString()]);
        await tx.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at, parent_id)
          VALUES ($1,$2,$3,'capture','completed',$4,0,$5,'Card purchases',$6,$7)`, [randomUUID(), card.id, `${key}:capture`, amount, `-${amount}`, now.toISOString(), authorization]);
      } else {
        await tx.query(`INSERT INTO ledger_entries (id, card_id, source_key, kind, status, amount_cents, available_delta_cents, held_delta_cents, title, occurred_at)
          VALUES ($1,$2,$3,'refund','credited',$4,$4,0,'Card refund',$5)`, [randomUUID(), card.id, key, difference.toString(), now.toISOString()]);
      }
      await recordUserEvent(tx, userID, 'history', card.id, now);
      await recordUserEvent(tx, userID, 'card', card.id, now);
    });
  }

  private async activate(tx: SQLConnection, cardID: string, userID: string, lastFour: string) {
    if (!/^[0-9]{4}$/.test(lastFour)) throw new APIProblem(502, 'card_issue_failed', 'The card issuer returned an invalid card.');
    await tx.query("UPDATE cards SET status = 'active', last_four = $2 WHERE id = $1", [cardID, lastFour]);
    await tx.query('INSERT INTO card_state_events (id, card_id, previous_status, next_status, actor_user_id) VALUES ($1,$2,$3,$4,$5)',
      [randomUUID(), cardID, 'provisioning', 'active', userID]);
  }

  /** Issuer outages surface as a retryable 503 without the partner's error details. */
  private async issuerCall<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      if (error instanceof APIProblem) throw error;
      throw new APIProblem(503, 'issuer_unavailable', 'The card issuer is temporarily unavailable. Try again later.');
    }
  }

  async changeFreeze(userID: string, cardID: string, key: string, freeze: boolean): Promise<CardResponse> {
    return this.mutation(userID, key, `POST:/v1/cards/${cardID}/${freeze ? 'freeze' : 'unfreeze'}`, async tx => {
      const row = await this.lockOwnCard(tx, userID, cardID);
      // IZIPAY has no freeze operation: a pause stored only here would show "paused" while the card still pays.
      if (row.issuer_mode === 'izipay') {
        throw new APIProblem(409, 'freeze_unavailable', 'This card cannot be paused from the app yet.');
      }
      // A user freeze and an automatic rule pause can be lifted here; a risk block, closure or replacement cannot.
      if (!['active', 'frozen_by_user', 'frozen_by_risk_rule'].includes(row.status)) {
        throw new APIProblem(409, 'card_state_conflict', 'Only a user freeze or an automatic pause can be changed here.');
      }
      const nextStatus = freeze ? (row.status === 'active' ? 'frozen_by_user' : row.status) : 'active';
      if (row.status !== nextStatus) {
        const reason = row.status === 'frozen_by_risk_rule' ? 'user_resumed_after_rule' : null;
        await tx.query('UPDATE cards SET status = $1 WHERE id = $2', [nextStatus, cardID]);
        await tx.query(`INSERT INTO card_state_events (id, card_id, previous_status, next_status, actor_user_id, reason, occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7)`, [randomUUID(), cardID, row.status, nextStatus, userID, reason, this.now().toISOString()]);
        await recordUserEvent(tx, userID, 'card', cardID, this.now());
        if (reason) await recordUserEvent(tx, userID, 'history', cardID, this.now());
      }
      return this.getCard(userID, tx);
    });
  }

  /** Short-lived details (synthetic for DemoIssuer). Rate limited per card; blocked or closed cards reveal nothing. */
  async revealCredentials(userID: string, cardID: string): Promise<CredentialsResponse> {
    return this.db.transaction(async tx => {
      const row = await this.lockOwnCard(tx, userID, cardID);
      if (!['active', 'frozen_by_user', 'frozen_by_risk_rule'].includes(row.status)) {
        throw new APIProblem(409, 'card_state_conflict', 'Card details are unavailable for this card.');
      }
      const now = this.now();
      const recent = await tx.query<{ count: string }>('SELECT count(*)::text AS count FROM card_credential_reveals WHERE card_id = $1 AND revealed_at > $2',
        [cardID, new Date(now.getTime() - 3600_000).toISOString()]);
      if (Number(recent.rows[0]?.count ?? 0) >= CREDENTIAL_REVEALS_PER_HOUR) {
        throw new APIProblem(429, 'too_many_reveals', 'Card details were shown too often. Try again later.');
      }
      const expires = new Date(now.getTime() + CREDENTIALS_TTL_MS);
      await tx.query('INSERT INTO card_credential_reveals (id, card_id, revealed_at, expires_at) VALUES ($1,$2,$3,$4)',
        [randomUUID(), cardID, now.toISOString(), expires.toISOString()]);
      const details = await this.issuerCall(() => this.issuer.credentials({ id: cardID, lastFour: row.last_four, issuerCardId: row.issuer_card_id }));
      return { ...details, expires_at: expires.toISOString() };
    });
  }

  async limitsFor(userID: string): Promise<LimitsResponse> {
    const configured = this.limits.publicValues();
    const card = (await this.getCard(userID)).card;
    const usage = card ? await this.limits.usage(this.db, card.id, this.now())
      : { monthly_top_up_cents: '0', daily_spend_cents: '0', monthly_spend_cents: '0',
          top_ups_last_hour: 0, top_ups_last_day: 0, purchases_last_hour: 0, purchases_last_day: 0 };
    return { limits: configured, spend_limits_enforced: card?.issuer_mode !== 'izipay', usage };
  }

  async history(userID: string, cursor: string | undefined, limit = 20): Promise<HistoryResponse> {
    // Money entries plus system card-status changes (automatic pauses and their release), newest first.
    const items = `WITH items AS (
      SELECT l.id, l.kind, l.status, l.amount_cents::text AS amount_cents, l.title, l.occurred_at, l.parent_id, l.merchant,
        l.network, l.transaction_hash,
        CASE WHEN l.kind <> 'authorization' THEN l.status
          WHEN EXISTS (SELECT 1 FROM ledger_entries c WHERE c.parent_id = l.id AND c.kind = 'capture') THEN 'completed'
          WHEN EXISTS (SELECT 1 FROM ledger_entries c WHERE c.parent_id = l.id AND c.kind = 'reversal') THEN 'reversed'
          ELSE 'held' END AS current_status
      FROM ledger_entries l JOIN cards c ON c.id = l.card_id WHERE c.user_id = $1
      UNION ALL
      SELECT e.id, 'card_status', CASE WHEN e.next_status = 'frozen_by_risk_rule' THEN 'paused' ELSE 'resumed' END, '0',
        CASE e.reason
          WHEN 'rule_max_top_up_series' THEN 'Card paused: several maximum top-ups in a short time'
          WHEN 'rule_drain_after_top_up' THEN 'Card paused: almost the whole balance spent right after a top-up'
          WHEN 'user_resumed_after_rule' THEN 'Card resumed by you'
          ELSE 'Card status changed' END,
        e.occurred_at, NULL, NULL, NULL, NULL, CASE WHEN e.next_status = 'frozen_by_risk_rule' THEN 'paused' ELSE 'resumed' END
      FROM card_state_events e JOIN cards c ON c.id = e.card_id WHERE c.user_id = $1 AND e.reason IS NOT NULL
    )`;
    let cursorID: string | null = null;
    if (cursor) {
      try { cursorID = Buffer.from(cursor, 'base64url').toString('utf8'); } catch { /* handled below */ }
      if (!cursorID || !UUID_PATTERN.test(cursorID)) throw new APIProblem(400, 'invalid_cursor', 'Invalid history cursor.');
      const known = await this.db.query(`${items} SELECT id FROM items WHERE id = $2::uuid`, [userID, cursorID]);
      if (!known.rows[0]) throw new APIProblem(400, 'invalid_cursor', 'Invalid history cursor.');
    }
    const result = await this.db.query<{
      id: string; kind: HistoryItem['kind']; status: HistoryItem['status']; amount_cents: string; title: string; occurred_at: unknown;
      parent_id: string | null; merchant: string | null; network: string | null; transaction_hash: string | null;
      current_status: HistoryItem['current_status'];
    }>(`${items} SELECT * FROM items
      WHERE ($2::uuid IS NULL OR (occurred_at, id) < (SELECT occurred_at, id FROM items WHERE id = $2::uuid))
      ORDER BY occurred_at DESC, id DESC LIMIT $3`, [userID, cursorID, limit + 1]);
    const page = result.rows.slice(0, limit);
    const mode = (await this.db.query<{ issuer_mode: IssuerMode }>('SELECT issuer_mode FROM cards WHERE user_id = $1', [userID])).rows[0]?.issuer_mode;
    const demonstration = mode !== 'izipay';
    const last = page.at(-1);
    return {
      items: page.map(row => ({ ...row, occurred_at: iso(row.occurred_at), currency: 'USD', demonstration })),
      next_cursor: result.rows.length > limit && last ? Buffer.from(last.id).toString('base64url') : null,
    };
  }

  /** Change signals after a sequence number; clients refetch REST state for each type. */
  async events(userID: string, after: bigint, limit = 100): Promise<EventsResponse> {
    const result = await this.db.query<{ seq: string; type: UserEventType; reference_id: string | null; occurred_at: unknown }>(
      `SELECT seq::text, type, reference_id, occurred_at FROM user_events WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
      [userID, after.toString(), limit]);
    const items = result.rows.map(row => ({ ...row, occurred_at: iso(row.occurred_at) }));
    const latest = await this.db.query<{ seq: string | null }>('SELECT max(seq)::text AS seq FROM user_events WHERE user_id = $1', [userID]);
    return { items, latest_seq: latest.rows[0]?.seq ?? '0' };
  }
}
