import { Button, Card, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { getFinanceDashboard } from "../../api/finance.api";
import { getRisks } from "../../api/risks.api";
import { markRiskReviewed } from "../../api/workflow.api";
import type { DashboardData, FinanceOrder } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type RiskRow = {
  id: number;
  riskType: string;
  riskLevel: string;
  riskReasons: string;
  suggestion: string;
  status: string;
  financeOrder?: RiskFinanceOrder;
};

type RiskFinanceOrder = FinanceOrder & {
  receivableFreight?: number;
  receivableClearance?: number;
  receivableDelivery?: number;
  otherReceivable?: number;
  payableFreight?: number;
  payableClearance?: number;
  payableDelivery?: number;
  otherCost?: number;
};

type RawDataRow = {
  key: string;
  orderNo: string;
  businessType: string;
  direction: "应收" | "应付";
  feeType: string;
  originalAmount: number;
  exchangeRate: number | null;
  convertedAmount: number;
  supplierName: string;
  salespersonName: string;
  orderTime: string;
};

type MetricCard = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥").replace(/\s/g, "");
}

function pctText(value?: number | null) {
  return typeof value === "number" ? formatPercent(value) : "-";
}

function riskLevelText(row: RiskRow) {
  if (row.riskType === "low_profit") return "高风险";
  if (row.riskType === "abnormal_high_profit") return "异常高利润";
  return row.riskLevel === "high" ? "高风险" : "异常高利润";
}

function riskReasonText(row: RiskRow) {
  if (row.riskType === "low_profit") return "利润率低于10%";
  if (row.riskType === "abnormal_high_profit") return "异常高利润-需复核应付成本漏录";
  if (row.riskType === "cost_missing") return "成本缺失-需补录应付";
  if (row.riskType === "exchange_rate_missing") return "汇率缺失-需确认原始汇率";
  return row.riskReasons?.replace(`${row.financeOrder?.orderNo}：`, "") || "待复核";
}

function rawRows(order?: RiskFinanceOrder): RawDataRow[] {
  if (!order) return [];
  const exchangeRate = order.exchangeRate ?? null;
  const orderTime = order.orderDate ? order.orderDate.replace("T", " ").slice(0, 19) : "-";
  const feeRows = [
    { direction: "应付" as const, feeType: "运费", amount: order.payableFreight ?? 0 },
    { direction: "应付" as const, feeType: "操作费", amount: (order.payableClearance ?? 0) + (order.payableDelivery ?? 0) + (order.otherCost ?? 0) },
    { direction: "应收" as const, feeType: "运费", amount: order.receivableFreight ?? 0 },
    { direction: "应收" as const, feeType: "操作费", amount: (order.receivableClearance ?? 0) + (order.receivableDelivery ?? 0) + (order.otherReceivable ?? 0) }
  ];

  return feeRows
    .filter((item) => Math.abs(item.amount ?? 0) > 0)
    .map((item, index) => ({
      key: `${order.id}-${index}`,
      orderNo: order.orderNo,
      businessType: order.businessType,
      direction: item.direction,
      feeType: item.feeType,
      originalAmount: item.amount,
      exchangeRate,
      convertedAmount: item.amount,
      supplierName: item.direction === "应付" ? order.supplierName || "未指定供应商" : "未指定供应商",
      salespersonName: order.salespersonName,
      orderTime
    }));
}

