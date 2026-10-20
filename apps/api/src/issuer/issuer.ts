import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Synthetic, non-payable test details. Derived on demand; never persisted. */
export interface TestCredentials {
  pan: string;
  expiry_month: number;
  expiry_year: number;
  cvv: string;
}
export class IssuerUnavailableError extends Error {
  constructor(message = 'The card issuer did not accept the funding request.') { super(message); this.name = 'IssuerUnavailableError'; }
}

/** Card details for the owner's eyes only. Fetched on demand; never persisted or logged. */
export interface CardCredentials extends TestCredentials {
  /** True for DemoIssuer details that cannot pay anywhere. */
  demonstration: boolean;
}

export interface FundingRequest { cardId: string; issuerCardId: string | null; reference: string; amountCents: bigint }

/** Issuer answer for a new card. Without lastFour the issuer is still preparing it. */
export interface ProvisionResult {
  lastFour?: string;
  issuerCardId?: string;
  failed?: boolean;
}

/**
 * Boundary for a card program: DemoIssuer (stub) or a partner implementing the same operations
 * through its documented API.
 */
export interface CardIssuerAdapter {
  readonly mode: 'demo' | 'izipay';
  /** Requests a card. Must be safe to repeat for the same card ID. */
  provision(input: { cardId: string; userId: string }): Promise<ProvisionResult>;
  /** Re-reads a card the issuer is still preparing. */
  refresh(issuerCardId: string): Promise<ProvisionResult>;
  /** Short-lived details for display only. */
  credentials(card: { id: string; lastFour: string; issuerCardId: string | null }): Promise<CardCredentials>;
  /**
   * Load a verified amount onto the card. Must be idempotent per reference. creditedCents is what reached
   * the card after the issuer's own fee; it equals amountCents when the issuer charges none.
   */
  fund(input: FundingRequest): Promise<{ issuerReference: string; creditedCents: bigint }>;
  /**
   * Money the issuer can still load onto cards, when top-ups are paid from a prefunded operator balance.
   * Undefined when the issuer has no such limit.
   */
  fundingCapacityCents?(): Promise<bigint>;
  /**
   * Money on the card as the issuer reports it, for issuers whose cards are spent outside this API
   * (IZIPAY). Undefined when purchases are reported to this API instead (DemoIssuer).
   */
  cardBalanceCents?(issuerCardId: string): Promise<bigint>;
  /** Issuer fee the card should expect for a top-up of this size, for the quote. The issuer's answer is authoritative. */
  topUpFeeCents(amountCents: bigint): bigint;
  /** Notification signature for the DemoIssuer webhook endpoint. */
  signNotification(body: string, timestamp: number): string;
  verifyNotification(body: string, timestamp: number, signature: string): boolean;
}

const digits = (seed: string, count: number) => {
  let out = '';
  for (let round = 0; out.length < count; round++) {
    for (const byte of createHash('sha256').update(`${seed}:${round}`).digest()) {
      if (byte < 250) out += String(byte % 10); // Rejection sampling avoids a digit bias.
      if (out.length === count) break;
    }
  }
  return out;
};

/**
 * DemoIssuer: no card network, no real money. The 9999 prefix is not an issued card BIN,
 * so displayed details cannot be used for a payment.
 */
export class DemoIssuer implements CardIssuerAdapter {
  readonly mode = 'demo' as const;
  private readonly webhookKey: Buffer;
  private readonly fundingFailure: (reference: string) => boolean;
  private readonly funded = new Map<string, string>();

  constructor(options: { webhookSecret?: string; fundingFailure?: (reference: string) => boolean } = {}) {
    if (options.webhookSecret !== undefined && options.webhookSecret.length < 32) {
      throw new Error('DEMO_ISSUER_WEBHOOK_SECRET must contain at least 32 characters.');
    }
    // Without configuration the key is per-process: external notifications cannot be forged or replayed.
    this.webhookKey = options.webhookSecret ? Buffer.from(options.webhookSecret, 'utf8') : randomBytes(32);
    this.fundingFailure = options.fundingFailure ?? (() => false);
  }

  async provision(input: { cardId: string }) { return { lastFour: digits(`demo-issuer:last-four:${input.cardId}`, 4) }; }

  async refresh(): Promise<ProvisionResult> { throw new Error('DemoIssuer cards are issued immediately.'); }

  async credentials(card: { id: string; lastFour: string }): Promise<CardCredentials> {
    return { ...this.testCredentials(card.id, card.lastFour), demonstration: true };
  }

  testCredentials(cardId: string, lastFour: string): TestCredentials {
    if (!/^[0-9]{4}$/.test(lastFour)) throw new Error('Invalid stored last four digits.');
    const seed = `demo-issuer:credentials:${cardId}`;
    const month = Number(digits(`${seed}:month`, 2)) % 12 + 1;
    return { pan: `9999${digits(`${seed}:pan`, 8)}${lastFour}`, expiry_month: month, expiry_year: 2029, cvv: digits(`${seed}:cvv`, 3) };
  }

  async fund(input: FundingRequest) {
    if (input.amountCents <= 0n) throw new Error('Funding amount must be positive.');
    const existing = this.funded.get(input.reference);
    if (existing) return { issuerReference: existing, creditedCents: input.amountCents };
    if (this.fundingFailure(input.reference)) throw new IssuerUnavailableError();
    const issuerReference = `demo_${createHash('sha256').update(input.reference).digest('hex').slice(0, 24)}`;
    this.funded.set(input.reference, issuerReference);
    return { issuerReference, creditedCents: input.amountCents };
  }

  topUpFeeCents(): bigint { return 0n; }

  signNotification(body: string, timestamp: number) {
    return createHmac('sha256', this.webhookKey).update(`${timestamp}.${body}`).digest('hex');
  }

  verifyNotification(body: string, timestamp: number, signature: string) {
    if (!/^[0-9a-f]{64}$/.test(signature)) return false;
    return timingSafeEqual(Buffer.from(this.signNotification(body, timestamp), 'hex'), Buffer.from(signature, 'hex'));
  }
}
