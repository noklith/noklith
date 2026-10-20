# Server notes

Production API host for the crypto card demo. No secrets in this file: they live only in
`/srv/crypto-card/shared/.env` on the server (mode 600).

| | |
|---|---|
| Host | VPS, Ubuntu 26.04 LTS; address kept in operator configuration (`DEPLOY_HOST`) |
| Public URL | `https://api.noklith.com` (health: `https://api.noklith.com/health`); website and dashboard `https://noklith.com` (Caddy serves `apps/web/dist`, proxies `/v1/*` to the API) |
| DNS / TLS | Cloudflare proxied A records `api` and `noklith.com` (root, added 2026-10-18) → server; Cloudflare SSL **Full (strict)**; origin certificate from Let's Encrypt via HTTP-01 (TLS-ALPN disabled, it does not pass the Cloudflare proxy) |
| Deployed | the commit reported by `GET https://api.noklith.com/version` |
| Mode | `NETWORK_MODE=testnet`, `ISSUER_MODE=izipay` with the IZIPAY **sandbox** key since 2026-10-18 (cardholder domain `noklith.com`; demo before), wallet sign-in and top-ups **enabled** since 2026-10-10: Base Sepolia (84532), public RPC `https://sepolia.base.org`, Circle test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, recipient `0xe93D0277230B7E21810946BD0Cf763D0A6B7B773`, 5 confirmations, SIWE origin `https://noklith.com`, URI `https://noklith.com/sign-in` since 2026-10-18 (was `https://api.noklith.com`; iOS builds need matching `WALLET_SIWE_ORIGIN`/`WALLET_SIWE_URI`). Previous `.env` copies: `shared/.env.bak-*` |

## What was set up

- User `deploy` (key-only, passwordless sudo, member of `docker`). All work runs as `deploy`.
- SSH: `/etc/ssh/sshd_config.d/00-hardening.conf` — keys only, `PermitRootLogin no`.
- `unattended-upgrades` (daily), `fail2ban` (sshd jail), timezone UTC.
- UFW: deny incoming by default; `22/tcp` open; `80/tcp` and `443/tcp` open **only to Cloudflare ranges**
  (rules commented `cloudflare`). Docker-published ports bypass UFW, so nothing public is published by Docker:
  Caddy runs on the host network (UFW applies), the API is published on `127.0.0.1:3000` only, PostgreSQL has no port at all.
- Docker Engine + compose plugin from download.docker.com.
- Stack (`deploy/compose.yaml`, compose project `cryptocard`):
  - `postgres` — `postgres:18.3`, named volume `cryptocard_postgres_data`, internal network only.
  - `api` — image `cryptocard-api:<commit>` built from `deploy/api.Dockerfile` (Node 24.21.0), `restart: unless-stopped`.
  - `caddy` — `caddy:2.10.2`, host network, volumes `cryptocard_caddy_data` (`/data`, certificates) and `cryptocard_caddy_config` (`/config`).
- Real client IP: Caddy takes `CF-Connecting-IP` only from Cloudflare ranges (`trusted_proxies`) and passes it as
  `X-Forwarded-For`; the API trusts that header only from the compose gateway (`TRUSTED_PROXY=172.30.10.1`).
  Spoofed headers sent directly to the server are ignored (and direct access is blocked by UFW anyway).
- Backups: `cryptocard-pg-backup.timer` daily at 03:15 UTC → `/var/backups/postgres/crypto_card-daily-*.dump`
  (`pg_dump -Fc`, verified with `pg_restore --list`), kept 7 days. Every deploy that changes an existing database also
  writes `crypto_card-pre-deploy-<commit12>-*.dump` before migrations.

## Where things are

| Path | Contents |
|---|---|
| `/srv/crypto-card/releases/<commit>/` | One directory per deployed commit (`apps/api`, `packages/api-contracts`, `deploy`, `apps/web/dist`) |
| `/srv/crypto-card/current` | Symlink to the active release; `/srv/crypto-card/current-release` holds its commit |
| `/srv/crypto-card/deploy-history.log` | UTC time and commit of every activation |
| `/srv/crypto-card/shared/.env` | Runtime secrets and settings (600, owner `deploy`) |
| `/srv/crypto-card/shared/caddy/cloudflare-trusted-proxies.caddy` | Generated Cloudflare range list for Caddy |
| `/srv/crypto-card/shared/caddy/reown/walletconnect.txt` | Reown domain verification file, served at `https://api.noklith.com/.well-known/walletconnect.txt` (404 while absent; no reload needed) |
| `/var/backups/postgres/` | Database dumps (700, root) |
| `/usr/local/bin/cryptocard` | `docker compose` for the active release |
| `/usr/local/sbin/cryptocard-pg-backup` | Manual backup: `sudo cryptocard-pg-backup [label]` |
| `/usr/local/sbin/cryptocard-update-cloudflare-ips` | Cloudflare range refresh (Caddy, and UFW with `--ufw`) |

## Everyday commands (on the server, as `deploy`)

```bash
cryptocard ps                       # container status
cryptocard logs -f api              # API logs (JSON, one line per request)
cryptocard logs -f caddy            # TLS / proxy logs
cryptocard restart api
sudo systemctl list-timers cryptocard-pg-backup.timer
sudo journalctl -u cryptocard-pg-backup.service -n 20
curl -fsS http://127.0.0.1:3000/health
```

## Deploy / redeploy

From a clone of `github.com/noklith/noklith` on the laptop (Git Bash, `gh` signed in):

```bash
DEPLOY_HOST=deploy@<server> deploy/deploy.sh <commit>     # or no argument for HEAD with a clean tree
```

