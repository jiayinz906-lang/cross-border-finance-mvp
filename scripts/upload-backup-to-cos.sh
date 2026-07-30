#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TENCENT_ENV_FILE:-$ROOT_DIR/.env.tencent}"
FILE=""; DRY_RUN=false
for arg in "$@"; do case "$arg" in --env-file=*) ENV_FILE="${arg#*=}" ;; --file=*) FILE="${arg#*=}" ;; --dry-run) DRY_RUN=true ;; *) echo "Unknown argument: $arg" >&2; exit 2 ;; esac; done
[[ -f "$ENV_FILE" ]] || { echo "Environment file not found." >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${COS_BUCKET:?COS_BUCKET is required}"
: "${COS_REGION:?COS_REGION is required}"
: "${COSCLI_CONFIG_PATH:?COSCLI_CONFIG_PATH is required and must remain outside Git}"
[[ -f "$COSCLI_CONFIG_PATH" ]] || { echo "coscli config not found." >&2; exit 1; }
[[ -f "$FILE" && -f "$FILE.sha256" && -f "$FILE.json" ]] || { echo "Backup and sidecars are required." >&2; exit 1; }
command -v coscli >/dev/null || { echo "coscli is not installed." >&2; exit 1; }
prefix="${COS_PREFIX:-xjd-finance/database}/$(date -u +%Y/%m/%d)"
remote="cos://${COS_BUCKET}/${prefix}"
if $DRY_RUN; then echo "DRY RUN: would upload three private backup objects to $remote (credentials hidden)."; exit 0; fi
for item in "$FILE" "$FILE.sha256" "$FILE.json"; do
  coscli --config-path "$COSCLI_CONFIG_PATH" cp "$item" "$remote/$(basename "$item")" >/dev/null
done
"$ROOT_DIR/scripts/verify-cos-backup.sh" --env-file="$ENV_FILE" --file="$FILE"
echo "COS upload verified. Local backup retained: $FILE"
