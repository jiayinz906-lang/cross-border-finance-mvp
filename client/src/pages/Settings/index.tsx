import { Alert, Button, Card, Descriptions, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAuthContext,
  getImportBatches,
  getImportTemplates,
  importBatchSourcePath,
  getParameterRules,
  rollbackImportBatch,
  updateParameterRule
} from "../../api/finance.api";
import { downloadAuthenticatedFile } from "../../api/download";
import { getOperationsStatus, getReadiness } from "../../api/health.api";
import { changePassword, createUser, getNotificationStatus, getUsers, updateUser, type ManagedUser } from "../../api/auth.api";
import {
  getActionLogs,
  getMonthCloseStatus,
  lockMonth,
  downloadSystemBackup,
  unlockMonth,
  type ActionLogRow,
  type MonthCloseStatus
} from "../../api/workflow.api";
import { PageHeader } from "../../components/PageHeader";
import { MonthWorkflowStatus } from "../../components/MonthWorkflowStatus";
import { useSelectedMonth } from "../../contexts/MonthContext";
import { apiBaseUrl } from "../../api/request";
import type { AuthContext, ImportBatch, ImportTemplate, OperationsStatus, ParameterRule, ReadinessStatus } from "../../types/finance.types";
import {
  auditActionLabel,
  auditActionOptions,
  auditEntityIdLabel,
  auditEntityLabel,
  auditEntityOptions,
  auditOperatorLabel,
  auditPayloadSummary
} from "../../utils/auditLog";
import { formatMoney } from "../../utils/formatMoney";
import { useAuth } from "../../contexts/AuthContext";
import { pagesForPermissions, roleDataScopeLabels } from "../../config/access";

type RuleDraft = Record<string, { valueJson: string; description: string }>;

function statusTag(status: string) {
  if (status === "active") return <Tag color="green">当前生效</Tag>;
  if (status === "superseded") return <Tag color="blue">已被新批次替换</Tag>;
  if (status === "reverted") return <Tag color="red">已回滚</Tag>;
  return <Tag>{status}</Tag>;
}

