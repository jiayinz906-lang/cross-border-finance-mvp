# ERPNext 集成说明

## 集成边界

ERPNext 应作为独立服务部署。XJD Finance 仅通过 ERPNext/Frappe 的 REST API 访问数据，不复制、修改或打包 ERPNext 的前端与后端源码。

这样做有三个目的：

1. ERPNext 可以独立升级、备份和运维。
2. ERPNext API 密钥只存在 XJD 后端，浏览器无法读取。
3. 保持两个程序的发布边界，避免把 GPLv3 源码直接混入 XJD 前端构建产物。

本说明不是法律意见。若未来复制或修改 ERPNext 源码并向客户分发，应单独评估 GPLv3 源码提供义务。

## 当前能力

- 测试 ERPNext API 连接和远程用户。
- 查看 Customer、Supplier、Sales Invoice、Purchase Invoice 数量。
- 查看最近十张销售发票和采购发票。
- 全程只读，不会在 ERPNext 创建或修改单据。

## ERPNext 端配置

1. 在 ERPNext 创建专用 API 用户，不要使用 Administrator。
2. 只授予 Customer、Supplier、Sales Invoice、Purchase Invoice 的读取权限。
3. 在该用户的 API Access 中生成 API Key 和 API Secret。
4. 将 ERPNext 地址和密钥写入 XJD 后端环境变量。

## 本地配置

在项目 `.env` 中加入：

```text
ERPNEXT_BASE_URL=http://localhost:8080
ERPNEXT_API_KEY=replace_me
ERPNEXT_API_SECRET=replace_me
ERPNEXT_TIMEOUT_MS=15000
```

重启后端，然后访问 `http://localhost:5173/#/erpnext`。

## Render 配置

在 Render Web Service 的 Environment 页面设置同名变量并重新部署。不要把真实 API Secret 提交到 Git。

## 独立部署 ERPNext

使用 ERPNext 官方 `frappe/frappe_docker` 仓库部署。演示配置只适合短期测试，生产环境应使用官方生产 Compose 配置、持久卷、HTTPS 和独立备份。
