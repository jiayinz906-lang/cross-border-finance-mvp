#!/usr/bin/env bash
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/tencent-common.sh"
xjd_require_env
xjd_set_env MAINTENANCE_MODE false
if [[ -n "$(xjd_compose ps -q backend 2>/dev/null || true)" ]]; then xjd_compose up -d --no-deps --force-recreate backend; xjd_wait_health 30; fi
echo "Maintenance mode disabled."
