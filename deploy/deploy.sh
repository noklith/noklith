#!/usr/bin/env bash
# Run on the owner's machine (Git Bash, gh signed in): ships one exact commit of noklith/noklith main, with
# passing CI, to the VPS and activates it.
#   DEPLOY_HOST=user@server deploy/deploy.sh [commit]   (default: HEAD)
# Only tracked files of apps/api, packages/api-contracts, deploy and the website (apps/web/dist) are sent: no .env, no local
# databases, no other source. Secrets stay in /srv/crypto-card/shared/.env on the server.
set -euo pipefail
# The server address is operator configuration, not part of the repository.
HOST="${DEPLOY_HOST:?set DEPLOY_HOST=user@server}"
COMMIT="$(git rev-parse --verify "${1:-HEAD}^{commit}")"
# Releases come only from the main branch of github.com/noklith/noklith, and only after its CI passed there,
# so the commit that GET /version reports can always be looked up in that repository with its checks.
REPO=noklith/noklith
case "$(git remote get-url origin)" in
  "https://github.com/$REPO.git" | "https://github.com/$REPO" | "git@github.com:$REPO.git") ;;
  *) echo "origin must be github.com/$REPO." >&2; exit 1 ;;
esac
git fetch --quiet origin
if ! git merge-base --is-ancestor "$COMMIT" origin/main; then
  echo "Commit $COMMIT is not on origin/main; push it first." >&2
  exit 1
fi
CI="$(gh api "repos/$REPO/commits/$COMMIT/check-runs"   --jq '[.check_runs[] | select(.conclusion != "skipped")] | if length == 0 then "none" elif all(.conclusion == "success") then "success" else "not passed" end')"
if [ "$CI" != "success" ]; then
  echo "CI for $COMMIT in $REPO: $CI. Wait for green checks before deploying." >&2
  exit 1
fi
if [ -n "$(git status --porcelain -- apps/api packages/api-contracts deploy apps/web/dist)" ] && [ -z "${1:-}" ]; then
  echo "Uncommitted changes in deployed paths; commit first or pass an explicit commit." >&2
  exit 1
fi
echo "Deploying $COMMIT to $HOST"
# An existing release directory is kept: running containers bind-mount it, and replacing it would leave them
# serving a deleted directory (an empty website).
git -c core.autocrlf=false archive --format=tar "$COMMIT" apps/api packages/api-contracts deploy apps/web/dist \
  | ssh -o BatchMode=yes "$HOST" "set -e; d=/srv/crypto-card/releases/$COMMIT; if [ -d \"\$d\" ]; then cat >/dev/null; exit 0; fi; rm -rf \"\$d.tmp\"; mkdir -p \"\$d.tmp\"; tar -x -C \"\$d.tmp\"; mv \"\$d.tmp\" \"\$d\""
ssh -o BatchMode=yes "$HOST" "bash /srv/crypto-card/releases/$COMMIT/deploy/activate.sh $COMMIT"
