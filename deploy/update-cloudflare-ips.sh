#!/usr/bin/env bash
# Refresh Cloudflare ranges for Caddy (trusted proxies) and, with --ufw, for UFW (80/443 only from Cloudflare).
#   sudo cryptocard-update-cloudflare-ips          # Caddy only
#   sudo cryptocard-update-cloudflare-ips --ufw    # Caddy and firewall
# New rules are added before stale ones are removed, so 80/443 never close for Cloudflare.
set -euo pipefail
SNIPPET=/srv/crypto-card/shared/caddy/cloudflare-trusted-proxies.caddy
v4="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v4)"
v6="$(curl -fsS --max-time 20 https://www.cloudflare.com/ips-v6)"
ranges="$(printf '%s\n%s\n' "$v4" "$v6" | tr -d '\r' | sed '/^$/d')"
# Refuse anything that is not a plain CIDR list (empty or HTML error pages would lock out traffic).
echo "$ranges" | grep -Eqv '^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$|^[0-9a-f:]+/[0-9]{1,3}$' && { echo "Unexpected range list" >&2; exit 1; }
[ "$(echo "$ranges" | wc -l)" -ge 10 ] || { echo "Range list too short" >&2; exit 1; }

install -d -m 755 "$(dirname "$SNIPPET")"
echo "trusted_proxies static $(echo "$ranges" | tr '\n' ' ')" > "$SNIPPET.tmp"
if ! cmp -s "$SNIPPET.tmp" "$SNIPPET"; then
  mv "$SNIPPET.tmp" "$SNIPPET"
  echo "Caddy trusted proxies updated"
  docker exec cryptocard-caddy-1 caddy reload --config /etc/caddy/Caddyfile 2>/dev/null || echo "Caddy not running; it reads the file on start"
else
  rm -f "$SNIPPET.tmp"
fi

if [ "${1:-}" = "--ufw" ]; then
  for cidr in $ranges; do
    for port in 80 443; do ufw allow proto tcp from "$cidr" to any port "$port" comment cloudflare >/dev/null; done
  done
  # Remove the open-to-all web rules and Cloudflare rules for ranges no longer published.
  for port in 80 443; do
    ufw --force delete allow "$port/tcp" >/dev/null 2>&1 || true
  done
  ufw status | awk '/cloudflare/ {print $1, $3}' | sort -u | while read -r rule source; do
    port="${rule%%/*}"
    echo "$ranges" | grep -qxF "$source" || ufw --force delete allow proto tcp from "$source" to any port "$port" >/dev/null
  done
  echo "UFW: 80/443 allowed only from $(echo "$ranges" | wc -l) Cloudflare ranges"
fi
