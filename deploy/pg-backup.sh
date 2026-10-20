#!/usr/bin/env bash
# Custom-format pg_dump into /var/backups/postgres; dumps older than 7 days are removed.
#   cryptocard-pg-backup [label]   (daily timer uses "daily")
set -euo pipefail
LABEL="${1:-manual}"
DIR=/var/backups/postgres
install -d -m 700 "$DIR"
FILE="$DIR/crypto_card-$LABEL-$(date -u +%Y%m%dT%H%M%SZ).dump"
docker exec cryptocard-postgres-1 pg_dump -U crypto_card -d crypto_card -Fc > "$FILE.tmp"
# A dump that pg_restore cannot list is not a backup.
docker exec -i cryptocard-postgres-1 pg_restore --list < "$FILE.tmp" > /dev/null
mv "$FILE.tmp" "$FILE"
chmod 600 "$FILE"
find "$DIR" -maxdepth 1 -name 'crypto_card-*.dump' -mtime +6 -delete
echo "Backup written: $FILE ($(stat -c %s "$FILE") bytes)"
