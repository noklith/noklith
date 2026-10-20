import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import PostalMime from 'postal-mime';
import type { PaymentCodeResponse } from '../../../../packages/api-contracts/src/index.ts';
import type { Database } from '../database.ts';
import { APIProblem } from '../errors.ts';
import { recordUserEvent } from '../service.ts';

export const CARD_MAIL_TOLERANCE_MS = 5 * 60_000;
export const PAYMENT_CODE_TTL_MS = 10 * 60_000;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// A code named as such: "code", "OTP", "passcode", "verification", "код" and up to 40 other characters before it.
const NAMED_CODE = /(?:code|otp|passcode|password|verification|код)[^0-9]{0,40}?\b([0-9]{4,8})\b/i;

/** Text of the message for code search: subject first, then the plain part, else the HTML part without tags. */
function searchableText(subject: string, text: string | undefined, html: string | undefined): string {
  const body = text?.trim() ? text : (html ?? '').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ');
  return `${subject}\n${body}`.replace(/\s+/g, ' ');
}

/** The one-time code in an issuer message, or undefined when there is none or it is ambiguous. */
export function extractPaymentCode(subject: string, text?: string, html?: string): string | undefined {
  const content = searchableText(subject, text, html);
  const named = NAMED_CODE.exec(content);
  if (named) return named[1];
  // Without a label, accept only a single stand-alone six-digit number (not part of an amount like 1,234.56).
  const sixes = [...new Set(content.match(/(?<![0-9]|[0-9][.,])[0-9]{6}(?![0-9]|[.,][0-9])/g) ?? [])];
  return sixes.length === 1 ? sixes[0] : undefined;
}

/**
 * Cardholder mail for IZIPAY cards. A Cloudflare Email Routing worker posts each raw message for
 * card-<card id>@<domain>, signed with HMAC-SHA256 over "<unix seconds>.<raw message>". Only the code is
 * kept, for PAYMENT_CODE_TTL_MS, and shown to the card's owner.
 */
export class CardMailService {
  private readonly db: Database;
  private readonly secret: string;
  private readonly recipient: RegExp;
  private readonly now: () => Date;

  constructor(options: { db: Database; secret: string; domain: string; now?: () => Date }) {
    if (options.secret.length < 32) throw new Error('CARD_MAIL_SECRET must have at least 32 characters.');
    this.db = options.db;
    this.secret = options.secret;
    this.recipient = new RegExp(`^card-(${UUID})@${options.domain.replace(/\./g, '\\.')}$`, 'i');
    this.now = options.now ?? (() => new Date());
  }

  /** Worker entry point. Answers whether a code was stored; an unknown card or a message without a code is not an error. */
  async receive(raw: Buffer, recipientHeader: unknown, timestampHeader: unknown, signatureHeader: unknown): Promise<{ stored: boolean }> {
    const timestamp = typeof timestampHeader === 'string' && /^[0-9]{10}$/.test(timestampHeader) ? Number(timestampHeader) : NaN;
    const signature = typeof signatureHeader === 'string' && /^[0-9a-f]{64}$/i.test(signatureHeader) ? Buffer.from(signatureHeader, 'hex') : undefined;
    const expected = createHmac('sha256', this.secret).update(`${timestampHeader}.`).update(raw).digest();
    if (!signature || !timingSafeEqual(signature, expected)) throw new APIProblem(401, 'invalid_signature', 'The message signature is not valid.');
    if (!Number.isFinite(timestamp) || Math.abs(this.now().getTime() - timestamp * 1000) > CARD_MAIL_TOLERANCE_MS) {
      throw new APIProblem(401, 'stale_message', 'The message timestamp is outside the accepted window.');
    }
    const cardID = typeof recipientHeader === 'string' ? this.recipient.exec(recipientHeader.trim())?.[1]?.toLowerCase() : undefined;
    if (!cardID) return { stored: false };
    const mail = await PostalMime.parse(raw);
    const code = extractPaymentCode(mail.subject ?? '', mail.text, mail.html);
    if (!code) return { stored: false };
    return this.db.transaction(async tx => {
      const card = (await tx.query<{ user_id: string }>("SELECT user_id FROM cards WHERE id = $1 AND issuer_mode = 'izipay'", [cardID])).rows[0];
      if (!card) return { stored: false };
      const now = this.now();
      await tx.query('DELETE FROM card_payment_codes WHERE expires_at <= $1', [now.toISOString()]);
      await tx.query('INSERT INTO card_payment_codes (id, card_id, code, received_at, expires_at) VALUES ($1,$2,$3,$4,$5)',
        [randomUUID(), cardID, code, now.toISOString(), new Date(now.getTime() + PAYMENT_CODE_TTL_MS).toISOString()]);
      await recordUserEvent(tx, card.user_id, 'card', cardID, now);
      return { stored: true };
    });
  }

  /** The newest code that has not expired, for the card's owner only. */
  async latest(userID: string, cardID: string): Promise<PaymentCodeResponse> {
    if (!new RegExp(`^${UUID}$`).test(cardID)) throw new APIProblem(404, 'card_not_found', 'Card not found.');
    const owned = await this.db.query('SELECT 1 FROM cards WHERE id = $1 AND user_id = $2', [cardID, userID]);
    if (!owned.rows.length) throw new APIProblem(404, 'card_not_found', 'Card not found.');
    const row = (await this.db.query<{ code: string; received_at: Date | string; expires_at: Date | string }>(
      `SELECT code, received_at, expires_at FROM card_payment_codes WHERE card_id = $1 AND expires_at > $2
       ORDER BY received_at DESC LIMIT 1`, [cardID, this.now().toISOString()])).rows[0];
    return { payment_code: row ? { code: row.code, received_at: new Date(row.received_at).toISOString(), expires_at: new Date(row.expires_at).toISOString() } : null };
  }
}
