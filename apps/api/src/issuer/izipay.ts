import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

// HTTP client for the IZIPAY Business card API (https://izipay.me/clients/docs.php).
// Money crosses this boundary as USD decimals in JSON; inside the API it is always integer cents.
// Card numbers and CVV returned by the issuer are passed through to the caller and never logged here.

export class IzipayError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.name = 'IzipayError'; this.status = status; this.code = code; }
}

export interface IzipayCard {
  cardId: string;
  issueStatus: string;
  lastFour?: string;
  balanceCents?: bigint;
  pendingTopUpCents?: bigint;
  isFrozen?: boolean;
  /** Present only once issue_status is "issued". */
  details?: { number: string; expiry: string; cvv: string };
}

export interface IzipayTopUp {
  topUpId: string;
  cardId: string;
  status: string;
  amountCents: bigint;
  onCardCents?: bigint;
}

export interface IzipayOptions {
  apiKey: string;
  /** izps_… request-signing secret; when set every request carries X-Timestamp and X-Signature. */
  signingSecret?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

const DOLLARS = /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,2})?$/;

/** "97.02" → 9702n. Exact; rejects more than two decimals, signs and exponents. */
export function dollarsToCents(source: string): bigint {
  const match = DOLLARS.exec(source);
  if (!match) throw new IzipayError(502, 'invalid_amount', `Unexpected amount from the card issuer: ${source}`);
  return BigInt(match[1]!) * 100n + BigInt((match[2] ?? '.').slice(1).padEnd(2, '0'));
}

/** 9702n → "97.02", written into the JSON body as a bare number. */
export function centsToDollars(cents: bigint): string {
  if (cents <= 0n) throw new Error('Amount must be positive.');
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
}

/** JSON.parse that keeps every number as its exact source text. */
function parseExact(text: string): unknown {
  return JSON.parse(text, (_key, value, context?: { source?: string }) =>
    typeof value === 'number' && context?.source !== undefined ? context.source : value);
}

const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
const cents = (value: unknown) => (typeof value === 'string' ? dollarsToCents(value) : undefined);

export class IzipayClient {
  private readonly baseUrl: string;
  private readonly http: typeof fetch;
  private readonly now: () => number;
  private readonly options: IzipayOptions;

  constructor(options: IzipayOptions) {
    this.options = options;
    if (!/^izpk_(test|live)_[A-Za-z0-9_-]+$/.test(options.apiKey)) throw new Error('IZIPAY_API_KEY has an unexpected format.');
    this.baseUrl = (options.baseUrl ?? 'https://izipay.me/api/v1').replace(/\/$/, '');
    this.http = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
  }

  get isSandbox() { return this.options.apiKey.startsWith('izpk_test_'); }

  async issueCard(input: { email: string; alias?: string; reference: string; idempotencyKey: string; cardType?: string }): Promise<IzipayCard> {
    const data = await this.request('POST', '/cards/issue', {
      body: `{"cardholder_email":${JSON.stringify(input.email)},"client_card_ref":${JSON.stringify(input.reference)}` +
        `${input.alias ? `,"cardholder_alias":${JSON.stringify(input.alias)}` : ''}` +
        `,"card_type":${JSON.stringify(input.cardType ?? 'visa')},"pay_currency":"balance"}`,
      idempotencyKey: input.idempotencyKey,
    });
    return this.card(data);
  }

  async getCard(cardId: string, live = false): Promise<IzipayCard> {
    return this.card(await this.request('GET', `/cards/${encodeURIComponent(cardId)}${live ? '?live=1' : ''}`));
  }

  /** Finds a card by our client_card_ref, newest pages last. Used to adopt a card whose issue response was lost. */
  async findCardByReference(reference: string): Promise<IzipayCard | undefined> {
    for (let page = 1; page <= 20; page++) {
      const data = await this.request('GET', `/cards?page=${page}&limit=500`);
      const cards = Array.isArray(data.cards) ? (data.cards as Record<string, unknown>[]) : [];
      const match = cards.find(card => card.client_card_ref === reference);
      if (match) return this.card(match);
      const totalPages = Number(data.total_pages ?? 1);
      if (!Number.isFinite(totalPages) || page >= totalPages) return undefined;
    }
    throw new IzipayError(502, 'too_many_cards', 'Card lookup by reference exceeded the page budget.');
  }

  /** Instant top-up paid from the account balance. Retrying with the same key never credits twice. */
  async topUpFromBalance(input: { cardId: string; amountCents: bigint; idempotencyKey: string }): Promise<IzipayTopUp> {
    const data = await this.request('POST', `/cards/${encodeURIComponent(input.cardId)}/topup`, {
      body: `{"amount":${centsToDollars(input.amountCents)},"pay_currency":"balance"}`,
      idempotencyKey: input.idempotencyKey,
    });
    return this.topUp(data);
  }

