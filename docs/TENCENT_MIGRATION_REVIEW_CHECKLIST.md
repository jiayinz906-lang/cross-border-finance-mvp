# 腾讯云迁移变更审核清单

## 1. 人员与职责

| 职责 | 要求 | 可兼任 |
| --- | --- | --- |
| 业务批准人 | 确认维护窗口、金额抽样和切流 | 不与技术执行人兼任 |
| 技术执行人 | 执行已审核命令，不拥有长期业务管理员密码 | 否 |
| 技术复核人 | 核对 SHA、manifest、备份和回退条件 | 不与执行人兼任 |
| 回退决策人 | 在截止时间前做继续/回退决定 | 可由业务批准人担任 |

## 2. 最小权限申请矩阵

审核通过后再由企业管理员授予；本清单本身不创建权限。

| 身份 | 最小权限 | 明确禁止 |
| --- | --- | --- |
| CVM 运维账号 `xjd-deploy` | SSH 密钥登录；读取 `/opt/xjd-finance`；管理指定 Compose 项目；写 `/data/xjd-finance` 和证书目录；查看指定服务日志 | root 密码登录、修改其他实例、读取业务用户密码 |
| 源库导出账号 `xjd_migration_reader` | 数据库 CONNECT；public schema USAGE；业务表 SELECT；sequence SELECT；读取 migration 元数据 | INSERT/UPDATE/DELETE/DDL、创建角色、修改源库 |
| 目标迁移账号 `xjd_migration_owner` | 仅迁移窗口内对目标库 CREATE/ALTER/INSERT 和 migration deploy | 访问其他数据库、长期用于应用连接 |
| 目标应用账号 `xjd_finance_app` | 运行所需 CONNECT、schema USAGE、业务表 DML、sequence USAGE | CREATEDB、CREATEROLE、SUPERUSER、复制权限 |
| COS 备份账号 | 指定私有桶和 `xjd-finance/database/` 前缀的 Put/Get/Head/List；服务端加密 | 公共读、删除整个桶、访问其他前缀 |
| DNS/证书账号 | 仅指定域名记录和证书部署 | 全账号资源管理 |

### 2.1 PostgreSQL 临时账号授权模板

以下命令由数据库管理员在审核批准后执行；数据库名、密码和有效期必须替换，密码不得写入仓库或工单正文。

源库只读导出账号：

```sql
CREATE ROLE xjd_migration_reader LOGIN PASSWORD '<SECRET>' VALID UNTIL '<CUTOVER_END>';
GRANT CONNECT ON DATABASE xjd_finance TO xjd_migration_reader;
GRANT USAGE ON SCHEMA public TO xjd_migration_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO xjd_migration_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO xjd_migration_reader;
```

目标迁移账号与运行账号（应在目标库创建时设置迁移账号为 owner）：

```sql
CREATE ROLE xjd_migration_owner LOGIN PASSWORD '<SECRET>' VALID UNTIL '<CUTOVER_END>';
CREATE ROLE xjd_finance_app LOGIN PASSWORD '<SECRET>';

REVOKE ALL ON DATABASE xjd_finance FROM PUBLIC;
GRANT CONNECT ON DATABASE xjd_finance TO xjd_migration_owner, xjd_finance_app;
GRANT USAGE ON SCHEMA public TO xjd_finance_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO xjd_finance_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO xjd_finance_app;

-- 必须由 xjd_migration_owner 执行，确保迁移后新对象也授权给应用账号。
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO xjd_finance_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO xjd_finance_app;
```

迁移结束且复核通过后：

```sql
ALTER ROLE xjd_migration_reader NOLOGIN;
ALTER ROLE xjd_migration_owner NOLOGIN;
```

`xjd_finance_app` 不授予 `SUPERUSER`、`CREATEDB`、`CREATEROLE`、`REPLICATION` 或 schema `CREATE`。

### 2.2 服务器目录权限

```bash
sudo install -d -o xjd-deploy -g xjd-finance -m 0750 /opt/xjd-finance
sudo install -d -o xjd-deploy -g xjd-finance -m 0750 /data/xjd-finance
sudo install -d -o root -g xjd-finance -m 0750 /etc/xjd-finance
sudo touch /etc/xjd-finance/.env.tencent
sudo chown root:xjd-finance /etc/xjd-finance/.env.tencent
sudo chmod 0640 /etc/xjd-finance/.env.tencent
```

- `xjd-deploy` 只加入指定 Compose 项目所需的运维组；不开放通用 root 密码。
- `.env.tencent` 由 root 管理，容器运行账号只读。
- 腾讯云安全组仅开放 80/443；22 仅允许固定管理出口 IP；4000、5432、2375/2376 不对公网开放。

## 3. 提交审核前自动验证

```bash
pnpm verify:migration-tooling
pnpm build
pnpm audit --prod --audit-level high
TENCENT_ENV_FILE=.env.tencent.example \
  docker compose --env-file .env.tencent.example -f docker-compose.tencent.yml config --quiet
docker build --target backend-runtime -t xjd-finance-backend:audit .
docker build --target frontend-runtime -t xjd-finance-frontend:audit .
```

生产凭据环境另执行：

```bash
bash ./scripts/tencent-preflight.sh
pnpm migration:preflight --phase=rehearsal \
  --source-url="$SOURCE_DATABASE_URL" \
  --target-url="$RESTORE_TEST_DATABASE_URL" \
  --output=/data/xjd-finance/migration/preflight-rehearsal.json
```

## 4. 审核授权门

只有在负责人确认以下内容后才能授予迁移权限并执行远程操作：

- [ ] 变更编号、维护窗口、Git SHA、执行人与复核人已填写。
- [ ] 上一节全部自动验证通过。
- [ ] 迁移演练恢复成功，manifest 阻断项为 0。
- [ ] 备份已上传私有 COS并完成回下载 SHA 校验。
- [ ] 回退步骤、回退截止时间和旧环境保留周期已批准。
- [ ] 权限按矩阵设置了到期时间，迁移结束后回收目标迁移账号和临时 CAM 权限。

## 5. 变更结束

- [ ] 保存发布 SHA、镜像 digest、migration 版本和只读验收报告。
- [ ] 观察期内旧环境保持只读，不删除。
- [ ] 回收源库导出、目标迁移和临时 COS/DNS 权限。
- [ ] 验证次日自动备份、COS 校验和告警通知。
- [ ] 在操作日志和变更单中记录执行人、复核人、时间、结果和异常。
