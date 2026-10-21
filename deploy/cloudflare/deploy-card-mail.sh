#!/usr/bin/env bash
# Deploys the card-mail worker and copies CARD_MAIL_SECRET from the server without printing it.
#   DEPLOY_HOST=user@server bash deploy/cloudflare/deploy-card-mail.sh
set -euo pipefail
HOST="${DEPLOY_HOST:?set DEPLOY_HOST=user@server}"
WRANGLER="${WRANGLER:-$HOME/.noklith-tools/node_modules/.bin/wrangler}"
cd "$(dirname "$0")"
"$WRANGLER" whoami >/dev/null 2>&1 || "$WRANGLER" login
"$WRANGLER" deploy
ssh -o BatchMode=yes "$HOST" "grep '^CARD_MAIL_SECRET=' /srv/crypto-card/shared/.env | cut -d= -f2- | tr -d '\r\n'" \
  | "$WRANGLER" secret put CARD_MAIL_SECRET
echo "Now: Email Routing -> Routing rules -> Catch-all -> Send to a Worker -> card-mail"
