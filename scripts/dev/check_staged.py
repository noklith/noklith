"""Refuse a commit that stages secrets, local databases or private configuration.

Install once per clone:  python scripts/dev/check_staged.py --install
Runs automatically as the git pre-commit hook afterwards; also runnable by hand.
"""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

BLOCKED_PATHS = [
    (re.compile(r"(^|/)\.env($|\.)(?!example$)"), "environment file"),
    (re.compile(r"\.local\.env$"), "local-only values file"),
    (re.compile(r"(^|/)WalletIntegration\.plist$"), "local wallet configuration (Reown Project ID)"),
    (re.compile(r"(^|/)\.local/"), "local fixture database"),
    (re.compile(r"(^|/)(pgdata|fixture-db)/"), "local database directory"),
    (re.compile(r"\.(sqlite3?|db|dump|pem|key|p12|p8|mobileprovision|keystore)$", re.I), "database or key file"),
    (re.compile(r"(^|/)artifacts/"), "downloaded CI evidence"),
    (re.compile(r"(^|/)node_modules/"), "installed packages"),
]

# Content patterns that indicate a real credential. Test fixtures use clearly
# synthetic values; anything matching here must be reviewed, not committed blindly.
BLOCKED_CONTENT = [
    (re.compile(r"-----BEGIN (RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----"), "PEM private key"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b"), "GitHub token"),
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), "API secret key"),
    (re.compile(r"https://[a-z0-9-]+\.g\.alchemy\.com/v2/[A-Za-z0-9_-]{20,}"), "Alchemy RPC URL with key"),
    (re.compile(r"https://[a-z0-9-]+\.infura\.io/v3/[0-9a-f]{32}"), "Infura RPC URL with key"),
    (re.compile(r"(?i)(project[_-]?id|REOWN_PROJECT_ID)\s*[:=]\s*['\"]?[0-9a-f]{32}\b"), "Reown Project ID"),
    (re.compile(r"(?i)\b(mnemonic|seed[_ ]phrase)\b\s*[:=]\s*['\"][a-z]+( [a-z]+){11,23}['\"]"), "wallet mnemonic"),
]
ALLOWED_CONTENT_FILES = {"scripts/dev/check_staged.py"}


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True).stdout


def local_values():
    """Values from ignored local files (e.g. the Reown Project ID): they must never appear in a commit."""
    values = set()
    for path in [ROOT / "apps/api/.env", *ROOT.glob("*.local.env"), *ROOT.glob("apps/**/*.local.env")]:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            key, sep, value = line.partition("=")
            value = value.strip().strip('"').strip("'")
            if sep and not key.lstrip().startswith("#") and len(value) >= 16 and not value.startswith("https://sepolia.base.org"):
                values.add(value)
    # Placeholders shared with the committed example are not secrets.
    example = ROOT / "apps/api/.env.example"
    public = example.read_text(encoding="utf-8", errors="replace") if example.is_file() else ""
    return {value for value in values if value not in public}


def main():
    if "--install" in sys.argv:
        hook = Path(git("rev-parse", "--git-path", "hooks").decode().strip())
        hook = hook if hook.is_absolute() else ROOT / hook
        hook.mkdir(parents=True, exist_ok=True)
        (hook / "pre-commit").write_text("#!/bin/sh\nexec python scripts/dev/check_staged.py\n", encoding="utf-8", newline="\n")
        print(f"Installed {hook / 'pre-commit'}")
        return 0
    names = [n for n in git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z").decode("utf-8").split("\0") if n]
    problems = []
    secrets = local_values()
    for name in names:
        for pattern, reason in BLOCKED_PATHS:
            if pattern.search(name):
                problems.append(f"{name}: {reason}")
        if name in ALLOWED_CONTENT_FILES:
            continue
        content = git("show", f":{name}")
        if b"\0" in content[:8192]:
            continue
        text = content.decode("utf-8", errors="replace")
        for pattern, reason in BLOCKED_CONTENT:
            if pattern.search(text):
                problems.append(f"{name}: possible {reason}")
        if any(value in text for value in secrets):
            problems.append(f"{name}: contains a value from an ignored local config file")
    if problems:
        print("Commit blocked by scripts/dev/check_staged.py:", *problems, sep="\n  ", file=sys.stderr)
        return 1
    print(f"check_staged: {len(names)} staged files clean")
    return 0


if __name__ == "__main__":
    sys.exit(main())
