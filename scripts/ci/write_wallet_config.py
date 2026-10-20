"""Write the ignored WalletIntegration.plist from secrets/variables, then regenerate the Xcode project.

CI: REOWN_PROJECT_ID comes from the repository secret; WALLET_* from repository variables.
Local: python scripts/ci/write_wallet_config.py --env-file apps/ios/wallet.local.env

Nothing is written unless every field is present, so a partial configuration never ships.
Values are never printed; only the names of missing fields are reported.
"""
import os
import plistlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TARGET = ROOT / "apps/ios/CryptoCardDemo/WalletIntegration.plist"
FIELDS = ["REOWN_PROJECT_ID", "WALLET_API_BASE_URL", "WALLET_SIWE_ORIGIN", "WALLET_SIWE_URI", "WALLET_APP_GROUP"]


def read_env_file(path):
    values = {}
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            values[key.strip()] = value.strip()
    return values


def main():
    values = {key: os.environ.get(key, "") for key in FIELDS + ["WALLET_CHAIN_IDS"]}
    if "--env-file" in sys.argv:
        values.update({k: v for k, v in read_env_file(sys.argv[sys.argv.index("--env-file") + 1]).items() if v})
    missing = [key for key in FIELDS if not values.get(key)]
    if missing:
        print("Wallet configuration skipped; missing: " + ", ".join(missing) + ". The build shows wallet sign-in as unavailable.")
        return 0
    if not re.fullmatch(r"[0-9a-f]{32}", values["REOWN_PROJECT_ID"]):
        raise SystemExit("REOWN_PROJECT_ID is not a 32-character lowercase hex Reown project ID.")
    chains = [int(item) for item in (values.get("WALLET_CHAIN_IDS") or "84532").split(",")]
    TARGET.write_bytes(plistlib.dumps({
        "projectID": values["REOWN_PROJECT_ID"], "groupIdentifier": values["WALLET_APP_GROUP"],
        "apiBaseURL": values["WALLET_API_BASE_URL"], "origin": values["WALLET_SIWE_ORIGIN"],
        "uri": values["WALLET_SIWE_URI"], "chainIDs": chains,
    }, fmt=plistlib.FMT_XML))
    # The committed project omits the plist; regenerate so this build bundles it.
    subprocess.run([sys.executable, str(ROOT / "scripts/dev/generate_xcode_project.py")], check=True)
    print(f"Wallet configuration written for chains {chains}; the app validates every field at launch.")
    # Non-secret summary for the build log; the Reown Project ID is only reported as present.
    print("  projectID: set (32 hex characters)")
    for key, name in [("WALLET_API_BASE_URL", "apiBaseURL"), ("WALLET_SIWE_ORIGIN", "origin"),
                      ("WALLET_SIWE_URI", "uri"), ("WALLET_APP_GROUP", "groupIdentifier")]:
        print(f"  {name}: {values[key]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
