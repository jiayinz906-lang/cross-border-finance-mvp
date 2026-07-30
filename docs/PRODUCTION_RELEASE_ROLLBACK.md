# 生产发布与回滚

## 发布前

```bash
bash ./scripts/tencent-preflight.sh
bash ./scripts/backup-tencent.sh
```

确认 Git SHA、变更单、备份、数据库容量、TLS、监控、维护窗口、审批人和回退版本。禁止从存在未提交修改的工作区发布。

## 正式发布

```bash
bash ./scripts/deploy-tencent.sh
```

发布脚本会取得 `/data/xjd-finance/.deploy` 锁，开启维护模式，备份数据库，拉取指定版本，构建镜像，显式执行 Prisma migration，启动服务并检查 HTTPS、健康状态和版本。任一步失败都保留维护模式。

## 发布后验收

```bash
bash ./scripts/tencent-status.sh
pnpm verify:production-readonly \
  --app-url="https://<正式域名>" \
  --database-url="$DATABASE_URL" \
  --output=/data/xjd-finance/releases/post-verify.json
```

验收登录、月份、Dashboard、财务汇总、文件下载、签名页、审计日志和健康信息，确认后再关闭维护模式。

## 应用回滚

```bash
bash ./scripts/rollback-tencent.sh <previous-git-sha>
```

该脚本只回滚应用版本，不自动恢复数据库。若新版本已经写入不兼容数据，必须保持维护模式并由数据库负责人制定独立恢复或补偿方案。

## 紧急停止

```bash
bash ./scripts/maintenance-on.sh
docker compose --env-file .env.tencent -f docker-compose.tencent.yml stop backend nginx
```

故障期间保留 PostgreSQL 和备份目录，不删除卷或绑定目录。事件结束后更新事故记录和 Runbook。
