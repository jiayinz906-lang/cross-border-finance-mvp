#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${TENCENT_ENV_FILE:-$ROOT_DIR/.env.tencent}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.tencent.yml"
DRY_RUN=false
UPLOAD=true
for arg in "$@"; do
  case "$arg" in --dry-run) DRY_RUN=true ;; --no-upload) UPLOAD=false ;; --env-file=*) ENV_FILE="${arg#*=}" ;; *) echo "Unknown argument: $arg" >&2; exit 2 ;; esac
done
[[ -f "$ENV_FILE" ]] || { echo "Environment file not found: $ENV_FILE" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"
OUTPUT_DIR="${DB_BACKUP_OUTPUT_DIR:-${BACKUP_OUTPUT_DIR:-/data/xjd-finance/backups}}"
mkdir -p "$OUTPUT_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
base="xjd-finance-${POSTGRES_DB}-${timestamp}"
archive="$OUTPUT_DIR/$base.dump"

if $DRY_RUN; then
  echo "DRY RUN: would create custom-format backup in $OUTPUT_DIR, verify it, write SHA-256/metadata, and upload=$UPLOAD."
  exit 0
fi

tmp="$archive.partial"
trap 'rm -f "$tmp"' EXIT
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres \
  pg_dump --format=custom --no-owner --no-privileges --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" > "$tmp"
[[ -s "$tmp" ]] || { echo "Backup archive is empty." >&2; exit 1; }
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T postgres pg_restore --list < "$tmp" >/dev/null
mv "$tmp" "$archive"
sha="$(sha256sum "$archive" | awk '{print $1}')"
printf '%s  %s\n' "$sha" "$(basename "$archive")" > "$archive.sha256"
size="$(stat -c '%s' "$archive")"
printf '{\n  "createdAt": "%s",\n  "database": "%s",\n  "archive": "%s",\n  "bytes": %s,\n  "sha256": "%s",\n  "format": "pg_dump-custom"\n}\n' \
  "$(date -u +%FT%TZ)" "$POSTGRES_DB" "$(basename "$archive")" "$size" "$sha" > "$archive.json"
echo "Backup created and verified: $archive"
if $UPLOAD && [[ "${COS_BACKUP_ENABLED:-false}" == "true" ]]; then
  "$ROOT_DIR/scripts/upload-backup-to-cos.sh" --env-file="$ENV_FILE" --file="$archive"
else
  echo "COS upload skipped; local backup retained."
fi
trap - EXIT
