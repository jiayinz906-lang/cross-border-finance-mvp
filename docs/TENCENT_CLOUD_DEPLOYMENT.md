# 腾讯云 CVM 部署说明

> 本文只描述准备和演练步骤。未完成域名、TLS、备份和数据库迁移验收前，不切换现有线上流量。

## 架构

```text
浏览器 --HTTPS--> CVM:443 / Nginx
                         |-- React 静态文件
                         +-- /api --> Backend:4000 --> PostgreSQL:5432
                                                     --> /data/xjd-finance/postgres
pg_dump --> /data/xjd-finance/backups --> 私有 COS
```

公网仅开放 80、443；22 端口仅允许管理 IP。4000、5432 和 Docker API 不对公网开放。

## CVM 上线前清单

- [ ] 绑定独立数据盘并在 `/etc/fstab` 配置按 UUID 自动挂载。
- [ ] 创建 `/data/xjd-finance/{postgres,backups,releases,.deploy}`，限制目录权限。
- [ ] 安装 Docker Engine、Compose v2、Git、curl、PostgreSQL 17 客户端和 coscli。
- [ ] 系统时区设置为 `Asia/Shanghai`，启用 chrony 时间同步。
- [ ] SSH 禁止密码和 root 直登，只使用密钥及普通运维账号。
- [ ] 安全组仅放行 80/443 和受限来源的 22；关闭 4000/5432 公网访问。
- [ ] 域名解析、备案（如适用）、TLS 证书、COS 私有桶和最小权限 CAM 就绪。
- [ ] 完成 CPU、磁盘、数据库、容器、HTTPS 和 API 告警。

## 首次准备

```bash
git clone <approved-repository-url> /opt/xjd-finance
cd /opt/xjd-finance
cp .env.tencent.example .env.tencent
chmod 600 .env.tencent

sudo mkdir -p /data/xjd-finance/{postgres,backups,releases,.deploy}
sudo chown -R "$USER":"$USER" /data/xjd-finance

# 将正式证书放入 certs/fullchain.pem 与 certs/privkey.pem，不提交 Git。
bash ./scripts/tencent-preflight.sh
```

`.env.tencent` 中所有 `CHANGE_ME` 必须替换，密钥至少 64 位随机字符。正式环境不得启用默认测试用户。

## 部署与状态

```bash
bash ./scripts/deploy-tencent.sh
bash ./scripts/tencent-status.sh

docker compose --env-file .env.tencent -f docker-compose.tencent.yml ps
docker compose --env-file .env.tencent -f docker-compose.tencent.yml logs --tail=200 backend nginx postgres
```

发布脚本按“预检、维护模式、备份、构建当前已审核提交、迁移、启动、健康检查、退出维护模式”的顺序执行。脚本不会自动拉取代码；运维人员必须先检出变更单批准的 Git SHA，并保持工作区干净。数据库迁移只通过显式 migration profile 执行：

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml --profile migration run --rm migrate
```

## 维护模式

```bash
bash ./scripts/maintenance-on.sh
bash ./scripts/maintenance-off.sh
```

维护模式下健康检查和登录可用，财务写操作返回 503，避免迁移窗口产生新数据。

## 停止与重新启动

```bash
docker compose --env-file .env.tencent -f docker-compose.tencent.yml stop
docker compose --env-file .env.tencent -f docker-compose.tencent.yml up -d postgres backend nginx
```

停止或删除容器不会删除 `/data/xjd-finance/postgres` 的绑定目录。禁止在正式环境执行 `down -v`、`prisma migrate reset` 或 `prisma db push`。

## 现有线上环境

GitHub Pages 和 Render 在正式切换前继续保留。完成腾讯云只读验收、DNS 切换和观察期后，再按变更单决定是否下线旧环境。

## 审核与权限

正式申请腾讯云权限前，使用 [腾讯云迁移安全审核](./TENCENT_MIGRATION_SECURITY_AUDIT.md) 和 [变更审核清单](./TENCENT_MIGRATION_REVIEW_CHECKLIST.md)。任何凭据只通过腾讯云 CAM、CVM 密钥或受控密码库交付，不写入 Git、工单正文或聊天记录。
