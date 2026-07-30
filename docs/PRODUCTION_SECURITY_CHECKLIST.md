# 生产安全检查清单

> 每次正式发布前由开发和运维双人复核并保留结果。

## 应用与凭据

- [ ] `NODE_ENV=production`、`PRODUCTION_PROFILE=tencent`。
- [ ] `AUTH_REQUIRE_TOKEN=true`、`ALLOW_HEADER_ROLE=false`、`ENABLE_LEGACY_DEFAULT_USERS=false`。
- [ ] `AUTH_TOKEN_SECRET` 为至少 64 位随机值，未出现在 Git、镜像和日志中。
- [ ] 仅配置经过批准的 `CORS_ALLOWED_ORIGINS` 和 `PUBLIC_APP_URL`，均为 HTTPS。
- [ ] 首次管理员密码通过受限渠道交付，登录后立即修改。
- [ ] 维护模式、登录限流和签名限流已验证。

## 网络与 TLS

- [ ] 公网仅开放 80/443，22 仅允许管理 IP；4000/5432/Docker API 不开放。
- [ ] HTTPS 证书、域名、续期监控和 TLS 1.2/1.3 正常。
- [ ] Nginx 已设置 50MB 上传限制、代理头、安全响应头和静态缓存策略。
- [ ] WAF/EdgeOne（如启用）不会缓存 API、登录、下载和签名响应。

## 主机与容器

- [ ] CVM 系统和 Docker 已更新，SSH 禁止密码及 root 直登。
- [ ] 后端容器使用非 root 用户，PostgreSQL 使用独立绑定目录。
- [ ] 日志轮转、磁盘告警、容器重启策略和资源限制有效。
- [ ] `.env.tencent`、证书和备份权限最小化，不进入镜像和 Git。

## 数据库与备份

- [ ] PostgreSQL 仅在 Docker 内网监听，数据库密码独立且已轮换。
- [ ] 只使用 `prisma migrate deploy`，禁止 reset、db push 和正式环境 down -v。
- [ ] 最近一次本地与 COS 备份均通过 SHA 和测试恢复。
- [ ] 源/目标 manifest 差异为 0，金额和签名证据抽样通过。

## 审计与监控

- [ ] 登录、导入、回滚、收付款、锁账、规则变更、签名和主管确认写入审计日志。
- [ ] 审计日志包含账号、角色、IP、User-Agent、请求 ID 和时间。
- [ ] 健康接口能显示 Git SHA、构建时间、数据库迁移和维护状态。
- [ ] 5xx、P95、CPU、内存、磁盘、数据库连接和备份失败告警已测试。

## 数据与文件

- [ ] 生产构建不生成 source map，Nginx 拒绝 `.map` 和敏感文件。
- [ ] 上传文件验证大小和类型，确认单下载必须鉴权，公开签名 token 一次性且有过期时间。
- [ ] CSP 先使用 Report-Only 观察，再经验证逐步转为强制策略。
