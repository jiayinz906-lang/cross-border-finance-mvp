#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/tencent-common.sh"
xjd_load_env
[[ "$(stat -c '%a' "$XJD_ENV_FILE")" == "600" ]] || { echo ".env.tencent must have mode 600." >&2; exit 1; }
grep -q 'CHANGE_ME' "$XJD_ENV_FILE" && { echo "CHANGE_ME remains in .env.tencent." >&2; exit 1; }
[[ "${NODE_ENV:-}" == "production" && "${AUTH_REQUIRE_TOKEN:-}" == "true" && "${ALLOW_HEADER_ROLE:-}" == "false" && "${ENABLE_LEGACY_DEFAULT_USERS:-}" == "false" ]] || { echo "Production auth flags are invalid." >&2; exit 1; }
[[ "${#AUTH_TOKEN_SECRET}" -ge 64 ]] || { echo "AUTH_TOKEN_SECRET must contain at least 64 characters." >&2; exit 1; }
[[ "${PUBLIC_APP_URL:-}" == https://* ]] || { echo "PUBLIC_APP_URL must use HTTPS." >&2; exit 1; }
[[ "${CORS_ALLOWED_ORIGINS:-}" != *'*'* && "${CORS_ALLOWED_ORIGINS:-}" == https://* ]] || { echo "CORS_ALLOWED_ORIGINS must be explicit HTTPS origins." >&2; exit 1; }
[[ "${DATABASE_URL:-}" != *localhost* && "${DATABASE_URL:-}" != *render.com* ]] || { echo "DATABASE_URL points to a forbidden production host." >&2; exit 1; }
[[ -f "${TLS_CERT_HOST_DIR:-$XJD_ROOT/certs}/fullchain.pem" && -f "${TLS_CERT_HOST_DIR:-$XJD_ROOT/certs}/privkey.pem" ]] || { echo "TLS certificate files are missing." >&2; exit 1; }
command -v docker >/dev/null; docker compose version >/dev/null
for directory in "$POSTGRES_DATA_DIR" "${BACKUP_OUTPUT_DIR:-/data/xjd-finance/backups}"; do
  [[ "$directory" == /data/* ]] || { echo "Production data directory must be under /data: $directory" >&2; exit 1; }
  mkdir -p "$directory"; [[ -w "$directory" ]] || { echo "Directory is not writable: $directory" >&2; exit 1; }
done
free_kb="$(df -Pk "$POSTGRES_DATA_DIR" | awk 'NR==2{print $4}')"; [[ "$free_kb" -ge 5242880 ]] || { echo "Less than 5 GiB free on data disk." >&2; exit 1; }
TENCENT_ENV_FILE="$XJD_ENV_FILE" docker compose --env-file "$XJD_ENV_FILE" -f "$XJD_COMPOSE_FILE" config >/dev/null
echo "Tencent deployment preflight passed. No database changes were made."
