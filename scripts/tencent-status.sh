#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/tencent-common.sh"
xjd_load_env
xjd_compose ps
echo "--- backend health ---"
curl --fail --silent --show-error "https://${SERVER_NAME}/api/health" | sed -E 's/(token|password|secret|databaseUrl)"?:"[^"]+"/\1":"[redacted]"/gi'
echo
echo "--- data disk ---"; df -h "$POSTGRES_DATA_DIR"
echo "--- latest local backup ---"; find "${BACKUP_OUTPUT_DIR:-/data/xjd-finance/backups}" -maxdepth 1 -name '*.dump' -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' 2>/dev/null | sort | tail -1 || true
