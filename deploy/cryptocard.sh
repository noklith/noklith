#!/usr/bin/env bash
# docker compose for the active release:  cryptocard ps | cryptocard logs -f api | cryptocard restart api
set -euo pipefail
ROOT=/srv/crypto-card
RELEASE="$(cat "$ROOT/current-release")" exec docker compose --env-file "$ROOT/shared/.env" -f "$ROOT/current/deploy/compose.yaml" "$@"
