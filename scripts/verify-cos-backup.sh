#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TENCENT_ENV_FILE:-$ROOT_DIR/.env.tencent}"; FILE=""
for arg in "$@"; do case "$arg" in --env-file=*) ENV_FILE="${arg#*=}" ;; --file=*) FILE="${arg#*=}" ;; *) echo "Unknown argument: $arg" >&2; exit 2 ;; esac; done
set -a; source "$ENV_FILE"; set +a
: "${COS_BUCKET:?COS_BUCKET is required}"; : "${COSCLI_CONFIG_PATH:?COSCLI_CONFIG_PATH is required}"
[[ -f "$FILE" && -f "$FILE.sha256" && -f "$FILE.json" ]] || { echo "Local backup and sidecars are required for remote integrity verification." >&2; exit 1; }
prefix="${COS_PREFIX:-xjd-finance/database}/$(date -u +%Y/%m/%d)"
listing="$(coscli --config-path "$COSCLI_CONFIG_PATH" ls "cos://${COS_BUCKET}/${prefix}/")"
for suffix in "" ".sha256" ".json"; do grep -F "$(basename "$FILE")$suffix" <<<"$listing" >/dev/null || { echo "Remote object missing: $(basename "$FILE")$suffix" >&2; exit 1; }; done
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
for suffix in "" ".sha256" ".json"; do
  coscli --config-path "$COSCLI_CONFIG_PATH" cp "cos://${COS_BUCKET}/${prefix}/$(basename "$FILE")$suffix" "$tmp_dir/$(basename "$FILE")$suffix" >/dev/null
done
expected="$(awk '{print $1}' "$tmp_dir/$(basename "$FILE").sha256")"
actual="$(sha256sum "$tmp_dir/$(basename "$FILE")" | awk '{print $1}')"
[[ -n "$expected" && "$expected" == "$actual" ]] || { echo "Remote backup SHA-256 verification failed." >&2; exit 1; }
cmp -s "$FILE.json" "$tmp_dir/$(basename "$FILE").json" || { echo "Remote backup metadata differs from the local sidecar." >&2; exit 1; }
if [[ "${COS_REQUIRE_SERVER_SIDE_ENCRYPTION:-true}" == "true" ]]; then
  stat_output="$(coscli --config-path "$COSCLI_CONFIG_PATH" stat "cos://${COS_BUCKET}/${prefix}/$(basename "$FILE")")"
  grep -Eiq 'server[-_ ]side[-_ ]encryption|x-cos-server-side-encryption|SSE-(COS|KMS)|AES256|KMS' <<<"$stat_output" \
    || { echo "Remote backup encryption metadata was not detected; COS verification blocked." >&2; exit 1; }
fi
echo "Remote backup downloaded, SHA-256 verified, metadata matched, and encryption policy checked."