  async getTopUp(topUpId: string): Promise<IzipayTopUp> {
    return this.topUp(await this.request('GET', `/topups/${encodeURIComponent(topUpId)}`));
  }

  /** Account balance that pays for card issuance and top-ups. */
  async getBalance(): Promise<bigint> {
    const data = await this.request('GET', '/balance');
    const account = (data.account_balance && typeof data.account_balance === 'object' ? data.account_balance : {}) as Record<string, unknown>;
    const balance = cents(account.balance_usd);
    if (balance === undefined) throw new IzipayError(502, 'invalid_response', 'The card issuer did not report the account balance.');
    return balance;
  }

  /** Moves card funds back to the account balance (1:1, no fee). */
  async returnFunds(input: { cardId: string; amountCents: bigint; idempotencyKey: string }): Promise<{ returnedCents: bigint; cardBalanceCents?: bigint }> {
    const data = await this.request('POST', `/cards/${encodeURIComponent(input.cardId)}/return`, {
      body: `{"amount":${centsToDollars(input.amountCents)}}`,
      idempotencyKey: input.idempotencyKey,
    });
    const returned = cents(data.amount_returned);
    if (returned === undefined) throw new IzipayError(502, 'invalid_response', 'The card issuer did not report the returned amount.');
    return { returnedCents: returned, cardBalanceCents: cents(data.card_balance) };
  }

  private card(data: Record<string, unknown>): IzipayCard {
    const nested = (data.card && typeof data.card === 'object' ? data.card : {}) as Record<string, unknown>;
    const cardId = str(data.card_id);
    const issueStatus = str(data.issue_status);
    if (!cardId || !issueStatus) throw new IzipayError(502, 'invalid_response', 'The card issuer returned an incomplete card.');
    const number = str(nested.number), expiry = str(nested.exp), cvv = str(nested.cvv);
    const lastFour = str(nested.last4) ?? str(data.last4);
    return {
      cardId, issueStatus,
      lastFour: lastFour && /^[0-9]{4}$/.test(lastFour) ? lastFour : undefined,
      balanceCents: cents(nested.balance ?? data.balance),
      pendingTopUpCents: cents(nested.pending_topup ?? data.pending_topup),
      isFrozen: typeof (nested.is_frozen ?? data.is_frozen) === 'boolean' ? Boolean(nested.is_frozen ?? data.is_frozen) : undefined,
      details: issueStatus === 'issued' && number && expiry && cvv && !number.includes('*') ? { number, expiry, cvv } : undefined,
    };
  }

  private topUp(data: Record<string, unknown>): IzipayTopUp {
    const topUpId = str(data.topup_id), cardId = str(data.card_id), status = str(data.status), amount = cents(data.amount_usd ?? data.amount);
    if (!topUpId || !cardId || !status || amount === undefined) throw new IzipayError(502, 'invalid_response', 'The card issuer returned an incomplete top-up.');
    return { topUpId, cardId, status, amountCents: amount, onCardCents: cents(data.amount_on_card) };
  }

  private async request(method: 'GET' | 'POST', path: string, init: { body?: string; idempotencyKey?: string } = {}): Promise<Record<string, unknown>> {
    const url = new URL(`${this.baseUrl}${path}`);
    const body = init.body ?? '';
    const headers: Record<string, string> = { authorization: `Bearer ${this.options.apiKey}`, accept: 'application/json' };
    if (init.body !== undefined) headers['content-type'] = 'application/json';
    if (method === 'POST') headers['x-idempotency-key'] = init.idempotencyKey ?? randomUUID();
    if (this.options.signingSecret) {
      const timestamp = String(Math.floor(this.now() / 1000));
      headers['x-timestamp'] = timestamp;
      headers['x-signature'] = createHmac('sha256', this.options.signingSecret)
        .update(`${timestamp}\n${method}\n${url.pathname}${url.search}\n${body}`).digest('hex');
    }
    const response = await this.http(url, {
      method, headers, body: init.body, signal: AbortSignal.timeout(this.options.timeoutMs ?? 20_000),
    });
    const text = await response.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = (text ? parseExact(text) : {}) as Record<string, unknown>; } catch { /* non-JSON error page */ }
    if (!response.ok || parsed.success !== true) {
      const error = (parsed.error && typeof parsed.error === 'object' ? parsed.error : parsed) as Record<string, unknown>;
      const code = str(error.code) ?? `http_${response.status}`;
      throw new IzipayError(response.status, code, `Card issuer request ${method} ${url.pathname} failed: ${code}`);
    }
    if (!parsed.data || typeof parsed.data !== 'object') throw new IzipayError(502, 'invalid_response', 'The card issuer returned no data.');
    return parsed.data as Record<string, unknown>;
  }
}

/** Checks the x-izipay-signature header: hex HMAC-SHA256 of the raw request body. */
export function verifyIzipayWebhook(rawBody: string | Buffer, signature: unknown, secret: string): boolean {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature) || !secret) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
