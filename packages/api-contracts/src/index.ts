/** Wire contract v1. Money is always an integer string, never a JSON number. */
export type CardStatus = 'provisioning' | 'active' | 'frozen_by_user' | 'frozen_by_risk_rule' | 'blocked_by_risk' | 'closed' | 'replaced';
export type NetworkMode = 'fixture' | 'testnet' | 'mainnet';
/** demo: DemoIssuer stub, nothing is payable. izipay: cards issued by IZIPAY Business. */
export type IssuerMode = 'demo' | 'izipay';
export type FixtureProfile = 'standard' | 'empty' | 'risk';
export interface Card {
  id: string;
  status: CardStatus;
  currency: 'USD';
  last_four: string;
  available_cents: string;
  held_cents: string;
  issuer_mode: IssuerMode;
}
export interface CardResponse { card: Card | null }
export interface HistoryItem {
  id: string;
  /** card_status: an automatic pause or its release (amount 0, no money moved). */
  kind: 'top_up' | 'authorization' | 'capture' | 'reversal' | 'refund' | 'card_status';
  status: 'credited' | 'held' | 'completed' | 'reversed' | 'paused' | 'resumed';
  amount_cents: string;
  currency: 'USD';
  title: string;
  occurred_at: string;
  /** Purchase entries reference their authorization; top-ups have no parent. */
  parent_id: string | null;
  merchant: string | null;
  /** For authorizations: held until captured (completed) or released (reversed). Other entries repeat status. */
  current_status: 'credited' | 'held' | 'completed' | 'reversed' | 'paused' | 'resumed';
  /** CAIP-2 network of a verified top-up transfer, e.g. eip155:84532. */
  network: string | null;
  transaction_hash: string | null;
  demonstration: boolean;
}
export interface HistoryResponse { items: HistoryItem[]; next_cursor: string | null }
export interface User { id: string; wallet_address: null; authentication: 'fixture' }
export interface SessionResponse { access_token: string; expires_at: string; user: User }
export interface WalletUser { id: string; wallet_address: string; authentication: 'siwe'; chain_id: number }
export interface WalletSessionResponse { access_token: string; expires_at: string; user: WalletUser }
export interface AuthChallengeRequest { address: string; chain_id: number }
export interface AuthChallengeResponse { id: string; message: string; expires_at: string }
export interface AuthVerifyRequest { challenge_id: string; message: string; signature: string }
export interface WalletAuthMetadata { origin: string; uri: string; chain_ids: number[] }
export interface APIConfig {
  schema_version: 1;
  issuer_mode: IssuerMode;
  network_mode: NetworkMode;
  wallet_auth_enabled: boolean;
  wallet_auth: WalletAuthMetadata | null;
  top_up_enabled: boolean;
  networks: NetworkConfig[];
  /** False when cards come from an issuer that authorizes purchases itself (IZIPAY): spend limits do not apply. */
  spend_limits_enforced: boolean;
  limits: LimitValues;
  /** Reown (WalletConnect) project ID for the website's wallet list; public by design, null when not configured. */
  walletconnect_project_id: string | null;
}
export interface NetworkAsset { symbol: string; name: string; token_address: string; decimals: number }
export interface NetworkConfig {
  chain_id: number; caip2: string; name: string; confirmations: number; recipient_address: string; explorer_tx_url: string; assets: NetworkAsset[];
}
export type TopUpStatus = 'quoted' | 'awaiting_signature' | 'submitted' | 'confirming' | 'funding_pending' | 'credited' | 'failed' | 'cancelled' | 'expired';
export interface TopUp {
  id: string; status: TopUpStatus; failure_reason: string | null; card_id: string;
  chain_id: number; network_name: string; asset: string; asset_name: string; token_address: string; token_decimals: number;
  sender_address: string; recipient_address: string;
  /** Requested card amount; token_units is the exact on-chain amount (stablecoin 1:1, no swap). */
  amount_cents: string; token_units: string; card_amount_cents: string; minimum_card_amount_cents: string;
  service_fee_cents: string; network_fee_note: string; simulated: false;
  transaction_hash: string | null; confirmations: number; required_confirmations: number;
  created_at: string; quote_expires_at: string; submit_deadline: string; updated_at: string; credited_at: string | null;
  explorer_url: string | null;
}
export interface TopUpTransactionRequest { chain_id: number; from: string; to: string; value: '0x0'; data: string }
export interface TopUpResponse { top_up: TopUp }
export interface TopUpAcceptResponse { top_up: TopUp; transaction: TopUpTransactionRequest }
export interface TopUpListResponse { items: TopUp[] }
export interface TopUpCreateRequest { chain_id: number; asset: string; amount_cents: string }
export interface TopUpHashRequest { transaction_hash: string }
export interface WalletBalancesResponse {
  address: string;
  networks: { chain_id: number; available: boolean; native_symbol: string; native_units: string | null;
    assets: { symbol: string; decimals: number; units: string | null }[] }[];
}
export type CardEventType = 'authorization' | 'capture' | 'reversal' | 'refund';
/** DemoIssuer notification body, signed as HMAC-SHA256("<timestamp>.<raw body>"). */
export interface IssuerNotification {
  id: string; type: CardEventType; card_id: string; amount_cents: string; merchant: string | null;
  authorization_id: string | null; occurred_at: string; source?: 'demo_tool';
}
export interface DemoCardEventRequest { type: CardEventType; amount_cents: string; merchant?: string; authorization_id?: string }
export interface CardEventResult {
  event_id: string; type: CardEventType; decision: 'approved' | 'declined'; reason: string | null;
  card_id: string; ledger_entry_id: string | null; duplicate: boolean;
}
/** One-time payment code (3-D Secure) IZIPAY e-mailed to the card's cardholder address; shown for a few minutes. */
export interface PaymentCodeResponse { payment_code: { code: string; received_at: string; expires_at: string } | null }
export interface CredentialsResponse {
  pan: string; expiry_month: number; expiry_year: number; cvv: string; expires_at: string; demonstration: boolean;
}
export interface LimitValues {
  single_top_up_cents: string; monthly_top_up_cents: string; daily_spend_cents: string; monthly_spend_cents: string; period_timezone: 'UTC';
  /** Rolling windows: last 60 minutes and last 24 hours. */
  top_ups_per_hour: number; top_ups_per_day: number; purchases_per_hour: number; purchases_per_day: number;
}
export interface LimitsResponse {
  limits: LimitValues;
  /** False for an IZIPAY card: purchases are authorized at IZIPAY, so the daily and monthly spend limits do not apply. */
  spend_limits_enforced: boolean;
  usage: { monthly_top_up_cents: string; daily_spend_cents: string; monthly_spend_cents: string;
    top_ups_last_hour: number; top_ups_last_day: number; purchases_last_hour: number; purchases_last_day: number };
}
export interface UserEvent { seq: string; type: 'card' | 'history' | 'top_up'; reference_id: string | null; occurred_at: string }
export interface EventsResponse { items: UserEvent[]; latest_seq: string }
export interface APIError { error: { code: string; message: string; request_id: string } }

