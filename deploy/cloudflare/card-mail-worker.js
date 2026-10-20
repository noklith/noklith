// Cloudflare Email Routing worker for cardholder mail (card-<card id>@noklith.com).
// IZIPAY e-mails one-time payment codes to the card's cardholder address; wallet users have no mailbox,
// so this worker forwards each such message, signed, to the API, which keeps only the code for a few
// minutes and shows it in the app. Everything else is rejected.
//
// Worker settings (Settings → Variables and Secrets):
//   CARD_MAIL_URL     https://api.noklith.com/v1/issuer/card-mail
//   CARD_MAIL_SECRET  the same value as CARD_MAIL_SECRET on the server (type: Secret)
//   ALLOWED_SENDERS   optional, comma-separated sender domains, for example izipay.me
const CARD_ADDRESS = /^card-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}@/;
const MAX_BYTES = 512 * 1024;

export default {
  async email(message, env) {
    const to = message.to.toLowerCase();
    if (!CARD_ADDRESS.test(to)) return message.setReject('Unknown address');
    if (message.rawSize > MAX_BYTES) return message.setReject('Message too large');
    const allowed = (env.ALLOWED_SENDERS ?? '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
    const senderDomain = message.from.toLowerCase().split('@').pop();
    if (allowed.length && !allowed.some(domain => senderDomain === domain || senderDomain.endsWith(`.${domain}`))) {
      return message.setReject('Sender not accepted');
    }
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const timestamp = String(Math.floor(Date.now() / 1000));
    const prefix = new TextEncoder().encode(`${timestamp}.`);
    const signed = new Uint8Array(prefix.length + raw.length);
    signed.set(prefix);
    signed.set(raw, prefix.length);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.CARD_MAIL_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const signature = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, signed))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    const response = await fetch(env.CARD_MAIL_URL, {
      method: 'POST',
      headers: { 'content-type': 'message/rfc822', 'x-card-mail-to': to, 'x-card-mail-timestamp': timestamp, 'x-card-mail-signature': signature },
      body: raw,
    });
    // A failure is thrown so Email Routing reports it; the code then also stays visible in IZIPAY's dashboard.
    if (!response.ok) throw new Error(`The API answered ${response.status}`);
  },
};
