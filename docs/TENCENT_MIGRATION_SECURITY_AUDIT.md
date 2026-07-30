# 腾讯云迁移安全审核

审核日期：2026-07-29  
审核范围：本地仓库、Docker 构建、腾讯云 Compose、Nginx、PostgreSQL 迁移脚本、备份恢复和验收流程。  
边界：本轮未连接、写入或修改腾讯云、Render、GitHub Pages 及其数据库。

## 审核结论

当前代码已具备提交**迁移演练审核**的基础条件；正式切流仍须满足本文件的 Go/No-Go 条件。Docker 构建不连接数据库、不执行 `db push`，生产数据库统一为 PostgreSQL，数据库仅在内部 Docker 网络可达，应用写接口启用 Token/RBAC，迁移前后可生成可机器核对的财务 manifest。

## 本地审核结果（2026-07-29）

| 验证项 | 结果 | 证据 |
| --- | --- | --- |
| 完整前后端与财务闭环 | 通过 | `pnpm verify:all`，包含构建、角色隔离、原始台账、费用行、签名证据、收付款、锁账、回滚、手工 ERP 单据与图片凭证。 |
| 迁移工具阻断能力 | 通过 | `pnpm verify:migration-tooling`，已验证一致数据通过、财务差异阻断、行 ID 范围差异阻断和环境警告。 |
| 生产依赖高危漏洞门禁 | 通过 | `pnpm audit --prod --audit-level high`；高危 0，仍有 1 个低危和 3 个中危待常规依赖升级处理。 |
| 腾讯云 Compose 静态校验 | 通过 | `.env.tencent.example` + `docker-compose.tencent.yml` 可被 Compose 正常解析。 |
| PostgreSQL 本地恢复演练 | 通过 | PostgreSQL 17 源库到一次性 PostgreSQL 17 目标库；预检、custom dump、恢复及 manifest 比对全部通过。 |
| 演练一致性 | 通过 | blockers=0、warnings=0、consistent=56；证据位于 `outputs/migration/rehearsal-20260729-135259/`。 |

演练业务 dump 已在校验完成后清空，仅保留脱敏的预检、manifest 和比对报告。该结果证明工具链可用，不等同于正式腾讯云迁移授权。

## 已关闭问题

| 项目 | 风险 | 处理结果 |
| --- | --- | --- |
| 构建阶段连接数据库 | 高 | Dockerfile 仅安装、Prisma generate、前后端 build；迁移由独立 profile 显式执行。 |
| SQLite/生产 PostgreSQL 冲突 | 高 | 腾讯云配置只接受 PostgreSQL `DATABASE_URL`，并拒绝 localhost/Render 地址。 |
| 镜像供应链漂移 | 高 | Node、Nginx、PostgreSQL 均固定版本和镜像 digest。 |
| 目标库误覆盖 | 高 | 预检要求源/目标身份不同、目标业务表为空、源迁移健康。 |
| 财务数据迁移后不可证明一致 | 高 | manifest 核对表行数与 ID 范围、财务总额、月度订单、签名证据、锁账和 migration checksum；阻断差异退出码为 2。 |
| 迁移窗口继续写入 | 高 | `--phase=cutover` 强制维护模式；写操作由维护中间件阻断。 |
| 备份无法验证 | 高 | custom-format dump、`pg_restore --list`、SHA-256、元数据、COS 回下载校验。 |
| 生产鉴权弱配置 | 高 | 腾讯环境强制 `AUTH_REQUIRE_TOKEN=true`、`ALLOW_HEADER_ROLE=false`、禁用默认测试用户、Token 密钥不少于 64 字符。 |
| 容器权限过大 | 中 | 后端以非 root 用户运行；业务容器只读根文件系统、`no-new-privileges`、受限 tmpfs。 |
| Web 基础防护缺失 | 中 | HTTPS、HSTS、CSP、登录/签名限流、上传大小限制和敏感路径拒绝。 |
| 比对脚本输出不可归档 | 中 | 支持 `--output` 生成权限受限 JSON 审核报告，并新增自动化用例。 |

## 已知风险与处理决定

1. **金额字段仍有历史 Float**：这是现有生产数据模型，不在迁移窗口直接变更。迁移按原值复制并以 manifest 财务总额做零差异核对。Decimal 改造必须单独设计、双算验证和审批，不能与云迁移叠加。
2. **PostgreSQL 主版本可升级不可降级**：预检允许目标主版本不低于源库；最终仍通过 custom dump 测试恢复和 manifest 零差异证明兼容性。
3. **本机/云端备份归档本身未由脚本二次加密**：正式环境必须使用腾讯云加密云硬盘、私有 COS、服务端加密及最小权限 CAM。若企业制度要求客户端加密，应在切流前增加 KMS/加密归档任务。
4. **运行镜像包含迁移所需工具链**：网络不暴露迁移容器，迁移 profile 仅一次性运行。后续可拆分专用 migration image 进一步减小生产镜像。

## 正式迁移 Go/No-Go

以下任一项不满足即 No-Go：

- 审核 Git SHA 与服务器检出 SHA 不一致，或工作区不干净。
- `.env.tencent` 权限不是 600、仍含占位符，或真实密钥进入 Git/日志。
- 安全组开放 4000、5432、Docker API，或 22 未限制管理来源。
- TLS、私有 COS、加密数据盘、监控告警、备份回下载恢复演练未通过。
- `migration:preflight --phase=cutover` 有阻断项。
- 源/测试恢复、源最终/目标最终 manifest 比对有阻断项。
- 登录、角色权限、月份、Dashboard、原始数据追溯、PDF/PNG、签名日志、收付款和锁账验收未通过。
- 未明确业务负责人、技术执行人、复核人和回退决策人。

## 审核证据

变更单必须附：Git SHA、镜像 digest、Compose config、预检 JSON、源/目标 manifest、比对 JSON、备份 SHA-256、COS 校验结果、只读验收 JSON、角色验收结果和回退演练记录。证据中数据库 URL、密码、Token、SecretKey 必须脱敏。