function money(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥");
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readinessTag(value?: boolean) {
  if (value) return <Tag color="green">通过</Tag>;
  return <Tag color="red">异常</Tag>;
}

function configurationTag(value?: boolean) {
  if (value) return <Tag color="green">已配置</Tag>;
  return <Tag color="orange">未配置</Tag>;
}

function formatUptime(seconds?: number) {
  if (!Number.isFinite(seconds)) return "-";
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return `${days ? `${days}天 ` : ""}${hours}小时 ${minutes}分钟`;
}

export default function Settings() {
  const { selectedMonth } = useSelectedMonth();
  const currentAccount = useAuth();
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [templates, setTemplates] = useState<ImportTemplate[]>([]);
  const [rules, setRules] = useState<ParameterRule[]>([]);
  const [readiness, setReadiness] = useState<ReadinessStatus | null>(null);
  const [operations, setOperations] = useState<OperationsStatus | null>(null);
  const [monthClose, setMonthClose] = useState<MonthCloseStatus | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLogRow[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft>({});
  const [loading, setLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [logFilters, setLogFilters] = useState({ entityType: "", entityId: "", action: "", operator: "" });
  const [savingRuleKey, setSavingRuleKey] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);
  const [downloadingBatchId, setDownloadingBatchId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);
  const [backupLoading, setBackupLoading] = useState<"month" | "all" | null>(null);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [dingtalkMappingTarget, setDingtalkMappingTarget] = useState<ManagedUser | null>(null);
  const [dingtalkUserIdDraft, setDingtalkUserIdDraft] = useState("");
  const [newUser, setNewUser] = useState({ username: "", password: "", displayName: "", role: "sales", dingtalkUserId: "" });
  const [passwordDraft, setPasswordDraft] = useState({ currentPassword: "", nextPassword: "" });
  const [accountSaving, setAccountSaving] = useState(false);
  const [notificationConfigured, setNotificationConfigured] = useState<boolean | null>(null);
  const [notificationProvider, setNotificationProvider] = useState<string | null>(null);

  const downloadBackup = async (scope: "month" | "all") => {
    setBackupLoading(scope);
    try {
      await downloadSystemBackup(scope === "month" ? selectedMonth : undefined);
      message.success(scope === "month" ? "本月系统备份已下载" : "全量系统备份已下载");
    } catch {
      message.error("系统备份下载失败，请检查登录状态或后端服务");
    } finally {
      setBackupLoading(null);
    }
  };

  const effectivePermissions = currentAccount.user?.auth?.permissions ?? auth?.permissions ?? [];
  const permissions = useMemo(() => new Set(effectivePermissions), [effectivePermissions]);
  const roleDirectory = currentAccount.user?.auth?.roles ?? auth?.roles ?? [];
  const permissionDirectory = currentAccount.user?.auth?.permissionCatalog ?? auth?.permissionCatalog ?? [];
  const permissionLabelByCode = useMemo(
    () => new Map(permissionDirectory.map((item) => [item.permission, item.label])),
    [permissionDirectory]
  );
  const canWriteRules = permissions.has("rules:write");
  const canImport = permissions.has("finance:import");
  const canRollback = permissions.has("finance:rollback");
  const canCloseMonth = permissions.has("finance:close");
  const canManageUsers = permissions.has("users:manage");
  const canAudit = permissions.has("audit:read");
  const canExport = permissions.has("reports:export");
  const canViewOperations = permissions.has("operations:read");
  const canViewRules = permissions.has("rules:read");
  const canViewMonthClose = permissions.has("month-close:read");
  const isMonthLocked = monthClose?.status === "locked";

  const loadAuth = useCallback(async () => {
    const res = await getAuthContext();
    setAuth(res.data);
  }, []);

  const loadManagedUsers = useCallback(async () => {
    if (!canManageUsers) return;
    setUsersLoading(true);
    try {
      const [usersResponse, notificationResponse] = await Promise.all([getUsers(), getNotificationStatus()]);
      setManagedUsers(usersResponse.data.rows ?? []);
      setNotificationConfigured(notificationResponse.data.configured);
      setNotificationProvider(notificationResponse.data.provider);
    } catch {
      message.error("账号或通知配置加载失败，请确认管理员权限。");
    } finally {
      setUsersLoading(false);
    }
  }, [canManageUsers]);

  const loadBatches = useCallback(async () => {
    if (!canImport) {
      setBatches([]);
      return;
    }
    setLoading(true);
    try {
      const res = await getImportBatches(selectedMonth);
      setBatches(res.data.rows ?? []);
    } catch {
      message.error("导入批次加载失败，请确认后端服务可用");
    } finally {
      setLoading(false);
    }
  }, [canImport, selectedMonth]);

  const loadTemplates = useCallback(async () => {
    if (!canImport) {
      setTemplates([]);
      return;
    }
    setTemplatesLoading(true);
    try {
      const res = await getImportTemplates();
      setTemplates(res.data.rows ?? []);
    } catch {
      message.error("表头模板加载失败，请确认后端服务可用");
    } finally {
      setTemplatesLoading(false);
    }
  }, [canImport]);

  const loadReadiness = useCallback(async () => {
    if (!canViewOperations) {
      setReadiness(null);
      return;
    }
    setReadinessLoading(true);
    try {
      const res = await getReadiness(selectedMonth);
      setReadiness(res.data);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: ReadinessStatus } })?.response?.data;
      if (data) setReadiness(data);
      else message.error("系统就绪状态加载失败，请确认后端服务可用");
    } finally {
      setReadinessLoading(false);
    }
  }, [canViewOperations, selectedMonth]);

  const loadOperations = useCallback(async () => {
    if (!canViewOperations) {
      setOperations(null);
      return;
    }
    setOperationsLoading(true);
    try {
      const res = await getOperationsStatus();
      setOperations(res.data as OperationsStatus);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: OperationsStatus } })?.response?.data;
      if (data) setOperations(data);
      else message.error("运行状态加载失败，请确认后端服务可用");
    } finally {
      setOperationsLoading(false);
    }
  }, [canViewOperations]);

  const loadRules = useCallback(async () => {
    if (!canViewRules) {
      setRules([]);
      setRuleDrafts({});
      return;
    }
    setRulesLoading(true);
    try {
      const res = await getParameterRules(selectedMonth);
      const rows = res.data.rows ?? [];
      setRules(rows);
      setRuleDrafts(Object.fromEntries(rows.map((rule: ParameterRule) => [
        rule.ruleKey,
        { valueJson: prettyJson(rule.value), description: rule.description ?? "" }
      ])));
    } catch {
      message.error("参数规则加载失败，请确认后端服务可用");
    } finally {
      setRulesLoading(false);
    }
  }, [canViewRules, selectedMonth]);

  const loadMonthClose = useCallback(async () => {
    if (!canViewMonthClose) {
      setMonthClose(null);
      return;
    }
    try {
      const res = await getMonthCloseStatus(selectedMonth);
      setMonthClose(res.data);
      setCloseNote(res.data.closeNote ?? "");
    } catch {
      message.error("月度锁账状态加载失败，请确认后端服务可用");
    }
  }, [canViewMonthClose, selectedMonth]);

  const loadActionLogs = useCallback(async () => {
    if (!canAudit) {
      setActionLogs([]);
      return;
    }
    setLogsLoading(true);
    try {
      const res = await getActionLogs({
        month: selectedMonth,
        entityType: logFilters.entityType || undefined,
        entityId: logFilters.entityId || undefined,
        action: logFilters.action || undefined,
        operator: logFilters.operator || undefined
      });
      setActionLogs(res.data.rows ?? []);
    } catch {
      message.error("操作审计日志加载失败，请确认后端服务可用");
    } finally {
      setLogsLoading(false);
    }
  }, [canAudit, logFilters, selectedMonth]);

  useEffect(() => {
    loadAuth().catch(() => message.error("角色权限加载失败"));
  }, [loadAuth]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  useEffect(() => {
    loadReadiness();
  }, [loadReadiness]);

  useEffect(() => {
    loadOperations();
  }, [loadOperations]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    loadMonthClose();
  }, [loadMonthClose]);

  useEffect(() => {
    loadActionLogs();
  }, [loadActionLogs]);

  useEffect(() => {
    loadManagedUsers();
  }, [loadManagedUsers]);

  const submitPasswordChange = async () => {
    if (!passwordDraft.currentPassword || passwordDraft.nextPassword.length < 10) {
      message.warning("请输入当前密码；新密码至少 10 位。");
      return;
    }
    setAccountSaving(true);
    try {
      const response = await changePassword(passwordDraft.currentPassword, passwordDraft.nextPassword);
      currentAccount.replaceSession(response.data);
      setPasswordDraft({ currentPassword: "", nextPassword: "" });
      setPasswordModalOpen(false);
      message.success("密码已更新，请使用新密码登录。");
      await loadAuth();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? "修改密码失败");
    } finally {
      setAccountSaving(false);
    }
  };

  const submitNewUser = async () => {
    if (!newUser.username || !newUser.displayName || newUser.password.length < 10) {
      message.warning("请填写账号、姓名和至少 10 位的初始密码。");
      return;
    }
    setAccountSaving(true);
    try {
      await createUser(newUser);
      message.success("账号已创建，首次登录必须修改密码。");
      setNewUser({ username: "", password: "", displayName: "", role: "sales", dingtalkUserId: "" });
      setUserModalOpen(false);
      await loadManagedUsers();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? "创建账号失败");
    } finally {
      setAccountSaving(false);
    }
  };

  const submitDingtalkMapping = async () => {
    if (!dingtalkMappingTarget) return;
    setAccountSaving(true);
    try {
      await updateUser(dingtalkMappingTarget.id, { dingtalkUserId: dingtalkUserIdDraft });
      message.success("钉钉用户 ID 已保存。");
      setDingtalkMappingTarget(null);
      setDingtalkUserIdDraft("");
      await loadManagedUsers();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? "保存钉钉用户 ID 失败。");
    } finally {
      setAccountSaving(false);
    }
  };

  const rollback = async (id: number) => {
    if (isMonthLocked) {
      message.warning(`${selectedMonth} 已锁账，不能回滚导入批次`);
      return;
    }
    setRollingBackId(id);
    try {
      await rollbackImportBatch(id);
      message.success("批次已回滚，当前月份汇总已重新计算");
      await Promise.all([loadBatches(), loadActionLogs()]);
    } catch {
      message.error("批次回滚失败，请检查角色权限或批次状态");
    } finally {
      setRollingBackId(null);
    }
  };

  const changeMonthClose = async (action: "lock" | "unlock") => {
    setCloseLoading(true);
    try {
      if (action === "lock") {
        const result = await lockMonth(selectedMonth, closeNote || "月度财务复核完成，锁定本月数据");
        const blockers = (result.data as { unresolvedBlockers?: string[] }).unresolvedBlockers ?? [];
        if (blockers.length) {
          message.warning(`${selectedMonth} 已锁账；以下事项仅作提醒，后续仍可由主管解锁处理：${blockers.join("；")}`);
        } else {
          message.success(`${selectedMonth} 已锁账，导入和回滚已禁止`);
        }
      } else {
        await unlockMonth(selectedMonth, closeNote || "主管解锁，允许补充调整");
        message.success(`${selectedMonth} 已解锁`);
      }
      await Promise.all([loadMonthClose(), loadBatches(), loadActionLogs()]);
    } catch (error: unknown) {
      const response = (error as { response?: { data?: { message?: string; fieldErrors?: Record<string, string> } } })?.response?.data;
      const detail = response?.fieldErrors?.blockers || response?.message;
      message.error(detail || "月度锁账操作失败，请检查角色权限或后端服务");
      await loadMonthClose();
    } finally {
      setCloseLoading(false);
    }
  };

  const saveRule = async (rule: ParameterRule) => {
    const draft = ruleDrafts[rule.ruleKey];
    if (!draft) return;
    try {
      JSON.parse(draft.valueJson);
    } catch {
      message.error("规则值必须是合法 JSON");
      return;
    }

    setSavingRuleKey(rule.ruleKey);
    try {
      await updateParameterRule(rule.ruleKey, {
        valueJson: draft.valueJson,
        description: draft.description,
        updatedBy: auth?.label ?? "finance-admin",
        effectiveMonth: selectedMonth
      });
      message.success(`参数规则已保存，自 ${selectedMonth} 起生效`);
      await loadRules();
    } catch {
      message.error("参数规则保存失败，请检查角色权限、后端服务或 JSON 格式");
    } finally {
      setSavingRuleKey(null);
    }
  };

  const batchColumns: ColumnsType<ImportBatch> = [
    { title: "批次号", dataIndex: "batchNo", width: 190 },
    { title: "月份", dataIndex: "month", width: 92 },
    { title: "文件", dataIndex: "fileName", ellipsis: true },
    { title: "工作表", dataIndex: "sheetName", width: 140 },
    { title: "状态", dataIndex: "status", width: 120, render: statusTag },
    { title: "明细行", dataIndex: "importedRows", width: 82, align: "right" },
    { title: "票数", dataIndex: "importedOrders", width: 76, align: "right" },
    { title: "物流/服务", width: 110, render: (_, row) => `${row.logisticsOrders}/${row.serviceOrders}` },
    { title: "总应收", dataIndex: "totalReceivable", width: 130, align: "right", render: money },
    { title: "总应付", dataIndex: "totalPayable", width: 130, align: "right", render: money },
    { title: "毛利", dataIndex: "totalGrossProfit", width: 130, align: "right", render: money },
    { title: "风险票", dataIndex: "riskOrderCount", width: 82, align: "right" },
    {
      title: "预检",
      width: 140,
      render: (_, row) => {
        const preview = parseJson<{ qualityReport?: { blockingCount?: number; warningCount?: number; infoCount?: number } }>(row.previewJson, {});
        const quality = preview.qualityReport;
        if (!quality) return <Tag>未记录</Tag>;
        if (quality.blockingCount) return <Tag color="red">阻断 {quality.blockingCount}</Tag>;
        if (quality.warningCount) return <Tag color="gold">复核 {quality.warningCount}</Tag>;
        return <Tag color="green">通过</Tag>;
      }
    },
    {
      title: "操作",
      width: 250,
      fixed: "right",
      render: (_, row) => (
        <Space size={6}>
          <Button size="small" onClick={() => setSelectedBatch(row)}>详情</Button>
          <Button
            size="small"
            disabled={!row.sourceFileSize}
            loading={downloadingBatchId === row.id}
            onClick={async () => {
              setDownloadingBatchId(row.id);
              try {
                await downloadAuthenticatedFile(importBatchSourcePath(row.id), row.fileName);
                message.success("原始 Excel 存档已下载");
              } catch {
                message.error("原始 Excel 存档下载失败");
              } finally {
                setDownloadingBatchId(null);
              }
            }}
          >
            下载原文件
          </Button>
          <Popconfirm
            title="确认回滚该导入批次？"
            description="回滚会删除该批次写入的订单、提成、风险和服务确认记录，并重新计算月度汇总。"
            okText="确认回滚"
            cancelText="取消"
            disabled={row.status !== "active" || !canRollback}
            onConfirm={() => rollback(row.id)}
          >
            <Button danger size="small" disabled={row.status !== "active" || !canRollback || isMonthLocked} loading={rollingBackId === row.id}>
              回滚
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  const templateColumns: ColumnsType<ImportTemplate> = [
    {
      title: "模板",
      dataIndex: "templateKey",
      width: 210,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <b>{row.templateKey}</b>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.fileName}</Typography.Text>
        </Space>
      )
    },
    { title: "工作表", dataIndex: "sheetName", width: 120 },
    { title: "表头行", dataIndex: "headerRowIndex", width: 90, align: "right" },
    { title: "表头数", dataIndex: "headerCount", width: 90, align: "right" },
    {
      title: "固定表头规范",
      dataIndex: "headers",
      render: (headers: string[]) => (
        <Space size={[4, 6]} wrap>
          {headers.map((header, index) => <Tag key={`${header}-${index}`}>{index + 1}. {header}</Tag>)}
        </Space>
      )
    },
    { title: "更新时间", dataIndex: "updatedAt", width: 170, render: (value) => String(value).replace("T", " ").slice(0, 19) }
  ];

  const ruleColumns: ColumnsType<ParameterRule> = [
    { title: "分组", dataIndex: "ruleGroup", width: 100, render: (value) => <Tag>{value}</Tag> },
    {
      title: "规则",
      dataIndex: "label",
      width: 180,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <b>{row.label}</b>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>{row.ruleKey}</Typography.Text>
        </Space>
      )
    },
    {
      title: "规则值 JSON",
      dataIndex: "valueJson",
      render: (_, row) => (
        <Input.TextArea
          disabled={!canWriteRules}
          value={ruleDrafts[row.ruleKey]?.valueJson ?? row.valueJson}
          autoSize={{ minRows: 3, maxRows: 8 }}
          onChange={(event) => setRuleDrafts((prev) => ({
            ...prev,
            [row.ruleKey]: {
              valueJson: event.target.value,
              description: prev[row.ruleKey]?.description ?? row.description ?? ""
            }
          }))}
        />
      )
    },
    {
      title: "当前口径",
      width: 130,
      render: (_, row) => row.source === "monthly"
        ? <Tag color="blue">自 {row.effectiveMonth} 生效</Tag>
        : <Tag>系统默认</Tag>
    },
    {
      title: "说明",
      dataIndex: "description",
      width: 280,
      render: (_, row) => (
        <Input.TextArea
          disabled={!canWriteRules}
          value={ruleDrafts[row.ruleKey]?.description ?? row.description ?? ""}
          autoSize={{ minRows: 3, maxRows: 8 }}
          onChange={(event) => setRuleDrafts((prev) => ({
            ...prev,
            [row.ruleKey]: {
              valueJson: prev[row.ruleKey]?.valueJson ?? row.valueJson,
              description: event.target.value
            }
          }))}
        />
      )
    },
    {
      title: "操作",
      width: 100,
      render: (_, row) => (
        <Button type="primary" size="small" disabled={!canWriteRules} loading={savingRuleKey === row.ruleKey} onClick={() => saveRule(row)}>
          保存
        </Button>
      )
    }
  ];

  const logColumns: ColumnsType<ActionLogRow> = [
    { title: "时间", dataIndex: "createdAt", width: 170, render: (value) => String(value).replace("T", " ").slice(0, 19) },
    { title: "月份", dataIndex: "month", width: 90, render: (value) => value || "-" },
    {
      title: "对象",
      width: 220,
      render: (_, row) => (
        <Space size={4} wrap>
          <span>{auditEntityLabel(row.entityType)}</span>
          <Typography.Text type="secondary">/ {auditEntityIdLabel(row.entityId)}</Typography.Text>
        </Space>
      )
    },
    { title: "动作", dataIndex: "action", width: 210, render: (value) => <Tag color="blue">{auditActionLabel(value)}</Tag> },
    { title: "操作人", dataIndex: "operator", width: 130, render: (value) => auditOperatorLabel(value) },
    {
      title: "摘要",
      dataIndex: "payloadJson",
      ellipsis: true,
      render: (value, row) => auditPayloadSummary(value, row.action)
    }
  ];

  return (
    <>
      <PageHeader
        title="账号与参数规则"
        description="查看当前账号的数据范围和授权界面；管理员在此维护账号，财务与主管按权限处理月结、规则和审计。"
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        {canViewOperations ? <MonthWorkflowStatus month={selectedMonth} /> : null}

        <Card title="当前账号与权限">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Tag color="green">已登录</Tag>
              <b>{currentAccount.user?.displayName || currentAccount.user?.username}</b>
              <Tag color="blue">{currentAccount.user?.auth?.label || currentAccount.user?.role}</Tag>
              <Button onClick={() => currentAccount.logout()}>退出登录</Button>
            </Space>
            <Alert
              type="info"
              showIcon
              message={currentAccount.user?.auth?.description ?? auth?.description ?? "当前账号已按角色授权"}
              description={`数据范围：${roleDataScopeLabels[currentAccount.user?.role ?? auth?.role ?? "restricted"] ?? "按账号角色限制"}`}
            />
            <div>
              <Typography.Text strong>可使用界面</Typography.Text>
              <Space wrap style={{ marginTop: 8, display: "flex" }}>
                {pagesForPermissions(effectivePermissions).map((page) => <Tag color="blue" key={page.path}>{page.label}</Tag>)}
              </Space>
            </div>
            <div>
              <Typography.Text strong>操作权限</Typography.Text>
              <Space wrap style={{ marginTop: 8, display: "flex" }}>
                {effectivePermissions.filter((permission) => !permission.endsWith(":read")).map((permission) => (
                  <Tag key={permission}>{permissionLabelByCode.get(permission) ?? permission}</Tag>
                ))}
                {effectivePermissions.every((permission) => permission.endsWith(":read")) ? <Tag>仅查看</Tag> : null}
              </Space>
            </div>
          </Space>
        </Card>

        <Card
          title="账号与通知管理"
          extra={<Space><Button onClick={() => setPasswordModalOpen(true)}>修改我的密码</Button>{canManageUsers ? <Button type="primary" onClick={() => setUserModalOpen(true)}>新建账号</Button> : null}</Space>}
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            {currentAccount.user?.mustChangePassword ? <Alert type="warning" showIcon message="首次登录请先修改密码" description="为保护财务数据，请将初始密码改为至少 10 位的新密码。" /> : null}
            {canManageUsers ? <Alert type={notificationConfigured ? "success" : "warning"} showIcon message={notificationConfigured ? (notificationProvider === "dingtalk_direct" ? "钉钉企业应用单聊已配置" : notificationProvider === "dingtalk_webhook" ? "钉钉群机器人通知已配置" : "企业微信机器人通知已配置") : "钉钉/企业微信通知尚未配置"} description={notificationConfigured ? `发送签名链接时会优先通过${notificationProvider === "dingtalk_direct" ? "钉钉企业应用单聊（需维护员工钉钉用户 ID）" : notificationProvider === "dingtalk_webhook" ? "钉钉群机器人" : "企业微信群机器人"}投递。` : "请在 Render 环境变量配置钉钉企业应用或群机器人凭据。"} /> : null}
            {canManageUsers ? <Table<ManagedUser>
              rowKey="id"
              loading={usersLoading}
              size="small"
              pagination={false}
              dataSource={managedUsers}
              columns={[
                { title: "账号", dataIndex: "username" },
                { title: "姓名", dataIndex: "displayName" },
                { title: "角色", dataIndex: "role", render: (value) => <Tag color="blue">{roleDirectory.find((item) => item.role === value)?.label ?? value}</Tag> },
                { title: "状态", render: (_, row) => <Tag color={row.isActive ? "green" : "red"}>{row.isActive ? "启用" : "已停用"}</Tag> },
                { title: "首次改密", render: (_, row) => row.mustChangePassword ? <Tag color="gold">待修改</Tag> : <Tag>已完成</Tag> },
                { title: "钉钉用户 ID", dataIndex: "dingtalkUserId", render: (value) => value || <Tag>未映射</Tag> },
                { title: "最后登录", dataIndex: "lastLoginAt", render: (value) => value ? String(value).replace("T", " ").slice(0, 19) : "-" },
                { title: "操作", render: (_, row) => <Space>
                  <Button size="small" onClick={async () => { const password = window.prompt(`重置 ${row.displayName} 的密码（至少 10 位）`); if (password && password.length >= 10) { await updateUser(row.id, { resetPassword: password }); message.success("密码已重置，用户下次登录必须修改密码。"); loadManagedUsers(); } }}>重置密码</Button>
                  <Button size="small" onClick={() => { setDingtalkMappingTarget(row); setDingtalkUserIdDraft(row.dingtalkUserId ?? ""); }}>钉钉映射</Button>
                  <Button size="small" danger={row.isActive} disabled={row.id === currentAccount.user?.id} onClick={async () => { await updateUser(row.id, { isActive: !row.isActive }); message.success(row.isActive ? "账号已停用" : "账号已启用"); loadManagedUsers(); }}>{row.isActive ? "停用" : "启用"}</Button>
                </Space> }
              ]}
            /> : <Alert type="info" showIcon message="可在此修改自己的密码" description="账号创建、角色分配、停用和通知映射仅对系统管理员开放。" />}
          </Space>
        </Card>

        {canManageUsers ? (
          <Card title="角色、界面与数据范围">
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 12 }}
              message="菜单隐藏与后端权限使用同一套角色定义"
              description="页面按钮用于改善操作体验；后端仍会对直接访问、接口请求和数据范围进行最终校验。"
            />
            <Table
              rowKey="role"
              size="small"
              pagination={false}
              dataSource={roleDirectory}
              columns={[
                { title: "角色", dataIndex: "label", width: 130, render: (value) => <Tag color="blue">{value}</Tag> },
                { title: "职责", dataIndex: "description", width: 280 },
                { title: "数据范围", dataIndex: "role", width: 250, render: (value) => roleDataScopeLabels[value] ?? "按账号角色限制" },
                {
                  title: "授权界面",
                  render: (_, row) => <Space wrap>{pagesForPermissions(row.permissions).map((page) => <Tag key={page.path}>{page.label}</Tag>)}</Space>
                },
                {
                  title: "写操作",
                  width: 360,
                  render: (_, row) => {
                    const actions = row.permissions.filter((permission) => !permission.endsWith(":read"));
                    return actions.length ? <Space wrap>{actions.map((permission) => <Tag color="gold" key={permission}>{permissionLabelByCode.get(permission) ?? permission}</Tag>)}</Space> : <Tag>仅查看</Tag>;
                  }
                }
              ]}
              scroll={{ x: 1300 }}
            />
          </Card>
        ) : null}

        {canViewOperations ? <Card title="运行地址与数据库">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Descriptions column={1}>
              <Descriptions.Item label="后端接口地址">{apiBaseUrl}</Descriptions.Item>
              <Descriptions.Item label="数据库类型">PostgreSQL</Descriptions.Item>
              <Descriptions.Item label="数据存储说明">数据库连接由后端 DATABASE_URL 管理，页面不保存或显示数据库密码</Descriptions.Item>
            </Descriptions>
            <Alert
              type="info"
              showIcon
              message="表头模版规范已写入后台，后续 Excel 导入会按后台模板进行字段匹配和质量校验。"
              description="系统备份会导出表头模板、参数规则、导入批次、锁账状态、确认单、操作日志和导出记录，便于审计和迁移。"
            />
            {canExport ? <Space wrap>
              <Button loading={backupLoading === "month"} onClick={() => downloadBackup("month")}>
                导出本月系统备份 Excel
              </Button>
              <Button loading={backupLoading === "all"} onClick={() => downloadBackup("all")}>
                导出全量系统备份 Excel
              </Button>
            </Space> : null}
          </Space>
        </Card> : null}

        {canViewOperations ? <Card
          title={`系统运行与就绪状态（${selectedMonth}）`}
          extra={(
            <Button
              onClick={() => void Promise.all([loadReadiness(), loadOperations()])}
              loading={readinessLoading || operationsLoading}
            >
              刷新运行状态
            </Button>
          )}
        >
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Alert
              type={readiness?.status === "ready" && operations?.status === "healthy" ? "success" : "warning"}
              showIcon
              message={readiness?.status === "ready" && operations?.status === "healthy" ? "系统运行正常，可以进行导入、分析和确认流程" : "系统存在异常，请检查下方运行指标"}
              description={`检查时间：${operations?.timestamp ? String(operations.timestamp).replace("T", " ").slice(0, 19) : "未获取"}；版本：${operations?.version ?? readiness?.details?.version ?? "-"}`}
            />
            <Descriptions bordered size="small" column={4}>
              <Descriptions.Item label="数据库">{readinessTag(readiness?.checks.database)}</Descriptions.Item>
              <Descriptions.Item label="表头模板">{readinessTag(readiness?.checks.importTemplate)}</Descriptions.Item>
              <Descriptions.Item label="参数规则">{readinessTag(readiness?.checks.parameterRules)}</Descriptions.Item>
              <Descriptions.Item label="月度汇总">{readinessTag(readiness?.checks.financeSummary)}</Descriptions.Item>
              <Descriptions.Item label="运行环境">{readiness?.details?.environment ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="版本">{readiness?.details?.version ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="数据库延迟">{operations?.database?.latencyMs ?? readiness?.details?.databaseLatencyMs ?? "-"} ms</Descriptions.Item>
              <Descriptions.Item label="连续运行">{formatUptime(operations?.runtime.uptimeSeconds ?? readiness?.details?.uptimeSeconds)}</Descriptions.Item>
              <Descriptions.Item label="模板数">{readiness?.details?.templateCount ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="规则数">{readiness?.details?.activeRuleCount ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="总应收">{money(readiness?.details?.summary?.totalReceivable)}</Descriptions.Item>
              <Descriptions.Item label="总应付">{money(readiness?.details?.summary?.totalPayable)}</Descriptions.Item>
              <Descriptions.Item label="最近导入批次">{readiness?.details?.latestImportBatch?.batchNo ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="最近导入文件">{readiness?.details?.latestImportBatch?.fileName ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="最近导入票数">{readiness?.details?.latestImportBatch?.importedOrders ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="最近导入时间">
                {readiness?.details?.latestImportBatch?.createdAt ? String(readiness.details.latestImportBatch.createdAt).replace("T", " ").slice(0, 19) : "-"}
              </Descriptions.Item>
            </Descriptions>
            <Descriptions bordered size="small" column={4} title="本进程运维指标">
              <Descriptions.Item label="请求总数">{operations?.runtime.requests.total ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="当前请求">{operations?.runtime.requests.active ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="失败请求">{operations?.runtime.requests.failed ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="慢请求">{operations?.runtime.requests.slow ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="平均耗时">{operations?.runtime.requests.averageMs ?? "-"} ms</Descriptions.Item>
              <Descriptions.Item label="P95耗时">{operations?.runtime.requests.p95Ms ?? "-"} ms</Descriptions.Item>
              <Descriptions.Item label="进程内存">{operations?.runtime.memory.rssMb ?? "-"} MB</Descriptions.Item>
              <Descriptions.Item label="运行错误">{operations?.runtime.errors.total ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Excel上传限制">{operations?.configuration.uploadMaxMb ?? "-"} MB</Descriptions.Item>
              <Descriptions.Item label="图片上传限制">{operations?.configuration.imageUploadMaxMb ?? "-"} MB</Descriptions.Item>
              <Descriptions.Item label="请求超时">{operations ? `${Math.round(operations.configuration.httpRequestTimeoutMs / 1000)} 秒` : "-"}</Descriptions.Item>
              <Descriptions.Item label="钉钉通知">{operations ? configurationTag(operations.configuration.dingtalkConfigured) : "-"}</Descriptions.Item>
            </Descriptions>
            {readiness?.details?.error && <Alert type="error" showIcon message="就绪检查错误" description={readiness.details.error} />}
            {operations?.database?.error && <Alert type="error" showIcon message="数据库探针失败" description={operations.database.error} />}
            {(operations?.runtime.errors.total ?? 0) > 0 && operations?.runtime.errors.recent?.[0] && (
              <Alert
                type="warning"
                showIcon
                message={`本次启动后记录到 ${operations.runtime.errors.total} 个运行错误`}
                description={`最近错误：${operations.runtime.errors.recent[0].key}；${operations.runtime.errors.recent[0].message}；请求ID：${operations.runtime.errors.recent[0].requestId ?? "-"}`}
              />
            )}
          </Space>
        </Card> : null}

        {canImport ? <Card title="后台表头模板规范" extra={<Button onClick={loadTemplates} loading={templatesLoading}>刷新模板</Button>}>
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            message="模板只保存固定表头，不保存业务数据"
            description="后续 Excel 导入会读取这里的表头规范进行字段映射、缺失表头和额外表头校验，导入批次详情会保留当次模板差异。"
          />
          <Table
            rowKey="templateKey"
            size="small"
            loading={templatesLoading}
            columns={templateColumns}
            dataSource={templates}
            pagination={false}
          />
        </Card> : null}

        {canViewMonthClose ? <Card title={`月度锁账控制（${selectedMonth}）`}>
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <span>当前状态</span>
              <Tag color={isMonthLocked ? "red" : "green"}>{isMonthLocked ? "已锁账" : "未锁账"}</Tag>
              {monthClose?.lockedAt && <span>锁账时间：{String(monthClose.lockedAt).replace("T", " ").slice(0, 19)}</span>}
              {monthClose?.lockedBy && <span>锁账人：{monthClose.lockedBy}</span>}
            </Space>
            <Input.TextArea
              value={closeNote}
              onChange={(event) => setCloseNote(event.target.value)}
              placeholder="填写锁账或解锁原因，后端会写入操作日志"
              autoSize={{ minRows: 2, maxRows: 4 }}
              disabled={!canCloseMonth}
            />
            <Space wrap>
              <Popconfirm
                title="确认锁定该月份？"
                description="未完成的风险、确认、签名和对账事项会作为提醒写入操作日志，但不会阻止锁账。锁账后该月份 Excel 导入和批次回滚仍会被后端拒绝。"
                okText="确认锁账"
                cancelText="取消"
                disabled={!canCloseMonth || isMonthLocked}
                onConfirm={() => changeMonthClose("lock")}
              >
                <Button type="primary" danger disabled={!canCloseMonth || isMonthLocked} loading={closeLoading}>
                  锁定本月
                </Button>
              </Popconfirm>
              <Popconfirm
                title="确认解锁该月份？"
                description="解锁后可以重新导入或回滚，请确保已记录原因。"
                okText="确认解锁"
                cancelText="取消"
                disabled={!canCloseMonth || !isMonthLocked}
                onConfirm={() => changeMonthClose("unlock")}
              >
                <Button disabled={!canCloseMonth || !isMonthLocked} loading={closeLoading}>
                  解锁本月
                </Button>
              </Popconfirm>
              <Button onClick={loadMonthClose}>刷新状态</Button>
            </Space>
            <Alert
              type={isMonthLocked ? "warning" : "info"}
              showIcon
              message={isMonthLocked ? "本月已锁账" : "本月未锁账"}
              description={isMonthLocked ? "锁账状态由后端强制执行，导入 Excel 和回滚导入批次都会被拒绝。" : "月度复核、提成确认和签名完成后，建议主管锁账，防止历史数据被覆盖。"}
            />
          </Space>
        </Card> : null}

        {canViewRules ? <Card title="数据库参数规则" extra={<Button onClick={loadRules} loading={rulesLoading}>刷新规则</Button>}>
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 12 }}
            message="规则值以 JSON 保存"
            description={canWriteRules ? "修改规则后保存到后端数据库，后续导入和计算会读取这里的统一口径。" : "当前角色只能查看参数规则，不能保存修改。"}
          />
          <Table
            rowKey="ruleKey"
            size="small"
            loading={rulesLoading}
            columns={ruleColumns}
            dataSource={rules}
            pagination={false}
          />
        </Card> : null}

        {canImport ? <Card title={`导入批次记录（${selectedMonth}）`} extra={<Button onClick={loadBatches} loading={loading}>刷新</Button>}>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Excel 导入已具备可追溯批次"
            description={isMonthLocked ? "当前月份已锁账，不能回滚批次。如需调整，请先由主管解锁。" : canRollback ? "当前角色可以回滚生效批次。回滚会删除该批次订单和派生记录，并重新计算汇总。" : "当前角色只能查看批次，不能回滚。"}
          />
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={batchColumns}
            dataSource={batches}
            pagination={{ pageSize: 6 }}
            scroll={{ x: 1500 }}
          />
        </Card> : null}

        {canAudit ? <Card title={`操作审计日志（${selectedMonth}）`} extra={<Button onClick={loadActionLogs} loading={logsLoading}>刷新日志</Button>}>
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            message="关键财务动作会写入数据库审计日志"
            description="当前已记录 Excel 导入、批次回滚、锁账/解锁、确认单生成、发送签名、员工签名、主管确认、风险复核和提成确认等操作。"
          />
          <Space wrap style={{ marginBottom: 12 }}>
            <Select
              allowClear
              showSearch
              style={{ width: 180 }}
              placeholder="选择操作动作"
              options={auditActionOptions}
              optionFilterProp="label"
              value={logFilters.action || undefined}
              onChange={(value) => setLogFilters((current) => ({ ...current, action: value ?? "" }))}
            />
            <Select
              allowClear
              showSearch
              style={{ width: 180 }}
              placeholder="选择对象类型"
              options={auditEntityOptions}
              optionFilterProp="label"
              value={logFilters.entityType || undefined}
              onChange={(value) => setLogFilters((current) => ({ ...current, entityType: value ?? "" }))}
            />
            <Input
              allowClear
              style={{ width: 180 }}
              placeholder="对象 ID"
              value={logFilters.entityId}
              onChange={(event) => setLogFilters((current) => ({ ...current, entityId: event.target.value }))}
            />
            <Input
              allowClear
              style={{ width: 180 }}
              placeholder="操作人"
              value={logFilters.operator}
              onChange={(event) => setLogFilters((current) => ({ ...current, operator: event.target.value }))}
            />
            <Button onClick={loadActionLogs} loading={logsLoading}>按条件筛选</Button>
          </Space>
          <Table
            rowKey="id"
            size="small"
            loading={logsLoading}
            columns={logColumns}
            dataSource={actionLogs}
            locale={{ emptyText: "当前筛选条件下暂无审计日志" }}
            pagination={{ pageSize: 8, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
            scroll={{ x: 1100 }}
          />
        </Card> : null}
      </Space>

      <Modal
        open={Boolean(selectedBatch)}
        title={`导入批次详情：${selectedBatch?.batchNo ?? ""}`}
        width={980}
        footer={<Button type="primary" onClick={() => setSelectedBatch(null)}>关闭</Button>}
        onCancel={() => setSelectedBatch(null)}
      >
        {selectedBatch && (() => {
          const audit = parseJson<{
            fieldMapping?: Array<{ field: string; sourceHeader: string }>;
            missingRequiredFields?: string[];
            template?: { matchExact?: boolean; missingTemplateHeaders?: string[]; extraHeaders?: string[] };
          }>(selectedBatch.templateAuditJson, {});
          const preview = parseJson<{
            grossProfitRate?: number | null;
            qualityReport?: {
              blockingCount?: number;
              warningCount?: number;
              infoCount?: number;
              issues?: Array<{ key: string; level: string; title: string; count: number; orderNos: string[]; message: string }>;
            };
          }>(selectedBatch.previewJson, {});
          const quality = preview.qualityReport;

          return (
            <Space direction="vertical" size={14} style={{ width: "100%" }}>
              <Descriptions size="small" bordered column={3}>
                <Descriptions.Item label="月份">{selectedBatch.month}</Descriptions.Item>
                <Descriptions.Item label="文件">{selectedBatch.fileName}</Descriptions.Item>
                <Descriptions.Item label="工作表">{selectedBatch.sheetName}</Descriptions.Item>
                <Descriptions.Item label="状态">{statusTag(selectedBatch.status)}</Descriptions.Item>
                <Descriptions.Item label="明细行">{selectedBatch.importedRows}</Descriptions.Item>
                <Descriptions.Item label="票数">{selectedBatch.importedOrders}</Descriptions.Item>
                <Descriptions.Item label="总应收">{money(selectedBatch.totalReceivable)}</Descriptions.Item>
                <Descriptions.Item label="总应付">{money(selectedBatch.totalPayable)}</Descriptions.Item>
                <Descriptions.Item label="毛利">{money(selectedBatch.totalGrossProfit)}</Descriptions.Item>
                <Descriptions.Item label="原文件存档">{selectedBatch.sourceFileSize ? `${selectedBatch.sourceFileSize} 字节` : "历史批次未保存文件本体"}</Descriptions.Item>
                <Descriptions.Item label="SHA-256" span={2}>
                  <Typography.Text copyable={Boolean(selectedBatch.sourceFileSha256)}>
                    {selectedBatch.sourceFileSha256 ?? "-"}
                  </Typography.Text>
                </Descriptions.Item>
              </Descriptions>

              <Alert
                type={audit.template?.matchExact ? "success" : "warning"}
                showIcon
                message={audit.template?.matchExact ? "该批次导入表头与后台模板完全匹配" : "该批次导入表头与后台模板存在差异"}
                description={`缺失表头：${audit.template?.missingTemplateHeaders?.join("、") || "无"}；额外表头：${audit.template?.extraHeaders?.join("、") || "无"}`}
              />

              <Table
                rowKey={(row) => `${row.field}-${row.sourceHeader}`}
                size="small"
                pagination={false}
                title={() => "字段映射"}
                dataSource={audit.fieldMapping ?? []}
                columns={[
                  { title: "系统字段", dataIndex: "field", width: 220 },
                  { title: "Excel 表头", dataIndex: "sourceHeader" }
                ]}
                scroll={{ y: 220 }}
              />

              <Alert
                type={(quality?.blockingCount ?? 0) > 0 ? "error" : (quality?.warningCount ?? 0) > 0 ? "warning" : "success"}
                showIcon
                message={`质量预检：阻断 ${quality?.blockingCount ?? 0} 项，复核 ${quality?.warningCount ?? 0} 项，提示 ${quality?.infoCount ?? 0} 项`}
                description={quality ? "质量预检来自导入时保存的批次快照。" : "历史批次未保存质量预检快照，建议后续重新导入后查看。"}
              />

              <Table
                rowKey="key"
                size="small"
                pagination={false}
                title={() => "质量预检明细"}
                dataSource={quality?.issues ?? []}
                columns={[
                  {
                    title: "级别",
                    dataIndex: "level",
                    width: 90,
                    render: (value: string) => value === "error" ? <Tag color="red">阻断</Tag> : value === "warning" ? <Tag color="gold">复核</Tag> : <Tag color="blue">提示</Tag>
                  },
                  { title: "校验项", dataIndex: "title", width: 170 },
                  { title: "数量", dataIndex: "count", width: 80, align: "right" },
                  { title: "涉及订单", dataIndex: "orderNos", render: (values: string[]) => values?.length ? values.join("、") : "-" },
                  { title: "建议", dataIndex: "message" }
                ]}
              />
            </Space>
          );
        })()}
      </Modal>
      <Modal title="修改我的密码" open={passwordModalOpen} onCancel={() => setPasswordModalOpen(false)} onOk={submitPasswordChange} okText="保存新密码" confirmLoading={accountSaving}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input.Password value={passwordDraft.currentPassword} onChange={(event) => setPasswordDraft((value) => ({ ...value, currentPassword: event.target.value }))} placeholder="当前密码" />
          <Input.Password value={passwordDraft.nextPassword} onChange={(event) => setPasswordDraft((value) => ({ ...value, nextPassword: event.target.value }))} placeholder="新密码，至少 10 位" />
        </Space>
      </Modal>
      <Modal title="新建账号" open={userModalOpen} onCancel={() => setUserModalOpen(false)} onOk={submitNewUser} okText="创建账号" confirmLoading={accountSaving}>
        <Space direction="vertical" style={{ width: "100%" }}>
          <Input value={newUser.username} onChange={(event) => setNewUser((value) => ({ ...value, username: event.target.value }))} placeholder="登录账号" />
          <Input value={newUser.displayName} onChange={(event) => setNewUser((value) => ({ ...value, displayName: event.target.value }))} placeholder="姓名" />
          <Input.Password value={newUser.password} onChange={(event) => setNewUser((value) => ({ ...value, password: event.target.value }))} placeholder="初始密码，至少 10 位" />
          <Input value={newUser.dingtalkUserId} onChange={(event) => setNewUser((value) => ({ ...value, dingtalkUserId: event.target.value }))} placeholder="钉钉用户 ID（可后续维护）" />
          <Select
            value={newUser.role}
            onChange={(role) => setNewUser((value) => ({ ...value, role }))}
            options={roleDirectory.map((role) => ({ value: role.role, label: role.label }))}
            placeholder="选择账号角色"
          />
        </Space>
      </Modal>
      <Modal
        title={`维护 ${dingtalkMappingTarget?.displayName ?? ""} 的钉钉用户 ID`}
        open={Boolean(dingtalkMappingTarget)}
        onCancel={() => { setDingtalkMappingTarget(null); setDingtalkUserIdDraft(""); }}
        onOk={submitDingtalkMapping}
        okText="保存映射"
        confirmLoading={accountSaving}
      >
        <Typography.Paragraph type="secondary">用于将个人确认单链接发送至该员工的钉钉单聊；留空并保存即可移除映射。</Typography.Paragraph>
        <Input value={dingtalkUserIdDraft} onChange={(event) => setDingtalkUserIdDraft(event.target.value)} placeholder="钉钉用户 ID" autoFocus />
      </Modal>
    </>
  );
}