The script refuses a commit that is not on `origin/main` of `noklith/noklith`, or whose GitHub checks there have not
passed, so the commit reported by `GET /version` can always be found in this repository together with its CI run.

It sends `git archive` of `apps/api`, `packages/api-contracts`, `deploy` and the website (`apps/web/dist`) for exactly
that commit (no `.env`, no local databases, no other source), then runs `deploy/activate.sh` on the server: install
helper scripts and units → build `cryptocard-api:<commit>` → start PostgreSQL → pre-migration backup (if the database
already has a schema) → `node src/migrate-cli.ts` → `up -d --wait` → local health check → switch `current`. If any step
fails, `current` keeps pointing at the previous release. Redeploying the same commit is safe.

A top-up the issuer could not load after 24 attempts, or that came back with an unexpected amount, logs
`funding_needs_review` and stops retrying. Check the load in the IZIPAY dashboard first; if it never reached the card,
resume it with `cryptocard exec -T postgres psql -U crypto_card crypto_card -c "UPDATE top_up_intents SET
needs_review_at = NULL, funding_attempts = 0 WHERE id = '<id>'"`.

Changing settings only (no code): back up and edit `/srv/crypto-card/shared/.env`, then `cryptocard up -d --force-recreate --wait api`.
To switch wallet sign-in and top-ups off again, set both flags to `false` the same way.

## Rollback

Find the previous commit: `tail /srv/crypto-card/deploy-history.log`.

**No migrations in the bad release** (compare `ls releases/<old>/apps/api/migrations` with the bad release):

```bash
bash /srv/crypto-card/releases/<old>/deploy/activate.sh <old>
```

The old image is reused from the local cache; the old migration list is a subset of what is applied, which the migrator accepts.

**The bad release added migrations.** Migrations are forward-only (no down scripts).

1. If the new migrations only add tables/columns that the old code ignores, the plain rollback above is enough.
2. If the schema change is incompatible, restore the dump taken right before that deploy:
   ```bash
   sudo cryptocard-pg-backup before-rollback          # keep the current state, just in case
   cryptocard stop api
   # The backup directory is root-only, so the glob must expand inside sudo.
   F=$(sudo sh -c 'ls -t /var/backups/postgres/crypto_card-pre-deploy-<bad-commit-12-chars>-*.dump | head -1')
   sudo cat "$F" | docker exec -i cryptocard-postgres-1 \
     pg_restore -U crypto_card -d crypto_card --clean --if-exists --single-transaction --no-owner
   bash /srv/crypto-card/releases/<old>/deploy/activate.sh <old>
   ```
   Everything written to the database after the bad deploy is lost by this restore; the `before-rollback` dump keeps it
   for manual recovery. Pre-deploy dumps are deleted after 7 days like the others.

## Cloudflare ranges

Cloudflare publishes them at https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6 (they change rarely).
Refresh both Caddy and UFW:

```bash
sudo cryptocard-update-cloudflare-ips --ufw
```

The script validates the lists, adds new rules before removing stale ones (80/443 never close for Cloudflare), reloads
Caddy and prints the number of ranges. Check afterwards with `sudo ufw status | grep -c cloudflare` (2 rules per range) and
`curl https://api.noklith.com/health`. If Cloudflare proxying is ever turned off for `api`, the site becomes unreachable
until UFW allows `80,443/tcp` from anywhere again (`sudo ufw allow 80/tcp && sudo ufw allow 443/tcp`).

## Checking that a backup restores

Tested on 2026-10-10 (restored database had all 6 migrations):

```bash
F=$(sudo sh -c 'ls -t /var/backups/postgres/*.dump | head -1')
docker run -d --rm --name restore-test -e POSTGRES_PASSWORD=test postgres:18.3
sleep 10
docker exec restore-test createdb -h 127.0.0.1 -U postgres crypto_card
sudo cat "$F" | docker exec -i restore-test pg_restore -h 127.0.0.1 -U postgres -d crypto_card --no-owner
docker exec restore-test psql -h 127.0.0.1 -U postgres -d crypto_card -tAc 'select count(*) from schema_migrations'
docker stop restore-test
```

## Enabling wallet sign-in and top-ups later

Set in `shared/.env`, then `cryptocard up -d api` (the API refuses to start on any inconsistent value):

| Variable | Value |
|---|---|
| `WALLET_AUTH_ENABLED` | `true` |
| `SIWE_ORIGIN` / `SIWE_URI` | Canonical HTTPS origin and same-origin URL shown in the sign-in message, e.g. `https://noklith.com` and `https://noklith.com/sign-in` |
| `AUTH_CHAIN_IDS` | test networks from `apps/api/src/chain/networks.ts` (e.g. `84532`); with `NETWORK_MODE=mainnet` only `137` and `56` |
| `BASE_SEPOLIA_RPC_URL` / `ETHEREUM_SEPOLIA_RPC_URL` | HTTPS RPC for each selected chain |
| `TOP_UP_ENABLED` | `true` (needs `84532` in `AUTH_CHAIN_IDS`) |
| `BASE_SEPOLIA_USDC_ADDRESS` | Circle test USDC on Base Sepolia |
| `TOP_UP_RECIPIENT_ADDRESS` | Testnet address you control (address only; the server never needs a private key) |
| `TOP_UP_CONFIRMATIONS` | Optional, default 5 |

The iOS build gets the API address from CI variable `WALLET_API_BASE_URL` (set it to `https://api.noklith.com`) together
with `WALLET_SIWE_ORIGIN`, `WALLET_SIWE_URI`, `WALLET_CHAIN_IDS`, `WALLET_APP_GROUP` and the Reown project ID secret.
