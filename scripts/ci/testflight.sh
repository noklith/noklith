#!/usr/bin/env bash
# Signed Release archive of the app, uploaded to App Store Connect (TestFlight). Runs on the CircleCI macOS job.
# Manual signing from CircleCI project variables; nothing secret is committed or printed:
#   APPLE_TEAM_ID                 10-character Team ID
#   ASC_KEY_ID, ASC_ISSUER_ID     App Store Connect API key (role App Manager)
#   ASC_KEY_P8_BASE64             the AuthKey_<id>.p8 file, base64
#   DIST_CERT_P12_BASE64          Apple Distribution certificate + private key (.p12), base64
#   DIST_CERT_P12_PASSWORD        password of that .p12
#   PROVISIONING_PROFILE_BASE64   App Store profile for com.noklith.app with App Group group.com.noklith.app, base64
# Wallet configuration (REOWN_PROJECT_ID, WALLET_*) is written by write_wallet_config.py as for simulator builds.
set -euo pipefail
cd "$(dirname "$0")/../.."
BUNDLE_ID=com.noklith.app
APP_GROUP=group.com.noklith.app
OUT=build/testflight
BUILD_NUMBER="${BUILD_NUMBER:-${CIRCLE_BUILD_NUM:?BUILD_NUMBER or CIRCLE_BUILD_NUM required}}"

missing=()
for name in APPLE_TEAM_ID ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8_BASE64 DIST_CERT_P12_BASE64 DIST_CERT_P12_PASSWORD PROVISIONING_PROFILE_BASE64; do
  [ -n "${!name:-}" ] || missing+=("$name")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "TestFlight upload not configured; missing CircleCI variables: ${missing[*]}" >&2
  exit 1
fi
[[ "$APPLE_TEAM_ID" =~ ^[A-Z0-9]{10}$ ]] || { echo "APPLE_TEAM_ID must be the 10-character Team ID" >&2; exit 1; }

SECRETS="$(mktemp -d)"
KEYCHAIN="$SECRETS/signing.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -hex 24)"
cleanup() {
  security delete-keychain "$KEYCHAIN" 2>/dev/null || true
  rm -rf "$SECRETS" "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
}
trap cleanup EXIT

echo "== wallet configuration"
python3 scripts/ci/write_wallet_config.py
[ -f apps/ios/CryptoCardDemo/WalletIntegration.plist ] || echo "Note: no wallet configuration; this build shows wallet sign-in as unavailable."

echo "== signing keychain"
echo "$DIST_CERT_P12_BASE64" | base64 --decode > "$SECRETS/dist.p12"
security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 3600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$SECRETS/dist.p12" -k "$KEYCHAIN" -P "$DIST_CERT_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN" $(security list-keychains -d user | tr -d '"')
IDENTITY="$(security find-identity -v -p codesigning "$KEYCHAIN" | awk -F'"' '/Apple Distribution/ {print $2; exit}')"
[ -n "$IDENTITY" ] || { echo "The .p12 does not contain an Apple Distribution identity" >&2; exit 1; }
echo "Identity: $IDENTITY"

echo "== provisioning profile"
echo "$PROVISIONING_PROFILE_BASE64" | base64 --decode > "$SECRETS/app.mobileprovision"
security cms -D -i "$SECRETS/app.mobileprovision" > "$SECRETS/profile.plist"
pb() { /usr/libexec/PlistBuddy -c "Print :$1" "$SECRETS/profile.plist"; }
PROFILE_UUID="$(pb UUID)"; PROFILE_NAME="$(pb Name)"
[ "$(pb Entitlements:application-identifier)" = "$APPLE_TEAM_ID.$BUNDLE_ID" ] || { echo "Profile is not for $APPLE_TEAM_ID.$BUNDLE_ID" >&2; exit 1; }
pb Entitlements:com.apple.security.application-groups | grep -qx "    $APP_GROUP" || { echo "Profile lacks App Group $APP_GROUP" >&2; exit 1; }
if pb ProvisionedDevices >/dev/null 2>&1; then echo "Profile lists devices: it is not an App Store profile" >&2; exit 1; fi
for dir in "$HOME/Library/MobileDevice/Provisioning Profiles" "$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"; do
  mkdir -p "$dir"; cp "$SECRETS/app.mobileprovision" "$dir/$PROFILE_UUID.mobileprovision"
done
echo "Profile: $PROFILE_NAME ($PROFILE_UUID), expires $(pb ExpirationDate)"

echo "== archive (build $BUILD_NUMBER)"
rm -rf "$OUT"; mkdir -p "$OUT"
# APP_* settings reach only the app target (see generate_xcode_project.py); Swift packages keep their own signing.
xcodebuild -project apps/ios/CryptoCardDemo.xcodeproj -scheme CryptoCardDemo -configuration Release \
  -destination generic/platform=iOS -archivePath "$OUT/CryptoCardDemo.xcarchive" \
  OTHER_CODE_SIGN_FLAGS="--keychain $KEYCHAIN" DEVELOPMENT_TEAM="$APPLE_TEAM_ID" \
  APP_CODE_SIGN_STYLE=Manual APP_CODE_SIGN_IDENTITY="Apple Distribution" APP_PROVISIONING_PROFILE="$PROFILE_NAME" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" archive > "$OUT/archive.log" 2>&1   || { grep -E "error:" "$OUT/archive.log" | head -40; tail -20 "$OUT/archive.log"; echo "Archive failed" >&2; exit 1; }
tail -3 "$OUT/archive.log"

echo "== export IPA"
cat > "$SECRETS/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>method</key><string>app-store-connect</string>
<key>destination</key><string>export</string>
<key>teamID</key><string>$APPLE_TEAM_ID</string>
<key>signingStyle</key><string>manual</string>
<key>signingCertificate</key><string>Apple Distribution</string>
<key>provisioningProfiles</key><dict><key>$BUNDLE_ID</key><string>$PROFILE_NAME</string></dict>
<key>uploadSymbols</key><true/>
<key>manageAppVersionAndBuildNumber</key><false/>
</dict></plist>
EOF
xcodebuild -exportArchive -archivePath "$OUT/CryptoCardDemo.xcarchive" -exportOptionsPlist "$SECRETS/ExportOptions.plist" \
  -exportPath "$OUT/export" > "$OUT/export.log" 2>&1   || { tail -40 "$OUT/export.log"; echo "Export failed" >&2; exit 1; }
IPA="$(ls "$OUT"/export/*.ipa)"
codesign -d --entitlements :- "$OUT/CryptoCardDemo.xcarchive/Products/Applications/CryptoCardDemo.app" 2>/dev/null \
  | grep -q "$APP_GROUP" || { echo "Signed app lacks the App Group entitlement" >&2; exit 1; }

echo "== upload to App Store Connect"
mkdir -p "$HOME/.appstoreconnect/private_keys"
echo "$ASC_KEY_P8_BASE64" | base64 --decode > "$HOME/.appstoreconnect/private_keys/AuthKey_${ASC_KEY_ID}.p8"
xcrun altool --upload-app --type ios --file "$IPA" --apiKey "$ASC_KEY_ID" --apiIssuer "$ASC_ISSUER_ID" --output-format normal
echo "Uploaded $BUNDLE_ID build $BUILD_NUMBER. It appears in TestFlight after Apple finishes processing (usually 5-30 min)."