const text = { type: 'string' } as const;
const money = { type: 'string', pattern: '^(0|[1-9][0-9]*)$', maxLength: 19 } as const;
const uuid = { type: 'string', format: 'uuid' } as const;
const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
  type: 'object', properties, required, additionalProperties: false,
});
export const cardSchema = object({
  id: uuid, status: { type: 'string', enum: ['provisioning', 'active', 'frozen_by_user', 'frozen_by_risk_rule', 'blocked_by_risk', 'closed', 'replaced'] },
  currency: { const: 'USD' }, last_four: { type: 'string', pattern: '^[0-9]{4}$' },
  available_cents: money, held_cents: money, issuer_mode: { type: 'string', enum: ['demo', 'izipay'] },
});
export const cardResponseSchema = object({ card: { anyOf: [cardSchema, { type: 'null' }] } });
export const historyItemSchema = object({
  id: uuid, kind: { type: 'string', enum: ['top_up', 'authorization', 'capture', 'reversal', 'refund', 'card_status'] },
  status: { type: 'string', enum: ['credited', 'held', 'completed', 'reversed', 'paused', 'resumed'] },
  amount_cents: money, currency: { const: 'USD' }, title: text,
  occurred_at: { type: 'string', format: 'date-time' },
  parent_id: { anyOf: [uuid, { type: 'null' }] },
  merchant: { type: ['string', 'null'], maxLength: 120 },
  current_status: { type: 'string', enum: ['credited', 'held', 'completed', 'reversed', 'paused', 'resumed'] },
  network: { anyOf: [{ type: 'string', pattern: '^eip155:[0-9]+$' }, { type: 'null' }] },
  transaction_hash: { anyOf: [{ type: 'string', pattern: '^0x[0-9a-f]{64}$' }, { type: 'null' }] },
  demonstration: { type: 'boolean' },
});
export const historyResponseSchema = object({
  items: { type: 'array', items: historyItemSchema }, next_cursor: { type: ['string', 'null'] },
});
export const userSchema = object({ id: uuid, wallet_address: { type: 'null' }, authentication: { const: 'fixture' } });
export const sessionResponseSchema = object({
  access_token: text, expires_at: { type: 'string', format: 'date-time' }, user: userSchema,
});
const walletAddressSchema = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$', minLength: 42, maxLength: 42 } as const;
const chainIDSchema = { type: 'integer', minimum: 1, maximum: Number.MAX_SAFE_INTEGER } as const;
const challengeIDSchema = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' } as const;
const signInMessageSchema = { type: 'string', minLength: 1, maxLength: 2048 } as const;
export const walletUserSchema = object({ id: uuid, wallet_address: walletAddressSchema, authentication: { const: 'siwe' }, chain_id: chainIDSchema });
export const walletSessionResponseSchema = object({
  access_token: { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' },
  expires_at: { type: 'string', format: 'date-time' }, user: walletUserSchema,
});
export const authChallengeRequestSchema = object({ address: walletAddressSchema, chain_id: chainIDSchema });
export const authChallengeResponseSchema = object({ id: challengeIDSchema, message: signInMessageSchema, expires_at: { type: 'string', format: 'date-time' } });
export const authVerifyRequestSchema = object({
  challenge_id: challengeIDSchema, message: signInMessageSchema,
  signature: { type: 'string', pattern: '^0x[0-9a-fA-F]{130}$', minLength: 132, maxLength: 132 },
});
export const walletAuthMetadataSchema = object({
  origin: { type: 'string', format: 'uri' }, uri: { type: 'string', format: 'uri' },
  chain_ids: { type: 'array', items: chainIDSchema, minItems: 1, maxItems: 2, uniqueItems: true },
});
const count = { type: 'integer', minimum: 0 } as const;
const limitValuesSchema = object({ single_top_up_cents: money, monthly_top_up_cents: money, daily_spend_cents: money,
  monthly_spend_cents: money, period_timezone: { const: 'UTC' },
  top_ups_per_hour: count, top_ups_per_day: count, purchases_per_hour: count, purchases_per_day: count });
const addressSchema = { type: 'string', pattern: '^0x[0-9a-fA-F]{40}$' } as const;
const hashOrNull = { anyOf: [{ type: 'string', pattern: '^0x[0-9a-f]{64}$' }, { type: 'null' }] } as const;
const dateTime = { type: 'string', format: 'date-time' } as const;
const tokenUnits = { type: 'string', pattern: '^[1-9][0-9]{0,77}$' } as const;
export const networkConfigSchema = object({
  chain_id: chainIDSchema, caip2: { type: 'string', pattern: '^eip155:[0-9]+$' }, name: text, confirmations: { type: 'integer', minimum: 1 },
  recipient_address: addressSchema, explorer_tx_url: { type: 'string', format: 'uri' },
  assets: { type: 'array', items: object({ symbol: text, name: text, token_address: addressSchema, decimals: { type: 'integer', minimum: 2, maximum: 36 } }) },
});
const topUpStatus = { type: 'string', enum: ['quoted', 'awaiting_signature', 'submitted', 'confirming', 'funding_pending', 'credited', 'failed', 'cancelled', 'expired'] } as const;
export const topUpSchema = object({
  id: uuid, status: topUpStatus, failure_reason: { type: ['string', 'null'] }, card_id: uuid,
  chain_id: chainIDSchema, network_name: text, asset: text, asset_name: text, token_address: addressSchema, token_decimals: { type: 'integer' },
  sender_address: addressSchema, recipient_address: addressSchema,
  amount_cents: money, token_units: tokenUnits, card_amount_cents: money, minimum_card_amount_cents: money,
  service_fee_cents: money, network_fee_note: text, simulated: { const: false },
  transaction_hash: hashOrNull, confirmations: { type: 'integer', minimum: 0 }, required_confirmations: { type: 'integer', minimum: 1 },
  created_at: dateTime, quote_expires_at: dateTime, submit_deadline: dateTime, updated_at: dateTime,
  credited_at: { anyOf: [dateTime, { type: 'null' }] }, explorer_url: { type: ['string', 'null'] },
});
export const topUpResponseSchema = object({ top_up: topUpSchema });
export const topUpAcceptResponseSchema = object({
  top_up: topUpSchema,
  transaction: object({ chain_id: chainIDSchema, from: addressSchema, to: addressSchema, value: { const: '0x0' }, data: { type: 'string', pattern: '^0x[0-9a-f]+$' } }),
});
export const topUpListResponseSchema = object({ items: { type: 'array', items: topUpSchema } });
export const topUpCreateRequestSchema = object({
  chain_id: chainIDSchema, asset: { type: 'string', pattern: '^[A-Z0-9]{2,12}$' },
  amount_cents: { type: 'string', minLength: 1, maxLength: 19 },
});
export const topUpHashRequestSchema = object({ transaction_hash: { type: 'string', pattern: '^0x[0-9a-fA-F]{64}$' } });
export const topUpParamsSchema = object({ id: uuid });
const unitsOrNull = { anyOf: [{ type: 'string', pattern: '^(0|[1-9][0-9]{0,77})$' }, { type: 'null' }] } as const;
export const walletBalancesResponseSchema = object({
  address: addressSchema,
  networks: { type: 'array', items: object({ chain_id: chainIDSchema, available: { type: 'boolean' }, native_symbol: { type: 'string', pattern: '^[A-Z]{2,6}$' },
    native_units: unitsOrNull, assets: { type: 'array', items: object({ symbol: text, decimals: { type: 'integer' }, units: unitsOrNull }) } }) },
});
const cardEventType = { type: 'string', enum: ['authorization', 'capture', 'reversal', 'refund'] } as const;
export const demoCardEventRequestSchema = object({
  type: cardEventType, amount_cents: { type: 'string', minLength: 1, maxLength: 19 },
  merchant: { type: 'string', minLength: 1, maxLength: 120 }, authorization_id: uuid,
}, ['type', 'amount_cents']);
export const cardEventResultSchema = object({
  event_id: text, type: cardEventType, decision: { type: 'string', enum: ['approved', 'declined'] }, reason: { type: ['string', 'null'] },
  card_id: uuid, ledger_entry_id: { anyOf: [uuid, { type: 'null' }] }, duplicate: { type: 'boolean' },
});
export const configSchema = object({
  schema_version: { const: 1 }, issuer_mode: { type: 'string', enum: ['demo', 'izipay'] }, network_mode: { type: 'string', enum: ['fixture', 'testnet', 'mainnet'] },
  wallet_auth_enabled: { type: 'boolean' }, wallet_auth: { anyOf: [walletAuthMetadataSchema, { type: 'null' }] }, top_up_enabled: { type: 'boolean' },
  networks: { type: 'array', maxItems: 4, items: networkConfigSchema },
  spend_limits_enforced: { type: 'boolean' },
  limits: limitValuesSchema,
  walletconnect_project_id: { anyOf: [{ type: 'string', pattern: '^[0-9a-f]{32}$' }, { type: 'null' }] },
});
export const paymentCodeResponseSchema = object({
  payment_code: { anyOf: [object({ code: { type: 'string', pattern: '^[0-9]{4,8}$' }, received_at: { type: 'string', format: 'date-time' },
    expires_at: { type: 'string', format: 'date-time' } }), { type: 'null' }] },
});
export const credentialsResponseSchema = object({
  pan: { type: 'string', pattern: '^9999[0-9]{12}$' }, expiry_month: { type: 'integer', minimum: 1, maximum: 12 },
  expiry_year: { type: 'integer', minimum: 2026, maximum: 2100 }, cvv: { type: 'string', pattern: '^[0-9]{3}$' },
  expires_at: { type: 'string', format: 'date-time' }, demonstration: { type: 'boolean' },
});
export const limitsResponseSchema = object({
  limits: limitValuesSchema,
  spend_limits_enforced: { type: 'boolean' },
  usage: object({ monthly_top_up_cents: money, daily_spend_cents: money, monthly_spend_cents: money,
    top_ups_last_hour: count, top_ups_last_day: count, purchases_last_hour: count, purchases_last_day: count }),
});
const sequence = { type: 'string', pattern: '^(0|[1-9][0-9]{0,18})$' } as const;
export const eventsResponseSchema = object({
  items: { type: 'array', items: object({ seq: sequence, type: { type: 'string', enum: ['card', 'history', 'top_up'] },
    reference_id: { anyOf: [uuid, { type: 'null' }] }, occurred_at: { type: 'string', format: 'date-time' } }) },
  latest_seq: sequence,
});
export const eventsQuerySchema = object({ after: sequence }, []);
export const errorSchema = object({ error: object({ code: text, message: text, request_id: text }) });
export const profileRequestSchema = object({ profile: { type: 'string', enum: ['standard', 'empty', 'risk'] } });
export const cardParamsSchema = object({ id: uuid });
export const emptyBodySchema = object({});
export const historyQuerySchema = object({
  cursor: { type: 'string', maxLength: 512 }, limit: { type: 'string', pattern: '^([1-9]|[1-4][0-9]|50)$' },
}, []);
export const idempotencyHeadersSchema = {
  type: 'object', required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 8, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' } },
};
