# Payment codes from cardholder mail

IZIPAY sends the one-time payment code (3-D Secure OTP) for an online purchase to the card's cardholder e-mail.
Wallet users have no mailbox here: each IZIPAY card is issued with `card-<card id>@<IZIPAY_CARDHOLDER_EMAIL_DOMAIN>`.
That mail is received by Cloudflare Email Routing, forwarded by a small worker to the API, and the code is shown
to the card's owner in the app and on the dashboard for 10 minutes. Only the code is kept; the message is not.

```
IZIPAY ──mail──► card-<id>@noklith.com ──Email Routing──► worker ──signed POST──► /v1/issuer/card-mail
                                                                                       │
                     app / dashboard ◄── GET /v1/cards/{id}/payment-code ◄── card_payment_codes (10 min)
```

## API

- `POST /v1/issuer/card-mail`: raw message (`content-type: message/rfc822`, up to 512 KiB) with
  `x-card-mail-to` (envelope recipient), `x-card-mail-timestamp` (Unix seconds, within 5 minutes) and
  `x-card-mail-signature`: hex HMAC-SHA256 with `CARD_MAIL_SECRET` over `<timestamp>.<raw message>`.
  Answers `202 {"stored": true|false}`; a wrong signature or an old timestamp is `401`.
- `GET /v1/cards/{id}/payment-code`: the newest unexpired code of the caller's own card, or `null`.

The code is the number after "code", "OTP", "passcode", "verification" or "код"; without such a word, only a
single stand-alone six-digit number counts. Both routes exist only when `CARD_MAIL_SECRET` is set
(at least 32 characters, `ISSUER_MODE=izipay`).

## Setup

1. Server: add `CARD_MAIL_SECRET` (a random value of 32+ characters) to `/srv/crypto-card/shared/.env` and
   recreate the API (`cryptocard up -d --force-recreate --wait api`).
2. Cloudflare dashboard, zone of the cardholder domain:
   - **Email → Email Routing → Get started.** This adds Cloudflare MX and SPF records. If the domain already
     receives mail elsewhere, use a subdomain such as `cards.noklith.com` (and the same value in
     `IZIPAY_CARDHOLDER_EMAIL_DOMAIN`) instead; existing cards keep their old address.
   - **Workers & Pages → Create → Worker**, name `card-mail`, paste `deploy/cloudflare/card-mail-worker.js`, deploy.
     Under **Settings → Variables and Secrets** add `CARD_MAIL_URL` = `https://api.noklith.com/v1/issuer/card-mail`,
     `CARD_MAIL_SECRET` (type Secret, the server value) and optionally `ALLOWED_SENDERS` = `izipay.me`.
   - **Email Routing → Routing rules → Catch-all address → Send to a Worker → card-mail**, enable.
3. Check: a payment that asks for a code shows it on the card screen within about 15 seconds. The worker rejects
   any other address, and with `ALLOWED_SENDERS` any other sender.
