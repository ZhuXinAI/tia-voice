#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/publishProd.sh [--preflight-only] [--tag vX.Y.Z]

Options:
  --preflight-only  Run the exact packaged build validation path without signing,
                    or notarizing.
  --tag             Override the release tag. Defaults to v<package.json version>.
EOF
}

require_command() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

require_env() {
  local variable_name="$1"

  if [[ -z "${!variable_name:-}" ]]; then
    echo "Missing required environment variable: $variable_name" >&2
    exit 1
  fi
}

cleanup() {
  if [[ -n "${KEYCHAIN_PATH:-}" ]]; then
    security delete-keychain "$KEYCHAIN_PATH" >/dev/null 2>&1 || true
  fi

  if [[ -n "${CERTIFICATE_PATH:-}" ]]; then
    rm -f "$CERTIFICATE_PATH"
  fi

  if [[ -n "${TMP_DIR:-}" ]]; then
    rm -rf "$TMP_DIR"
  fi
}

PREFLIGHT_ONLY=0
RELEASE_TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --preflight-only)
      PREFLIGHT_ONLY=1
      shift
      ;;
    --tag)
      RELEASE_TAG="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

trap cleanup EXIT

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "publishProd.sh currently supports macOS only." >&2
  exit 1
fi

require_command pnpm
require_command security
require_command codesign
require_command spctl
require_command unzip
require_command xcrun

PACKAGE_VERSION="$(node -p "require('./package.json').version")"
RELEASE_TAG="${RELEASE_TAG:-v$PACKAGE_VERSION}"

if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Release tags must use semantic version format, for example v1.2.3." >&2
  exit 1
fi

if [[ "${RELEASE_TAG#v}" != "$PACKAGE_VERSION" ]]; then
  echo "package.json version ($PACKAGE_VERSION) must match the release tag ($RELEASE_TAG)." >&2
  exit 1
fi

echo "Running packaged build preflight for $RELEASE_TAG"
pnpm run build
CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --dir --mac --arm64 --publish never
pnpm run verify:packaged-runtime-deps -- "dist/mac-arm64/TIA Voice.app"

if [[ "$PREFLIGHT_ONLY" -eq 1 ]]; then
  echo "Preflight completed successfully for $RELEASE_TAG"
  exit 0
fi

require_env MACOS_CERTIFICATE
require_env MACOS_CERTIFICATE_PASSWORD
require_env KEYCHAIN_PASSWORD
require_env APPLE_ID
require_env APPLE_APP_SPECIFIC_PASSWORD
require_env APPLE_TEAM_ID

TEMP_ROOT="${RUNNER_TEMP:-/tmp}"
CERTIFICATE_PATH="$(mktemp "$TEMP_ROOT"/build-certificate.XXXXXX.p12)"
KEYCHAIN_PATH="$(mktemp "$TEMP_ROOT"/app-signing.XXXXXX.keychain-db)"

printf '%s' "$MACOS_CERTIFICATE" | tr -d '\r\n ' | base64 --decode > "$CERTIFICATE_PATH"

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 21600 "$KEYCHAIN_PATH"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"
security import "$CERTIFICATE_PATH" -P "$MACOS_CERTIFICATE_PASSWORD" -A -t cert -f pkcs12 -k "$KEYCHAIN_PATH"
security list-keychain -d user -s "$KEYCHAIN_PATH"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN_PATH"

echo "Building signed and notarized macOS release artifacts locally for $RELEASE_TAG"
pnpm exec electron-builder --mac --arm64 --publish never

ZIP_PATH="$(ls -t dist/*-arm64-mac.zip 2>/dev/null | head -n 1 || true)"
if [[ -z "$ZIP_PATH" ]]; then
  echo "No arm64 mac ZIP artifact found in dist." >&2
  find dist -maxdepth 2 -type f | sed 's#^#- #'
  exit 1
fi

TMP_DIR="$(mktemp -d)"
unzip -q "$ZIP_PATH" -d "$TMP_DIR"

APP_PATH="$(find "$TMP_DIR" -maxdepth 3 -type d -name "TIA Voice.app" | head -n 1)"
if [[ -z "$APP_PATH" ]]; then
  echo "Could not locate TIA Voice.app after unzipping $ZIP_PATH." >&2
  find "$TMP_DIR" -maxdepth 5 -print || true
  exit 1
fi

pnpm run verify:packaged-runtime-deps -- "$APP_PATH"

SIGNED_APP_PATH="$(find dist -maxdepth 3 -type d -name "TIA Voice.app" | head -n 1)"
if [[ -z "$SIGNED_APP_PATH" ]]; then
  echo "Could not find a built .app bundle in dist." >&2
  find dist -maxdepth 3 -print || true
  exit 1
fi

pnpm run verify:packaged-runtime-deps -- "$SIGNED_APP_PATH"
codesign --verify --deep --strict --verbose=2 "$SIGNED_APP_PATH"
spctl -a -vvv --type exec "$SIGNED_APP_PATH"
xcrun stapler validate "$SIGNED_APP_PATH"

echo "Local production build completed successfully for $RELEASE_TAG"
