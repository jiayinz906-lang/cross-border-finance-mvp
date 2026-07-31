# XJD Finance 快速执行协议

## 项目边界

- 项目根目录：`D:\Users\DELL\Documents\财务系统\cross-border-finance-mvp`
- 前端：`client`
- 后端：`server`
- 部署入口：`Dockerfile`、`docker-compose.prod.yml`、`scripts/bootstrap-tencent-lighthouse.sh`
- 腾讯云目标：`49.235.108.203`，HTTP 端口 `18080`

## 默认快速模式

1. 先根据任务类型读取直接相关文件，不递归扫描父目录、历史资料或全部文档。
2. 使用一次 `rg`/定向文件清单定位问题，随后批量修改；避免反复 `Get-Content` 和临时替换脚本。
3. 已有 SSH 密钥通道时直接使用 SSH；不要重新走 Chrome、OrcaTerm、扫码 MFA 或浏览器终端自动化。
4. 部署任务先执行 60 秒内可完成的网络、磁盘、内存、Docker daemon 和 Compose 配置预检。
5. 所有联网命令必须设置连接超时和总超时，并把完整输出写入日志；同一步骤失败后先解释根因，不做无界重复。
6. 国内云服务器默认使用腾讯 Debian 镜像、可用 Docker Hub 镜像和 npm 镜像；复用 BuildKit 与 pnpm 缓存。
7. 重试部署时只重跑失败阶段，不重复本地全量测试、浏览器验收、MFA 或已通过的镜像拉取。

## 最小验证矩阵

- 源码小改：相关包 build/test。
- Dockerfile/Compose 改动：`docker compose --env-file .env.production -f docker-compose.prod.yml config`，再构建受影响 target。
- 云端部署：镜像构建 → `compose up` → `127.0.0.1:18080/api/health` → 公网 `49.235.108.203:18080/api/health`。
- 已经通过的全量业务测试不因纯部署配置改动而重复执行。

## 停止条件

- 网络步骤 120 秒仍无有效进度：终止并输出具体 URL、阶段和错误。
- 构建步骤 15 分钟仍无新日志：终止，保留日志并定位卡住的 Dockerfile 指令。
- 验收通过后立即交付，不继续扩展部署范围。

