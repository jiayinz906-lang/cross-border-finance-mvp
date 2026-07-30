#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/xjd-finance}"
POSTGRES_DATA_DIR="${POSTGRES_DATA_DIR:-/data/xjd-finance/postgres}"
HTTP_PORT="${HTTP_PORT:-18080}"
PUBLIC_IP="${PUBLIC_IP:-49.235.108.203}"
REPOSITORY_URL="${REPOSITORY_URL:-https://github.com/jiayinz906-lang/cross-border-finance-mvp.git}"
SWAP_FILE="${SWAP_FILE:-/swapfile-xjd}"
SWAP_SIZE_GB="${SWAP_SIZE_GB:-3}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this deployment script as root." >&2
  exit 1
fi

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

require_command docker
require_command git
require_command curl
require_command openssl
docker compose version >/dev/null

if ! grep -q "^${SWAP_FILE//\//\\/}[[:space:]]" /proc/swaps 2>/dev/null; then
  if [ ! -f "$SWAP_FILE" ]; then
    if command -v fallocate >/dev/null 2>&1; then
      fallocate -l "${SWAP_SIZE_GB}G" "$SWAP_FILE"
    else
      dd if=/dev/zero of="$SWAP_FILE" bs=1M count="$((SWAP_SIZE_GB * 1024))" status=progress
    fi
    chmod 600 "$SWAP_FILE"
    mkswap "$SWAP_FILE"
  fi
  swapon "$SWAP_FILE"
fi
grep -qF "$SWAP_FILE none swap sw 0 0" /etc/fstab || echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab

mkdir -p "$APP_DIR" "$POSTGRES_DATA_DIR"
chmod 700 "$POSTGRES_DATA_DIR"

if [ ! -d "$APP_DIR/.git" ]; then
  if [ -n "$(find "$APP_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
    echo "$APP_DIR exists and is not an empty Git checkout; stopping." >&2
    exit 1
  fi
  git clone --depth 1 "$REPOSITORY_URL" "$APP_DIR"
else
  current_remote="$(cd "$APP_DIR" && git config --get remote.origin.url || true)"
  [ "$current_remote" = "$REPOSITORY_URL" ] || { echo "Unexpected Git remote: $current_remote" >&2; exit 1; }
  (cd "$APP_DIR" && git fetch origin main && git checkout main && git reset --hard origin/main)
fi

cd "$APP_DIR"
umask 077

if [ ! -f .env.production ]; then
  db_password="$(openssl rand -hex 24)"
  auth_secret="$(openssl rand -hex 48)"
  admin_password="$(openssl rand -hex 12)"
  cat > .env.production <<EOF
POSTGRES_DB=xjd_finance
POSTGRES_USER=xjd_finance_user
POSTGRES_PASSWORD=${db_password}
DATABASE_URL=postgresql://xjd_finance_user:${db_password}@postgres:5432/xjd_finance?schema=public
POSTGRES_DATA_DIR=${POSTGRES_DATA_DIR}
HTTP_PORT=${HTTP_PORT}
PORT=4000
NODE_ENV=production
AUTH_TOKEN_SECRET=${auth_secret}
AUTH_REQUIRE_TOKEN=true
ALLOW_HEADER_ROLE=false
CORS_ALLOWED_ORIGINS=http://${PUBLIC_IP}:${HTTP_PORT}
PUBLIC_APP_URL=http://${PUBLIC_IP}:${HTTP_PORT}/
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_DISPLAY_NAME=系统管理员
BOOTSTRAP_ADMIN_PASSWORD=${admin_password}
ENABLE_LEGACY_DEFAULT_USERS=false
FINANCE_TEST_USERNAME=
FINANCE_TEST_PASSWORD=
UPLOAD_MAX_MB=25
IMAGE_UPLOAD_MAX_MB=10
HEALTH_DB_TIMEOUT_MS=5000
SLOW_REQUEST_THRESHOLD_MS=2000
HTTP_REQUEST_TIMEOUT_MS=120000
DB_BACKUP_OUTPUT_DIR=outputs/db-backups
WECOM_WEBHOOK_URL=
DINGTALK_WEBHOOK_URL=
DINGTALK_WEBHOOK_SECRET=
DINGTALK_APP_KEY=
DINGTALK_APP_SECRET=
DINGTALK_ROBOT_CODE=
EOF

  cat > /root/xjd-finance-credentials.txt <<EOF
Application: http://${PUBLIC_IP}:${HTTP_PORT}/
Username: admin
Initial password: ${admin_password}
Created at: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
  chmod 600 /root/xjd-finance-credentials.txt
else
  sed -i "s|^POSTGRES_DATA_DIR=.*|POSTGRES_DATA_DIR=${POSTGRES_DATA_DIR}|" .env.production
  sed -i "s|^HTTP_PORT=.*|HTTP_PORT=${HTTP_PORT}|" .env.production
  sed -i "s|^CORS_ALLOWED_ORIGINS=.*|CORS_ALLOWED_ORIGINS=http://${PUBLIC_IP}:${HTTP_PORT}|" .env.production
  sed -i "s|^PUBLIC_APP_URL=.*|PUBLIC_APP_URL=http://${PUBLIC_IP}:${HTTP_PORT}/|" .env.production
fi

docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build

for attempt in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${HTTP_PORT}/api/health" >/tmp/xjd-finance-health.json 2>/dev/null; then
    cat /tmp/xjd-finance-health.json
    echo
    docker compose --env-file .env.production -f docker-compose.prod.yml ps
    echo "Credentials: /root/xjd-finance-credentials.txt"
    exit 0
  fi
  sleep 2
done

echo "Health check failed after 180 seconds." >&2
docker compose --env-file .env.production -f docker-compose.prod.yml ps >&2 || true
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=200 >&2 || true
exit 1
