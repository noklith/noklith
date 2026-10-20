#!/usr/bin/env bash
# Run on the VPS as deploy: builds and starts one release, then points /srv/crypto-card/current at it.
#   bash /srv/crypto-card/releases/<commit>/deploy/activate.sh <commit>
# Also used for rollback: activating an older release reuses its image (see docs/operations.md).
set -euo pipefail
RELEASE="$1"
ROOT=/srv/crypto-card
DIR="$ROOT/releases/$RELEASE"
[ -f "$DIR/deploy/compose.yaml" ] || { echo "No release at $DIR" >&2; exit 1; }
export RELEASE
dc() { docker compose --env-file "$ROOT/shared/.env" -f "$DIR/deploy/compose.yaml" "$@"; }

sudo install -m 755 "$DIR/deploy/cryptocard.sh" /usr/local/bin/cryptocard
sudo install -m 755 "$DIR/deploy/pg-backup.sh" /usr/local/sbin/cryptocard-pg-backup
sudo install -m 755 "$DIR/deploy/update-cloudflare-ips.sh" /usr/local/sbin/cryptocard-update-cloudflare-ips
sudo install -m 644 "$DIR/deploy/cryptocard-pg-backup.service" "$DIR/deploy/cryptocard-pg-backup.timer" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cryptocard-pg-backup.timer >/dev/null
[ -f "$ROOT/shared/caddy/cloudflare-trusted-proxies.caddy" ] || sudo /usr/local/sbin/cryptocard-update-cloudflare-ips

echo "== build api image cryptocard-api:$RELEASE"
dc build api
echo "== start database"
dc up -d --wait postgres
# The image restarts PostgreSQL once on first initialisation; wait until a real query succeeds.
for attempt in $(seq 1 30); do
  if TABLE=$(docker exec cryptocard-postgres-1 psql -h 127.0.0.1 -U crypto_card -d crypto_card -tAc "SELECT to_regclass('schema_migrations')" 2>/dev/null); then break; fi
  [ "$attempt" = 30 ] && { echo "Database not reachable; nothing changed." >&2; exit 1; }
  sleep 2
done
if [ "$TABLE" = schema_migrations ]; then
  echo "== pre-migration backup"
  sudo /usr/local/sbin/cryptocard-pg-backup "pre-deploy-${RELEASE:0:12}"
fi
echo "== migrations"
dc run --rm --no-deps api node src/migrate-cli.ts
echo "== start api and caddy"
dc up -d --wait --remove-orphans
curl -fsS http://127.0.0.1:3000/health && echo
ln -sfn "$DIR" "$ROOT/current.tmp" && mv -T "$ROOT/current.tmp" "$ROOT/current"
echo "$RELEASE" > "$ROOT/current-release"
date -u +"%Y-%m-%dT%H:%M:%SZ $RELEASE" >> "$ROOT/deploy-history.log"
echo "== active release $RELEASE"
