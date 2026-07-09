import { Alert, Button, Card, Descriptions, Input, Modal, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAuthContext,
  getImportBatches,
  getParameterRules,
  rollbackImportBatch,
  updateParameterRule
} from "../../api/finance.api";
import { login } from "../../api/auth.api";
import {
  getActionLogs,
  getMonthCloseStatus,
  lockMonth,
  unlockMonth,
  type ActionLogRow,
  type MonthCloseStatus
} from "../../api/workflow.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { AuthContext, ImportBatch, ParameterRule } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const roleStorageKey = "xjd-finance-role";
const tokenStorageKey = "xjd-finance-token";

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

export default function Settings() {
  const { selectedMonth } = useSelectedMonth();
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [currentRole, setCurrentRole] = useState(() => localStorage.getItem(roleStorageKey) || "admin");
  const [loginUser, setLoginUser] = useState(() => localStorage.getItem("xjd-finance-user") || "");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [loginLoading, setLoginLoading] = useState(false);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [rules, setRules] = useState<ParameterRule[]>([]);
  const [monthClose, setMonthClose] = useState<MonthCloseStatus | null>(null);
  const [actionLogs, setActionLogs] = useState<ActionLogRow[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft>({});
  const [loading, setLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [logsLoading, setLogsLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [savingRuleKey, setSavingRuleKey] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<ImportBatch | null>(null);

  const permissions = useMemo(() => new Set(auth?.permissions ?? []), [auth]);
  const canWriteRules = permissions.has("rules:write");
  const canRollback = permissions.has("finance:rollback");
  const canCloseMonth = permissions.has("finance:close");
  const isMonthLocked = monthClose?.status === "locked";

  const loadAuth = useCallback(async () => {
    const res = await getAuthContext();
    setAuth(res.data);
  }, []);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getImportBatches(selectedMonth);
      setBatches(res.data.rows ?? []);
    } catch {
      message.error("导入批次加载失败，请确认后端服务可用");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try {
      const res = await getParameterRules();
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
  }, []);

  const loadMonthClose = useCallback(async () => {
    try {
      const res = await getMonthCloseStatus(selectedMonth);
      setMonthClose(res.data);
      setCloseNote(res.data.closeNote ?? "");
    } catch {
      message.error("月度锁账状态加载失败，请确认后端服务可用");
    }
  }, [selectedMonth]);

  const loadActionLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await getActionLogs({ month: selectedMonth });
      setActionLogs(res.data.rows ?? []);
    } catch {
      message.error("操作审计日志加载失败，请确认后端服务可用");
    } finally {
      setLogsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadAuth().catch(() => message.error("角色权限加载失败"));
  }, [loadAuth, currentRole]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  useEffect(() => {
    loadMonthClose();
  }, [loadMonthClose]);

  useEffect(() => {
    loadActionLogs();
  }, [loadActionLogs]);

  const changeRole = (role: string) => {
    localStorage.setItem(roleStorageKey, role);
    setCurrentRole(role);
    message.success("角色已切换，后续请求会按新角色权限执行");
  };

  const submitLogin = async () => {
    setLoginLoading(true);
    try {
      const res = await login(username, password);
      localStorage.setItem(tokenStorageKey, res.data.token);
      localStorage.setItem(roleStorageKey, res.data.user.role);
      localStorage.setItem("xjd-finance-user", `${res.data.user.displayName}（${res.data.user.username}）`);
      setLoginUser(`${res.data.user.displayName}（${res.data.user.username}）`);
      setCurrentRole(res.data.user.role);
      message.success(`已登录：${res.data.user.displayName}`);
      await loadAuth();
    } catch {
      message.error("登录失败，请检查账号密码");
    } finally {
      setLoginLoading(false);
    }
  };

  const logout = async () => {
    localStorage.removeItem(tokenStorageKey);
    localStorage.removeItem("xjd-finance-user");
    setLoginUser("");
    message.success("已退出登录，系统回到本地测试角色模式");
    await loadAuth();
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
        await lockMonth(selectedMonth, closeNote || "月度财务复核完成，锁定本月数据");
        message.success(`${selectedMonth} 已锁账，导入和回滚已禁止`);
      } else {
        await unlockMonth(selectedMonth, closeNote || "主管解锁，允许补充调整");
        message.success(`${selectedMonth} 已解锁`);
      }
      await Promise.all([loadMonthClose(), loadBatches(), loadActionLogs()]);
    } catch {
      message.error("月度锁账操作失败，请检查角色权限或后端服务");
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
        updatedBy: auth?.label ?? "finance-admin"
      });
      message.success("参数规则已保存");
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
      width: 170,
      fixed: "right",
      render: (_, row) => (
        <Space size={6}>
          <Button size="small" onClick={() => setSelectedBatch(row)}>详情</Button>
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
    { title: "对象", width: 180, render: (_, row) => `${row.entityType} / ${row.entityId}` },
    { title: "动作", dataIndex: "action", width: 180, render: (value) => <Tag color="blue">{value}</Tag> },
    { title: "操作人", dataIndex: "operator", width: 120 },
    {
      title: "摘要",
      dataIndex: "payloadJson",
      ellipsis: true,
      render: (value) => {
        if (!value) return "-";
        try {
          const parsed = JSON.parse(value);
          if (parsed.batchNo) return `${parsed.batchNo} ${parsed.fileName ?? ""}`.trim();
          if (parsed.note) return parsed.note;
          if (parsed.count !== undefined) return `数量 ${parsed.count}`;
          return JSON.stringify(parsed).slice(0, 120);
        } catch {
          return String(value).slice(0, 120);
        }
      }
    }
  ];

  return (
    <>
      <PageHeader
        title="参数规则"
        description="系统严格按照后台参数规则和原始表格标注执行汇率、风险、提成和服务类确认口径。"
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card title="登录与角色权限">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <Space wrap>
              <Input style={{ width: 180 }} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="账号" />
              <Input.Password style={{ width: 180 }} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="密码" />
              <Button type="primary" loading={loginLoading} onClick={submitLogin}>登录</Button>
              <Button onClick={logout} disabled={!loginUser}>退出</Button>
              {loginUser && <Tag color="green">已登录：{loginUser}</Tag>}
            </Space>
            <Space wrap>
              <span>当前角色</span>
              <Select
                value={currentRole}
                style={{ width: 220 }}
                options={(auth?.roles ?? []).map((role) => ({ label: role.label, value: role.role }))}
                onChange={changeRole}
              />
              <Tag color="blue">{auth?.label ?? currentRole}</Tag>
            </Space>
            <Space wrap>
              {(auth?.permissions ?? []).map((permission) => <Tag key={permission}>{permission}</Tag>)}
            </Space>
            <Alert
              type="info"
              showIcon
              message="已支持正式登录 token，同时保留本地测试角色模式"
              description="默认测试账号：admin/admin123、finance/finance123、supervisor/supervisor123、boss/boss123、sales/sales123。登录后后端优先按 token 中的用户角色鉴权；未登录时才使用本地测试角色。"
            />
          </Space>
        </Card>

        <Card title="运行地址与数据库">
          <Descriptions column={1}>
            <Descriptions.Item label="前端访问地址">http://localhost:5173/</Descriptions.Item>
            <Descriptions.Item label="后端接口地址">{apiBaseUrl}</Descriptions.Item>
            <Descriptions.Item label="本地后端端口">4000</Descriptions.Item>
            <Descriptions.Item label="本地数据库">prisma/dev.db</Descriptions.Item>
            <Descriptions.Item label="线上后端接口">https://cross-border-finance-server.onrender.com/api</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card title={`月度锁账控制（${selectedMonth}）`}>
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
                description="锁账后，该月份 Excel 导入和导入批次回滚都会被后端拒绝。"
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
        </Card>

        <Card title="数据库参数规则" extra={<Button onClick={loadRules} loading={rulesLoading}>刷新规则</Button>}>
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
        </Card>

        <Card title={`导入批次记录（${selectedMonth}）`} extra={<Button onClick={loadBatches} loading={loading}>刷新</Button>}>
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
        </Card>

        <Card title={`操作审计日志（${selectedMonth}）`} extra={<Button onClick={loadActionLogs} loading={logsLoading}>刷新日志</Button>}>
          <Alert
            type="success"
            showIcon
            style={{ marginBottom: 12 }}
            message="关键财务动作会写入数据库审计日志"
            description="当前已记录 Excel 导入、批次回滚、锁账/解锁、确认单生成、发送签名、员工签名、主管确认、风险复核和提成确认等操作。"
          />
          <Table
            rowKey="id"
            size="small"
            loading={logsLoading}
            columns={logColumns}
            dataSource={actionLogs}
            pagination={{ pageSize: 8 }}
          />
        </Card>
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
    </>
  );
}
