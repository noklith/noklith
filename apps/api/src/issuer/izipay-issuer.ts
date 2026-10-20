import { createHash } from 'node:crypto';
import type { CardCredentials, CardIssuerAdapter, FundingRequest, ProvisionResult } from './issuer.ts';
import { CardLockedByIssuerError, IssuerUnavailableError } from './issuer.ts';
import { IzipayError } from './izipay.ts';
import type { IzipayCard, IzipayClient } from './izipay.ts';

export interface IzipayIssuerOptions {
  client: IzipayClient;
  /** Domain for per-card cardholder addresses; wallet users have no e-mail of their own. */
  cardholderEmailDomain: string;
  cardType?: string;
  /** IZIPAY's top-up fee for the quote estimate: percent in basis points plus a fixed network fee. */
  topUpFeeBps?: bigint;
  topUpFixedFeeCents?: bigint;
}

const FAILED = new Set(['failed', 'cancelled', 'expired']);

/**
 * IZIPAY Business as the card issuer. Cards are paid from the operator's IZIPAY balance and keyed by
 * our user ID (client_card_ref, one card per user), so a lost response or a rolled-back transaction
 * adopts the existing card instead of buying a second one.
 */
export class IzipayIssuer implements CardIssuerAdapter {
  readonly mode = 'izipay' as const;
  private readonly client: IzipayClient;
  private readonly emailDomain: string;
  private readonly cardType: string;
  private readonly feeBps: bigint;
  private readonly fixedFeeCents: bigint;

  constructor(options: IzipayIssuerOptions) {
    if (!/^(?=.{3,120}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(options.cardholderEmailDomain)) throw new Error('IZIPAY_CARDHOLDER_EMAIL_DOMAIN must be a domain name.');
    this.client = options.client;
    this.emailDomain = options.cardholderEmailDomain;
    this.cardType = options.cardType ?? 'visa';
    // Observed in the sandbox: $5.00 from the balance put $3.15 on the card (3% and $1.70).
    this.feeBps = options.topUpFeeBps ?? 300n;
    this.fixedFeeCents = options.topUpFixedFeeCents ?? 170n;
  }

  async provision(input: { cardId: string; userId: string }): Promise<ProvisionResult> {
    const existing = await this.client.findCardByReference(input.userId);
    const card = existing && !FAILED.has(existing.issueStatus) ? existing : await this.client.issueCard({
      email: `card-${input.cardId}@${this.emailDomain}`,
      alias: `Card ${input.cardId.slice(0, 8)}`,
      reference: input.userId,
      // Stable per user: a retry inside IZIPAY's idempotency window replays the first answer.
      idempotencyKey: `card-${createHash('sha256').update(input.userId).digest('hex').slice(0, 32)}`,
      cardType: this.cardType,
    });
    // The issue answer may omit the card block; one read fetches the last four digits.
    if (card.issueStatus === 'issued' && !card.lastFour) return this.result(await this.client.getCard(card.cardId));
    return this.result(card);
  }

  async refresh(issuerCardId: string): Promise<ProvisionResult> {
    return this.result(await this.client.getCard(issuerCardId));
  }

  async credentials(card: { issuerCardId: string | null }): Promise<CardCredentials> {
    if (!card.issuerCardId) throw new IssuerUnavailableError('The card is not issued yet.');
    const details = (await this.client.getCard(card.issuerCardId)).details;
    const pan = details?.number.replace(/[\s-]/g, '') ?? '';
    const expiry = details?.expiry.match(/^(0[1-9]|1[0-2])\/([0-9]{2}|[0-9]{4})$/);
    if (!details || !/^[0-9]{12,19}$/.test(pan) || !expiry || !/^[0-9]{3,4}$/.test(details.cvv)) {
      throw new IssuerUnavailableError('The card issuer did not return card details.');
    }
    const year = Number(expiry[2]);
    return { pan, expiry_month: Number(expiry[1]), expiry_year: year < 100 ? 2000 + year : year, cvv: details.cvv, demonstration: false };
  }

  /**
   * Top-ups are always paid from the operator's IZIPAY balance (confirmed by IZIPAY support, 2026-10-15).
   * The idempotency key comes from our reference, so a retry replays the first top-up instead of paying twice;
   * the replay is then re-read for its current status. Only a credited top-up counts.
   */
  async fund(input: FundingRequest): Promise<{ issuerReference: string; creditedCents: bigint }> {
    if (!input.issuerCardId) throw new IssuerUnavailableError('The card is not issued yet.');
    let topUp = await this.client.topUpFromBalance({ cardId: input.issuerCardId, amountCents: input.amountCents,
      idempotencyKey: `topup-${createHash('sha256').update(input.reference).digest('hex').slice(0, 32)}` });
    if (topUp.status !== 'credited') topUp = await this.client.getTopUp(topUp.topUpId);
    if (topUp.status !== 'credited' || !topUp.onCardCents || topUp.onCardCents <= 0n) {
      throw new IssuerUnavailableError(`The card issuer reports the top-up as ${topUp.status}.`);
    }
    return { issuerReference: topUp.topUpId, creditedCents: topUp.onCardCents };
  }

  fundingCapacityCents(): Promise<bigint> { return this.client.getBalance(); }

  async cardBalanceCents(issuerCardId: string): Promise<bigint> {
    const balance = (await this.client.getCard(issuerCardId, true)).balanceCents;
    if (balance === undefined) throw new IssuerUnavailableError('The card issuer did not report the card balance.');
    return balance;
  }

  /** IZIPAY answers 403 CARD_LOCKED_BY_SUPPORT on unfreeze when it froze the card itself. */
  async setFrozen(issuerCardId: string, frozen: boolean): Promise<void> {
    try { await this.client.setFrozen(issuerCardId, frozen); }
    catch (error) {
      if (error instanceof IzipayError && error.code === 'CARD_LOCKED_BY_SUPPORT') throw new CardLockedByIssuerError();
      throw error;
    }
  }

  topUpFeeCents(amountCents: bigint): bigint {
    return (amountCents * this.feeBps + 9_999n) / 10_000n + this.fixedFeeCents;
  }

  signNotification(): string { throw new Error('IZIPAY notifications are not handled by the DemoIssuer endpoint.'); }
  verifyNotification(): boolean { return false; }

  private result(card: IzipayCard): ProvisionResult {
    if (card.issueStatus === 'issued' && card.lastFour) return { issuerCardId: card.cardId, lastFour: card.lastFour };
    return { issuerCardId: card.cardId, failed: FAILED.has(card.issueStatus) };
  }
}

