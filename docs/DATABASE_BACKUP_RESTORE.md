# PostgreSQL 备份与恢复

## 备份

```bash
bash ./scripts/backup-tencent.sh
bash ./scripts/backup-tencent.sh --no-upload
bash ./scripts/backup-tencent.sh --dry-run
```

脚本输出 custom-format `.dump`、`.sha256` 和 `.json` 元数据，并执行 `pg_restore --list`。启用 `COS_BACKUP_ENABLED=true` 后，再上传到私有 COS。

建议保留策略：本机日备 14 天、COS 日备 30 天、月备 12 个月。COS 使用生命周期规则和服务端加密，访问密钥只授予指定前缀的上传/下载权限。

## 定时任务

将 `ops/systemd/xjd-finance-backup.service` 和 `.timer` 安装到 `/etc/systemd/system/` 后：

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now xjd-finance-backup.timer
systemctl list-timers xjd-finance-backup.timer
```

## 恢复前检查

- 使用 PostgreSQL 17 客户端，确认 `pg_restore --version` 可用。
- 校验 `.sha256`，执行 `pg_restore --list`。
- 恢复目标必须是新建空库，名称包含 `_test`、`_staging` 或 `_restore`。
- 记录源归档、目标库、执行人、审批单和恢复时间。

## 测试恢复

```bash
pnpm tsx scripts/restore-postgres-db.ts \
  --file=/secure/xjd-finance.dump \
  --source-url="$SOURCE_DATABASE_URL" \
  --target-url="$RESTORE_TEST_DATABASE_URL" \
  --output-dir=/data/xjd-finance/restore-test
```

脚本拒绝覆盖正式库、拒绝源目标相同、拒绝非空目标和缺少 SHA-256 的归档。恢复后必须生成 manifest 并与源库比较。

## 恢复验收

```bash
pnpm migration:manifest --database-url="$SOURCE_DATABASE_URL" --output=source.json
pnpm migration:manifest --database-url="$RESTORE_TEST_DATABASE_URL" --output=target.json
pnpm migration:compare --source=source.json --target=target.json
```

同时抽查登录、月份、订单、费用行、金额、确认单、签名证据、锁账状态和附件。至少每季度执行一次恢复演练并保存日志。

## 禁止事项

- 禁止直接恢复到正在使用的正式库。
- 禁止执行 `prisma migrate reset`、`prisma db push` 或正式环境 `down -v`。
- 禁止只确认“文件存在”而不验证 SHA、归档列表和实际恢复。
- 禁止把数据库密码、归档或签名附件提交到 Git。
