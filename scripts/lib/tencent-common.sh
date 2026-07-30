#!/usr/bin/env bash
set -Eeuo pipefail

XJD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
XJD_ENV_FILE="${TENCENT_ENV_FILE:-$XJD_ROOT/.env.tencent}"
XJD_COMPOSE_FILE="$XJD_ROOT/docker-compose.tencent.yml"

xjd_compose() { docker compose --env-file "$XJD_ENV_FILE" -f "$XJD_COMPOSE_FILE" "$@"; }
xjd_require_env() { [[ -f "$XJD_ENV_FILE" ]] || { echo "Missing environment file: $XJD_ENV_FILE" >&2; exit 1; }; }
xjd_load_env() { xjd_require_env; set -a; source "$XJD_ENV_FILE"; set +a; }
xjd_set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v key="$key" -v value="$value" 'BEGIN{found=0} $0 ~ "^" key "=" {print key "=" value; found=1; next} {print} END{if(!found) print key "=" value}' "$XJD_ENV_FILE" > "$tmp"
  cat "$tmp" > "$XJD_ENV_FILE"; rm -f "$tmp"; chmod 600 "$XJD_ENV_FILE"
}
xjd_lock() {
  local lock_dir="${XJD_DEPLOY_STATE_DIR:-/data/xjd-finance/.deploy}"
  mkdir -p "$lock_dir"
  exec 9>"$lock_dir/deploy.lock"
  flock -n 9 || { echo "Another XJD Finance deployment is already running." >&2; exit 1; }
}
xjd_wait_health() {
  local attempts="${1:-60}"
  for ((i=1;i<=attempts;i++)); do
    if xjd_compose exec -T backend node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then return 0; fi
    sleep 2
  done
  echo "Backend health check timed out." >&2; return 1
}