export default function Risks() {
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<RiskRow | null>(null);
  const [filter, setFilter] = useState("all");
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [riskRes, dashboardRes] = await Promise.all([
        getRisks(),
        getFinanceDashboard("2026-06")
      ]);
      setRows(riskRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("风险复查数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = dashboard?.summary;
  const highRiskCount = rows.filter((row) => row.riskType === "low_profit").length;
  const abnormalProfitCount = rows.filter((row) => row.riskType === "abnormal_high_profit").length;

  const metrics: MetricCard[] = useMemo(() => [
    {
      title: "总应收",
      value: toPlainMoney(summary?.totalReceivable),
      accent: "blue",
      tag: "优化后",
      note: "按原始表格汇率口径折算"
    },
    {
      title: "调整后毛利",
      value: toPlainMoney(summary?.totalGrossProfit),
      accent: "green",
      tag: formatPercent(summary?.grossProfitRate),
      note: "可用于经营分析口径"
    },
    {
      title: "物流提成",
      value: toPlainMoney(summary?.totalCommission),
      accent: "orange",
      tag: "15%",
      note: "统一按物流毛利计提"
    },
    {
      title: "高风险票",
      value: `${highRiskCount}票`,
      accent: "red",
      tag: "需复核",
      note: "汇率、负毛利、缺应付"
    },
    {
      title: "总票数",
      value: `${dashboard?.orderCount ?? 0}`,
      accent: "blue",
      tag: "Excel",
      note: "按运单口径去重"
    },
    {
      title: "调整后应付",
      value: toPlainMoney(summary?.totalPayable),
      accent: "green",
      tag: "含暂估",
      note: "清关/派送缺应付补齐"
    }
  ], [dashboard?.orderCount, highRiskCount, summary]);

  const filteredRows = useMemo(() => {
    if (filter === "high") return rows.filter((row) => row.riskType === "low_profit");
    if (filter === "abnormal") return rows.filter((row) => row.riskType === "abnormal_high_profit");
    return rows;
  }, [filter, rows]);

  const handleMarkReviewed = async (row: RiskRow) => {
    await markRiskReviewed(row.id);
    message.success(`${row.financeOrder?.orderNo} 已标记复核`);
    await loadData();
  };

  useEffect(() => {
    setExpandedKeys(filteredRows[0] ? [filteredRows[0].id] : []);
  }, [filteredRows]);

  const columns: ColumnsType<RiskRow> = [
    {
      title: "单号",
      dataIndex: ["financeOrder", "orderNo"],
      fixed: "left",
      width: 150,
      render: (_, row) => <strong>{row.financeOrder?.orderNo ?? "-"}</strong>
    },
    {
      title: "订单号",
      dataIndex: ["financeOrder", "customerOrderNo"],
      width: 170,
      render: (_, row) => row.financeOrder?.customerOrderNo || row.financeOrder?.customerName || "-"
    },
    {
      title: "等级",
      width: 120,
      render: (_, row) => {
        const level = riskLevelText(row);
        return <Tag color={level === "高风险" ? "red" : "gold"}>{level}</Tag>;
      }
    },
    { title: "业务类型", dataIndex: ["financeOrder", "businessType"], width: 180 },
    { title: "业务员", dataIndex: ["financeOrder", "salespersonName"], width: 130 },
    { title: "风险原因", width: 330, render: (_, row) => riskReasonText(row) },
    {
      title: "复查状态",
      dataIndex: "status",
      width: 140,
      render: (status: string) => status === "reviewed" ? <Tag color="green">已复核</Tag> : <Tag color="gold">待复核</Tag>
    },
    {
      title: "操作",
      fixed: "right",
      width: 230,
      render: (_, row) => (
        <Space size={6}>
          <Button size="small">详情</Button>
          <Button size="small" onClick={() => setSelectedRisk(row)}>原始数据</Button>
          <Button size="small" onClick={() => handleMarkReviewed(row)}>
            标记复核
          </Button>
        </Space>
      )
    }
  ];

  const rawColumns: ColumnsType<RawDataRow> = [
    { title: "运单号", dataIndex: "orderNo", width: 120 },
    { title: "业务类型", dataIndex: "businessType", width: 120 },
    { title: "收付", dataIndex: "direction", width: 70 },
    { title: "费用类型", dataIndex: "feeType", width: 100 },
    { title: "原始金额", dataIndex: "originalAmount", align: "right", render: toPlainMoney },
    { title: "使用汇率", dataIndex: "exchangeRate", width: 90, render: (value) => value ?? "-" },
    { title: "折算金额", dataIndex: "convertedAmount", align: "right", render: toPlainMoney },
    { title: "供应商", dataIndex: "supplierName", width: 130 },
    { title: "销售代表", dataIndex: "salespersonName", width: 100 },
    { title: "下单时间", dataIndex: "orderTime", width: 170 }
  ];

  return (
    <div className="risk-board">
      <header className="profit-hero">
        <div>
          <h1>2026年6月跨境电商经营与提成测试台</h1>
          <p>基于 6月数据 Excel 汇总，统一汇率、倒推成本、物流提成和风险复核口径。</p>
        </div>
        <Space size={12} wrap>
          <div className="profit-source">数据源：<b>6月数据 Excel</b></div>
          <Button type="primary" className="profit-month-btn">2026年6月</Button>
          <Button className="profit-print-btn" onClick={() => window.print()}>打印 / 导出 PDF</Button>
          <Button onClick={loadData}>刷新</Button>
        </Space>
      </header>

      <section className="profit-metric-grid">
        {metrics.map((item) => (
          <Card key={item.title} className={`profit-metric-card profit-accent-${item.accent}`} loading={loading}>
            <span className="profit-metric-icon" />
            <span className="profit-metric-title">{item.title}</span>
            <strong>{item.value}</strong>
            <div className="profit-metric-note">
              <Tag bordered={false}>{item.tag}</Tag>
              <span>{item.note}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card
        className="risk-review-card"
        title="风险复查验证"
        extra={<Tag bordered={false} className="risk-alert-tag">低利润率与异常高利润均需复核</Tag>}
      >
        <div className="risk-filter-bar">
          <span>风险业务</span>
          <Select
            value={filter}
            onChange={setFilter}
            options={[
              { label: "全部风险业务", value: "all" },
              { label: "高风险业务", value: "high" },
              { label: "异常高利润", value: "abnormal" }
            ]}
          />
          <Tag color="red">高风险 {highRiskCount}</Tag>
          <Tag color="gold">异常高利润 {abnormalProfitCount}</Tag>
          <Tag color="blue">点击原始数据查看 Excel 明细</Tag>
        </div>

        <Table
          rowKey="id"
          className="risk-review-table"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          pagination={false}
          scroll={{ x: 1350 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpand: (expanded, row) => setExpandedKeys(expanded ? [row.id] : []),
            expandedRowRender: (row) => {
              const order = row.financeOrder;
              return (
                <div className="risk-expanded">
                  <p>
                    <strong>判定逻辑：</strong>
                    应收{toPlainMoney(order?.adjustedReceivable)} / 应付{toPlainMoney(order?.adjustedPayable)} /
                    毛利率{pctText(order?.adjustedGrossProfitRate)}
                  </p>
                  <p>
                    <strong>处理动作：</strong>
                    {row.riskType === "low_profit" ? "高风险业务：复核收入、应付成本和费用归集" : "异常高利润：需复核应付成本是否漏录"}
                  </p>
                  <p><strong>复查说明：</strong>暂无补充说明</p>
                </div>
              );
            }
          }}
        />
      </Card>

      <Modal
        open={Boolean(selectedRisk)}
        title="原始数据明细"
        width={980}
        footer={null}
        onCancel={() => setSelectedRisk(null)}
      >
        <div className="risk-modal-subtitle">
          {selectedRisk?.financeOrder?.orderNo} · {selectedRisk?.financeOrder?.businessType} · {riskReasonText(selectedRisk ?? {} as RiskRow)}
        </div>
        <Table
          rowKey="key"
          className="risk-raw-table"
          columns={rawColumns}
          dataSource={rawRows(selectedRisk?.financeOrder)}
          pagination={false}
          scroll={{ x: 1120 }}
        />
      </Modal>
    </div>
  );
}
