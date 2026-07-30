# 腾讯云数据库迁移本地演练记录

演练时间：2026-07-29 13:52（Asia/Shanghai）  
范围：本地隔离 PostgreSQL 源库到一次性 PostgreSQL 17 恢复库。  
远程影响：无；未连接或修改腾讯云、Render、GitHub Pages。

## 结果

| 检查 | 结果 |
| --- | --- |
| 只读预检 | 通过 |
| custom-format `pg_dump` | 通过 |
| SHA-256 生成与读取 | 通过 |
| 空目标库恢复 | 通过 |
| 源/目标 manifest 比对 | `pass` |
| 阻断差异 | 0 |
| 警告差异 | 0 |
| 一致检查项 | 56 |

演练归档 SHA-256：`59eacd940a6ac443972dca8a7eb3413a8d9f71c368da7c9acaa34aaf63df5419`。

本地证据目录：`outputs/migration/rehearsal-20260729-135259/`。目录保留预检、源/目标 manifest 和比对 JSON；包含业务数据的临时 dump 已在验证后清空。正式审核时必须使用正式源库重新生成证据，不能复用本地演练归档或连接信息。

## 结论

迁移工具链已证明能够在隔离环境完成“预检—导出—校验—恢复—财务核对”。该结果只批准进入腾讯云迁移演练审核，不代表已经批准正式切流。正式执行仍需满足 `TENCENT_MIGRATION_SECURITY_AUDIT.md` 和 `TENCENT_MIGRATION_REVIEW_CHECKLIST.md`。
