#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/tencent-common.sh"
xjd_lock; xjd_load_env
target="${1:-}"; [[ "$target" =~ ^[0-9a-f]{7,40}$ ]] || { echo "Usage: rollback-tencent.sh <git-sha-or-image-tag>" >&2; exit 2; }
record="/data/xjd-finance/releases/${target:0:12}.json"; [[ -f "$record" ]] || { echo "Release record not found: $record" >&2; exit 1; }
current_migration="$(curl --fail --silent "https://${SERVER_NAME}/api/health" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).databaseMigration||'unknown'))")"
release_migration="$(node -e "console.log(require('$record').databaseMigration||'unknown')")"
[[ "$current_migration" == "$release_migration" ]] || { echo "BLOCKED: database migration differs from target release. Follow the database recovery runbook manually." >&2; exit 2; }
bash "$XJD_ROOT/scripts/maintenance-on.sh"
xjd_set_env IMAGE_TAG "${target:0:12}"; xjd_set_env BUILD_GIT_SHA "$target"
xjd_load_env; xjd_compose up -d --no-deps --force-recreate backend nginx
xjd_wait_health 60
pnpm verify:production-readonly -- --env-file="$XJD_ENV_FILE" --app-url="https://${SERVER_NAME}" --database-url="$DATABASE_URL"
bash "$XJD_ROOT/scripts/maintenance-off.sh"
echo "Application rollback completed. Database was not changed."
