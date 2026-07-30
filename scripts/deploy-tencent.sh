#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/tencent-common.sh"
xjd_lock
cd "$XJD_ROOT"
[[ -z "$(git status --porcelain)" ]] || { echo "Git working tree must be clean." >&2; exit 1; }
sha="$(git rev-parse HEAD)"; tag="${sha:0:12}"; build_time="$(date -u +%FT%TZ)"
bash "$XJD_ROOT/scripts/tencent-preflight.sh"
bash "$XJD_ROOT/scripts/maintenance-on.sh"
trap 'echo "Deployment failed. Maintenance mode remains enabled; backup and logs are preserved." >&2' ERR
bash "$XJD_ROOT/scripts/backup-tencent.sh" --no-upload
latest="$(find "${BACKUP_OUTPUT_DIR:-/data/xjd-finance/backups}" -maxdepth 1 -name '*.dump' -printf '%T@ %p\n' | sort -nr | head -1 | cut -d' ' -f2-)"
[[ -n "$latest" && -f "$latest.sha256" ]] || { echo "Verified pre-migration backup not found." >&2; exit 1; }
xjd_set_env BUILD_GIT_SHA "$sha"; xjd_set_env IMAGE_TAG "$tag"; xjd_set_env BUILD_TIME "$build_time"
xjd_load_env
xjd_compose build --pull backend nginx migrate
xjd_compose --profile migration run --rm migrate
xjd_compose up -d postgres backend
xjd_wait_health 60
xjd_compose up -d nginx
for ((i=1;i<=30;i++)); do curl --fail --silent --show-error "https://${SERVER_NAME}/api/health" >/dev/null && break; [[ $i -eq 30 ]] && exit 1; sleep 2; done
pnpm verify:production-readonly -- --env-file="$XJD_ENV_FILE" --app-url="https://${SERVER_NAME}" --database-url="$DATABASE_URL"
mkdir -p /data/xjd-finance/releases
migration="$(curl --fail --silent "https://${SERVER_NAME}/api/health" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).databaseMigration||'unknown'))")"
printf '{"sha":"%s","tag":"%s","buildTime":"%s","databaseMigration":"%s","backup":"%s"}\n' "$sha" "$tag" "$build_time" "$migration" "$latest" > "/data/xjd-finance/releases/$tag.json"
bash "$XJD_ROOT/scripts/maintenance-off.sh"
trap - ERR
echo "Deployment completed: $sha"
