# Render PostgreSQL 到腾讯云 PostgreSQL 迁移 Runbook

> 迁移必须安排独立变更窗口。本文命令中的连接信息存放在受限环境文件中，不写入 Git、日志或工单正文。

## Go/No-Go 前置条件

- [ ] 迁移负责人、复核人、业务确认人和回退决策人已确认。
- [ ] 源/目标数据库、Git SHA、Prisma schema hash、迁移版本和磁盘容量已记录。
- [ ] CVM、HTTPS、COS、监控、备份和恢复测试全部通过。
- [ ] 源库与测试恢复库的 manifest 比对阻断项为 0。
- [ ] Excel 导入、金额汇总、PDF/PNG、签名证据和角色权限验收通过。
- [ ] 维护窗口、DNS TTL、通知和回退截止时间已确认。

## 1. 只读预检

```bash
pnpm migration:preflight --phase=rehearsal \
  --source-url="$SOURCE_DATABASE_URL" \
  --target-url="$RESTORE_TEST_DATABASE_URL" \
  --output=/data/xjd-finance/migration/preflight-rehearsal.json
pnpm migration:manifest --database-url="$SOURCE_DATABASE_URL" \
  --output=/data/xjd-finance/migration/source-before.json
```

检查 PostgreSQL 主版本、编码、时区、collation、迁移状态、业务表和可用磁盘。源库预检不得执行写操作。

## 2. 迁移前备份

1. 开启应用维护模式，阻止业务写入。
2. 使用 PostgreSQL 17 `pg_dump --format=custom` 导出。
3. 生成 `.sha256` 和 JSON 元数据。
4. 执行 `pg_restore --list` 验证归档结构。
5. 上传私有 COS，并从 COS 抽样下载后再次校验 SHA-256。

```bash
bash ./scripts/maintenance-on.sh
bash ./scripts/backup-tencent.sh
```

迁移 Render 源库时使用独立的只读/备份凭据执行同等 `pg_dump` 流程。

## 3. 测试恢复

目标库名必须包含 `_restore`、`_test` 或 `_staging`，且必须为空库：

```bash
pnpm tsx scripts/restore-postgres-db.ts \
  --file=/secure/source.dump \
  --source-url="$SOURCE_DATABASE_URL" \
  --target-url="$RESTORE_TEST_DATABASE_URL" \
  --output-dir=/data/xjd-finance/migration/restore-test

pnpm migration:compare \
  --source=/data/xjd-finance/migration/source-before.json \
  --target=/data/xjd-finance/migration/restore-test/manifest.json \
  --output=/data/xjd-finance/migration/compare-rehearsal.json
```

核对订单、RawLedgerLine、FinanceChargeLine、应收、应付、毛利、导入批次、用户、确认单、签名证据、附件字节数、锁账状态和迁移校验和。任何阻断差异均为 No-Go。

## 4. 正式迁移窗口

1. 通知用户并开启维护模式。
2. 等待现有请求结束，确认没有新的导入、签名、收付款或锁账写入。
3. 执行 `migration:preflight --phase=cutover`；维护模式、磁盘、扩展、编码、版本和空目标库均必须通过。
4. 对源库做最终 custom-format 备份并验证 SHA-256。
5. 将归档恢复到全新腾讯云正式数据库。
6. 执行 `prisma migrate deploy`，不得运行 reset 或 db push。
7. 分别生成源库最终 manifest 和目标库 manifest，保存 JSON 比对报告，并要求阻断项为 0。
8. 启动后端/Nginx，执行只读验收和指定的业务抽样。
9. 验收通过后关闭维护模式，再切换 DNS。

## 5. 切换后观察

- 先验证 `/api/health` 的 Git SHA、数据库迁移版本和维护状态。
- 逐项验证登录、月份、Dashboard、原始行追溯、确认单下载和签名。
- 观察 24 至 72 小时的 5xx、P95、数据库连接、磁盘、备份和金额核对。
- 保留 Render 源库只读，不立即删除。

## 6. 回退原则

DNS 尚未切换时，直接停止新环境并修复。DNS 已切换且新环境产生写入后，不做自动数据库回滚；先进入维护模式，导出新写入并由负责人决定补偿迁移或回切。应用版本可用 `rollback-tencent.sh` 回滚，数据库恢复必须独立审批。
