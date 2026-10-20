#!/usr/bin/env bash
# Apple Distribution certificate without a Mac (Git Bash on Windows, OpenSSL).
# Everything is written to .local/apple-signing/ (git-ignored). Never commit or paste these files in chat.
#   scripts/dev/apple_signing.sh csr            -> distribution.key + distribution.csr (upload the CSR to Apple)
#   scripts/dev/apple_signing.sh p12 <file.cer> -> distribution.p12 + p12-password.txt
#   scripts/dev/apple_signing.sh b64 <file>     -> <file>.b64.txt, one line, for a CircleCI variable
set -euo pipefail
DIR="$(cd "$(dirname "$0")/../.." && (pwd -W 2>/dev/null || pwd))/.local/apple-signing"
mkdir -p "$DIR"
case "${1:-}" in
  csr)
    [ -f "$DIR/distribution.key" ] && { echo "$DIR/distribution.key already exists; refusing to overwrite." >&2; exit 1; }
    openssl genrsa -out "$DIR/distribution.key" 2048
    MSYS_NO_PATHCONV=1 openssl req -new -key "$DIR/distribution.key" -out "$DIR/distribution.csr" -subj "/CN=Noklith Apple Distribution/C=DE"
    echo "Upload $DIR/distribution.csr in Certificates > + > Apple Distribution."
    ;;
  p12)
    CER="${2:?path to the downloaded distribution.cer}"
    openssl x509 -inform DER -in "$CER" -out "$DIR/distribution.pem"
    openssl rand -hex 16 > "$DIR/p12-password.txt"
    # SHA1/3DES encryption: the macOS 'security' tool on CI cannot read OpenSSL 3's default AES p12.
    openssl pkcs12 -export -inkey "$DIR/distribution.key" -in "$DIR/distribution.pem" -name "Apple Distribution" \
      -certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1 \
      -out "$DIR/distribution.p12" -passout "file:$DIR/p12-password.txt"
    echo "Created $DIR/distribution.p12; its password is in $DIR/p12-password.txt."
    ;;
  b64)
    SRC="${2:?file to encode}"
    base64 -w 0 "$SRC" > "$SRC.b64.txt"
    echo "Wrote $SRC.b64.txt ($(wc -c < "$SRC.b64.txt") characters). Paste its content as the CircleCI variable value."
    ;;
  *) sed -n '2,7p' "$0"; exit 1 ;;
esac
