import { Alert, Button, Card, Descriptions, Input, Popconfirm, Select, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAuthContext,
  getImportBatches,
  getParameterRules,
  rollbackImportBatch,
  updateParameterRule
} from "../../api/finance.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { AuthContext, ImportBatch, ParameterRule } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";
const roleStorageKey = "xjd-finance-role";

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

export default function Settings() {
  const { selectedMonth } = useSelectedMonth();
  const [auth, setAuth] = useState<AuthContext | null>(null);
  const [currentRole, setCurrentRole] = useState(() => localStorage.getItem(roleStorageKey) || "admin");
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [rules, setRules] = useState<ParameterRule[]>([]);
  const [ruleDrafts, setRuleDrafts] = useState<RuleDraft>({});
  const [loading, setLoading] = useState(false);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [savingRuleKey, setSavingRuleKey] = useState<string | null>(null);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const permissions = useMemo(() => new Set(auth?.permissions ?? []), [auth]);
  const canWriteRules = permissions.has("rules:write");
  const canRollback = permissions.has("finance:rollback");

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

  useEffect(() => {
    loadAuth().catch(() => message.error("角色权限加载失败"));
  }, [loadAuth, currentRole]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useEffect(() => {
    loadRules();
  }, [loadRules]);

  const changeRole = (role: string) => {
    localStorage.setItem(roleStorageKey, role);
    setCurrentRole(role);
    message.success("角色已切换，后续请求会按新角色权限执行");
  };

  const rollback = async (id: number) => {
    setRollingBackId(id);
    try {
      await rollbackImportBatch(id);
      message.success("批次已回滚，当前月份汇总已重新计算");
      await loadBatches();
    } catch {
      message.error("批次回滚失败，请检查角色权限或批次状态");
    } finally {
      setRollingBackId(null);
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
      title: "操作",
      width: 110,
      fixed: "right",
      render: (_, row) => (
        <Popconfirm
          title="确认回滚该导入批次？"
          description="回滚会删除该批次写入的订单、提成、风险和服务确认记录，并重新计算月度汇总。"
          okText="确认回滚"
          cancelText="取消"
          disabled={row.status !== "active" || !canRollback}
          onConfirm={() => rollback(row.id)}
        >
          <Button danger size="small" disabled={row.status !== "active" || !canRollback} loading={rollingBackId === row.id}>
            回滚
          </Button>
        </Popconfirm>
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

  return (
    <>
      <PageHeader
        title="参数规则"
        description="系统严格按照后台参数规则和原始表格标注执行汇率、风险、提成和服务类确认口径。"
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card title="角色权限">
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
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
              message="当前为轻量级角色模式"
              description="角色保存在本机浏览器，用请求头传给后端。后端已对导入、回滚、参数保存等敏感接口做权限校验；后续可替换为正式登录账号。"
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
            description={canRollback ? "当前角色可以回滚生效批次。回滚会删除该批次订单和派生记录，并重新计算汇总。" : "当前角色只能查看批次，不能回滚。"}
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
      </Space>
    </>
  );
}
