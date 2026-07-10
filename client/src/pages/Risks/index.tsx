import { Alert, Button, Card, Input, Modal, Select, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Key } from "react";
import { getFinanceDashboard, getRawLedgerLines } from "../../api/finance.api";
import { getRisks, reviewRisk } from "../../api/risks.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { DashboardData, FinanceOrder, RawLedgerLine } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type RiskRow = {
  id: number;
  riskType: string;
  riskLevel: string;
  riskReasons: string;
  suggestion: string;
  status: string;
  reviewNote?: string | null;
  reviewConclusion?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  financeOrder?: RiskFinanceOrder;
};

type RiskFinanceOrder = FinanceOrder & {
  receivableFreight?: number;
  receivableClearance?: number;
  receivableDelivery?: number;
  receivableCompensation?: number;
  otherReceivable?: number;
  payableFreight?: number;
  payableClearance?: number;
  payableDelivery?: number;
  payableCompensation?: number;
  otherCost?: number;
};

type RawDataRow = {
  id: number;
  rowIndex: number;
  orderNo: string;
  customerOrderNo: string;
  customerName: string;
  service: string;
  direction: string;
  feeType: string;
  amount: number | null;
  localAmount: number | null;
  exchangeRate: string;
  supplierName: string;
  salespersonName: string;
  customerServiceName: string;
  orderTime: string;
  parseStatus: string;
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

function rawText(row: RawLedgerLine, field: string) {
  const value = row.canonical?.[field] ?? row.raw?.[field];
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function rawNumber(row: RawLedgerLine, field: string) {
  const value = row.canonical?.[field] ?? row.raw?.[field];
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function rawMoney(value?: number | null) {
  return <span className="risk-raw-money">{toPlainMoney(value)}</span>;
}

function rawRows(lines: RawLedgerLine[]): RawDataRow[] {
  return lines.map((line) => ({
    id: line.id,
    rowIndex: line.rowIndex,
    orderNo: rawText(line, "orderNo"),
    customerOrderNo: rawText(line, "customerOrderNo"),
    customerName: rawText(line, "customerName"),
    service: rawText(line, "service"),
    direction: rawText(line, "direction"),
    feeType: rawText(line, "feeType"),
    amount: rawNumber(line, "amount"),
    localAmount: rawNumber(line, "localAmount"),
    exchangeRate: rawText(line, "exchangeRate"),
    supplierName: rawText(line, "supplier"),
    salespersonName: rawText(line, "salespersonName"),
    customerServiceName: rawText(line, "customerServiceName"),
    orderTime: rawText(line, "orderDate"),
    parseStatus: line.parseStatus
  }));
}

export default function Risks() {
  const { selectedMonth } = useSelectedMonth();
  const [rows, setRows] = useState<RiskRow[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [selectedRisk, setSelectedRisk] = useState<RiskRow | null>(null);
  const [rawLines, setRawLines] = useState<RawLedgerLine[]>([]);
  const [rawLoading, setRawLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [expandedKeys, setExpandedKeys] = useState<Key[]>([]);
  const [loading, setLoading] = useState(false);
  const [reviewingRisk, setReviewingRisk] = useState<RiskRow | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewConclusion, setReviewConclusion] = useState("已复核，按原始台账和成本口径确认");
  const [reviewedBy, setReviewedBy] = useState("主管");
  const [reviewSaving, setReviewSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [riskRes, dashboardRes] = await Promise.all([
        getRisks(selectedMonth),
        getFinanceDashboard(selectedMonth)
      ]);
      setRows(riskRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("风险复查数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

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

  const openReviewModal = (row: RiskRow) => {
    setReviewingRisk(row);
    setReviewConclusion(row.reviewConclusion || "已复核，按原始台账和成本口径确认");
    setReviewNote(row.reviewNote || riskReasonText(row));
    setReviewedBy(row.reviewedBy || "主管");
  };

  const submitReview = async () => {
    if (!reviewingRisk) return;
    if (!reviewNote.trim()) {
      message.error("请填写风险复核说明");
      return;
    }

    setReviewSaving(true);
    try {
      await reviewRisk(reviewingRisk.id, {
        reviewNote,
        reviewConclusion,
        reviewedBy
      });
      message.success(`${reviewingRisk.financeOrder?.orderNo} 风险复核已保存`);
      setReviewingRisk(null);
      await loadData();
    } catch {
      message.error("风险复核保存失败，请检查权限或后端服务");
    } finally {
      setReviewSaving(false);
    }
  };

  const openRawData = async (row: RiskRow) => {
    setSelectedRisk(row);
    setRawLines([]);
    const orderNo = row.financeOrder?.orderNo;
    if (!orderNo) return;

    setRawLoading(true);
    try {
      const response = await getRawLedgerLines({ month: selectedMonth, orderNo });
      setRawLines(response.data.rows ?? []);
    } catch {
      message.error("原始 Excel 明细加载失败，请确认后端数据库可用。");
    } finally {
      setRawLoading(false);
    }
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
          <Button size="small" onClick={() => setExpandedKeys([row.id])}>详情</Button>
          <Button size="small" onClick={() => openRawData(row)}>原始数据</Button>
          <Button size="small" onClick={() => openReviewModal(row)}>
            复核
          </Button>
        </Space>
      )
    }
  ];

  const rawColumns: ColumnsType<RawDataRow> = [
    { title: "Excel行", dataIndex: "rowIndex", width: 80, fixed: "left" },
    { title: "运单号", dataIndex: "orderNo", width: 130, fixed: "left" },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 150 },
    { title: "业务类型", dataIndex: "service", width: 120 },
    { title: "收付", dataIndex: "direction", width: 70 },
    { title: "费用类型", dataIndex: "feeType", width: 100 },
    { title: "原始金额", dataIndex: "amount", align: "right", width: 128, render: rawMoney },
    { title: "本币费用", dataIndex: "localAmount", align: "right", width: 128, render: rawMoney },
    { title: "汇率/标注", dataIndex: "exchangeRate", width: 100 },
    { title: "供应商", dataIndex: "supplierName", width: 130 },
    { title: "销售代表", dataIndex: "salespersonName", width: 100 },
    { title: "客服代表", dataIndex: "customerServiceName", width: 100 },
    { title: "解析状态", dataIndex: "parseStatus", width: 100, render: (value) => <Tag color={value === "parsed" ? "green" : "gold"}>{value}</Tag> },
    { title: "下单时间", dataIndex: "orderTime", width: 170 }
  ];

  const enhancedRawColumns = useMemo<ColumnsType<RawDataRow>>(() => {
    const columns: ColumnsType<RawDataRow> = [];
    for (const column of rawColumns) {
      columns.push(column);
      if ("dataIndex" in column && column.dataIndex === "customerOrderNo") {
        columns.push({ title: "对应用户", dataIndex: "customerName", width: 150 });
      }
    }
    return columns;
  }, []);

  return (
    <div className="risk-board">
      <header className="profit-hero">
        <div>
          <h1>2026年6月跨境电商经营与提成测试台</h1>
          <p>基于 6月数据 Excel 汇总，统一汇率、倒推成本、物流提成和风险复核口径。</p>
        </div>
        <Space size={12} wrap>
          <div className="profit-source">数据源：<b>6月数据 Excel</b></div>
          <Button type="primary" className="profit-month-btn">{selectedMonth}</Button>
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
                  <p><strong>复核结论：</strong>{row.reviewConclusion || "待主管填写"}</p>
                  <p><strong>复核说明：</strong>{row.reviewNote || "暂无补充说明"}</p>
                  {row.reviewedAt && <p><strong>复核人/时间：</strong>{row.reviewedBy || "-"} / {String(row.reviewedAt).replace("T", " ").slice(0, 19)}</p>}
                </div>
              );
            }
          }}
        />
      </Card>

      <Modal
        open={Boolean(selectedRisk)}
        title="原始数据明细"
        width={1180}
        footer={null}
        onCancel={() => setSelectedRisk(null)}
      >
        <div className="risk-modal-subtitle">
          {selectedRisk?.financeOrder?.orderNo} · {selectedRisk?.financeOrder?.businessType} · {riskReasonText(selectedRisk ?? {} as RiskRow)}
        </div>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 12 }}
          message="以下数据来自数据库保存的 Excel 原始明细行"
          description="用于复核应收、应付、汇率、供应商、销售代表和下单时间。聚合订单金额必须能追溯到这些原始行。"
        />
        <Table
          rowKey="id"
          className="risk-raw-table"
          loading={rawLoading}
          columns={enhancedRawColumns}
          dataSource={rawRows(rawLines)}
          pagination={false}
          locale={{ emptyText: rawLoading ? "加载中" : "未找到该运单的原始 Excel 行" }}
          scroll={{ x: 1580 }}
        />
      </Modal>

      <Modal
        open={Boolean(reviewingRisk)}
        title={`风险复核：${reviewingRisk?.financeOrder?.orderNo ?? ""}`}
        okText="保存复核"
        cancelText="取消"
        confirmLoading={reviewSaving}
        onOk={submitReview}
        onCancel={() => setReviewingRisk(null)}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Alert
            type="warning"
            showIcon
            message={reviewingRisk ? riskReasonText(reviewingRisk) : "风险复核"}
            description="请记录复核依据、处理结论和责任人；保存后会写入风险记录和操作审计日志。"
          />
          <Input value={reviewedBy} onChange={(event) => setReviewedBy(event.target.value)} addonBefore="复核人" />
          <Input value={reviewConclusion} onChange={(event) => setReviewConclusion(event.target.value)} addonBefore="处理结论" />
          <Input.TextArea
            value={reviewNote}
            onChange={(event) => setReviewNote(event.target.value)}
            rows={5}
            placeholder="填写复核说明，例如：已核对原始 Excel 应收应付、供应商成本和汇率标注，确认可关闭风险；或说明需补录的成本/回款问题。"
          />
        </Space>
      </Modal>
    </div>
  );
}
