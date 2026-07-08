import { Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCustomerProfitAnalysis } from "../../api/analytics.api";
import { getFinanceDashboard } from "../../api/finance.api";
import type { DashboardData } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type MetricCard = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

type CustomerRow = {
  customerName: string;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  orderCount: number;
};

type DonutItem = {
  name: string;
  value: number;
  color: string;
};

type MatrixRow = {
  key: string;
  label: string;
  values: Array<string | number>;
};

type CustomerAnalysis = {
  rows: CustomerRow[];
  receivableRank: CustomerRow[];
  profitRank: CustomerRow[];
};

const palette = ["#3574df", "#20a878", "#df9419", "#dc4853", "#716bb2", "#31aeb0", "#9aa8ba"];

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN楼", "楼").replace(/\s/g, "");
}

function pctText(value?: number | null) {
  return typeof value === "number" ? formatPercent(value) : "-";
}

function compactCustomerRows(rows: CustomerRow[], sortKey: "receivable" | "grossProfit") {
  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  const topRows = sorted.slice(0, 6);
  const otherRows = sorted.slice(6);
  const other = otherRows.reduce<CustomerRow>((sum, row) => ({
    customerName: "其余客户",
    receivable: sum.receivable + row.receivable,
    payable: sum.payable + row.payable,
    grossProfit: sum.grossProfit + row.grossProfit,
    grossProfitRate: null,
    orderCount: sum.orderCount + row.orderCount
  }), {
    customerName: "其余客户",
    receivable: 0,
    payable: 0,
    grossProfit: 0,
    grossProfitRate: null,
    orderCount: 0
  });

  const result = other.orderCount > 0 ? [...topRows, other] : topRows;
  return result.map((row) => ({
    ...row,
    grossProfitRate: row.receivable > 0 ? row.grossProfit / row.receivable : null
  }));
}

function donutPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = {
    x: cx + radius * Math.cos(startAngle),
    y: cy + radius * Math.sin(startAngle)
  };
  const end = {
    x: cx + radius * Math.cos(endAngle),
    y: cy + radius * Math.sin(endAngle)
  };
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function DonutChart({ title, items }: { title: string; items: DonutItem[] }) {
  const total = Math.max(items.reduce((sum, item) => sum + item.value, 0), 1);
  const cx = 250;
  const cy = 155;
  const radius = 78;
  const strokeWidth = 34;
  let angle = -Math.PI / 2;

  return (
    <div className="customer-donut-card">
      <h3>{title}</h3>
      <svg viewBox="0 0 500 300" className="customer-donut-svg" role="img">
        <circle cx={cx} cy={cy} r={radius} fill="none" stroke="#edf2f8" strokeWidth={strokeWidth} />
        {items.map((item, index) => {
          const share = item.value / total;
          const start = angle;
          const end = angle + share * Math.PI * 2;
          const mid = (start + end) / 2;
          const labelX = cx + Math.cos(mid) * 130;
          const labelY = cy + Math.sin(mid) * 105;
          const lineX = cx + Math.cos(mid) * 100;
          const lineY = cy + Math.sin(mid) * 92;
          angle = end;

          return (
            <g key={item.name}>
              <path d={donutPath(cx, cy, radius, start, end)} fill="none" stroke={item.color} strokeWidth={strokeWidth} />
              <polyline
                points={`${cx + Math.cos(mid) * 92},${cy + Math.sin(mid) * 92} ${lineX},${lineY} ${labelX},${labelY}`}
                fill="none"
                stroke={item.color}
                strokeWidth="1.5"
              />
              <text x={labelX} y={labelY - 7} textAnchor={labelX < cx ? "end" : "start"} className="customer-donut-label">
                {item.name}
              </text>
              <text x={labelX} y={labelY + 9} textAnchor={labelX < cx ? "end" : "start"} className="customer-donut-percent">
                {formatPercent(share)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="customer-donut-legend">
        {items.map((item) => (
          <span key={item.name}><i style={{ background: item.color }} />{item.name}</span>
        ))}
      </div>
    </div>
  );
}

function makeMatrixRows(customers: CustomerRow[], mode: "receivable" | "profit"): MatrixRow[] {
  if (mode === "receivable") {
    return [
      { key: "receivable", label: "总应收", values: customers.map((item) => toPlainMoney(item.receivable)) },
      { key: "payable", label: "总应付", values: customers.map((item) => toPlainMoney(item.payable)) },
      { key: "profit", label: "总毛利", values: customers.map((item) => toPlainMoney(item.grossProfit)) },
      { key: "rate", label: "毛利率", values: customers.map((item) => pctText(item.grossProfitRate)) }
    ];
  }

  return [
    { key: "profit", label: "总毛利", values: customers.map((item) => toPlainMoney(item.grossProfit)) },
    { key: "rate", label: "毛利率", values: customers.map((item) => pctText(item.grossProfitRate)) },
    { key: "receivable", label: "总应收", values: customers.map((item) => toPlainMoney(item.receivable)) },
    { key: "payable", label: "总应付", values: customers.map((item) => toPlainMoney(item.payable)) }
  ];
}

function CustomerMatrix({ title, tag, customers, rows }: { title: string; tag: string; customers: CustomerRow[]; rows: MatrixRow[] }) {
  const columns: ColumnsType<MatrixRow> = [
    {
      title: "类目",
      dataIndex: "label",
      fixed: "left",
      align: "center",
      width: 150,
      render: (value) => <strong>{value}</strong>
    },
    ...customers.map((customer, index) => ({
      title: (
        <div className="customer-table-head">
          <span>{index + 1}号客户</span>
          <strong>{customer.customerName}</strong>
        </div>
      ),
      dataIndex: ["values", index],
      align: "right" as const
    }))
  ];

  return (
    <div className="customer-matrix-wrap">
      <div className="customer-matrix-title">
        <strong>{title}</strong>
        <Tag bordered={false}>{tag}</Tag>
      </div>
      <Table
        rowKey="key"
        className="customer-matrix-table"
        columns={columns}
        dataSource={rows}
        pagination={false}
        bordered
        scroll={{ x: 1280 }}
      />
    </div>
  );
}

export default function CustomerProfit() {
  const [analysis, setAnalysis] = useState<CustomerAnalysis | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, dashboardRes] = await Promise.all([
        getCustomerProfitAnalysis("2026-06"),
        getFinanceDashboard("2026-06")
      ]);
      setAnalysis(ledgerRes.data);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("客户利润分析数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = dashboard?.summary;

  const metrics: MetricCard[] = useMemo(() => [
    {
      title: "总应收",
      value: toPlainMoney(summary?.totalReceivable),
      accent: "blue",
      tag: "优化后",
      note: "汇率缺失统一按 6.85 修正"
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
      value: `${summary?.riskOrderCount ?? 0}票`,
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
  ], [dashboard?.orderCount, summary]);

  const customerRows = analysis?.rows ?? [];
  const receivableCustomers = analysis?.receivableRank ?? compactCustomerRows(customerRows, "receivable");
  const profitCustomers = analysis?.profitRank ?? compactCustomerRows(customerRows, "grossProfit");

  const receivableDonut = receivableCustomers.map((item, index) => ({
    name: item.customerName,
    value: item.receivable,
    color: palette[index % palette.length]
  }));
  const profitDonut = profitCustomers.map((item, index) => ({
    name: item.customerName,
    value: item.grossProfit,
    color: palette[index % palette.length]
  }));

  const topReceivable = receivableCustomers[0];
  const topProfit = profitCustomers[0];
  const otherProfit = profitCustomers.find((item) => item.customerName === "其余客户");

  return (
    <div className="customer-board">
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
        className="customer-profit-card"
        title="公司客户费用应收应付分析表"
        extra={<Tag bordered={false} className="customer-sort-tag">按照流水大小</Tag>}
        loading={loading}
      >
        <div className="customer-chart-grid">
          <DonutChart title="应收占比" items={receivableDonut} />
          <DonutChart title="毛利占比" items={profitDonut} />
        </div>

        <div className="customer-highlight-grid">
          <div>
            <span>最大流水客户</span>
            <strong>{topReceivable?.customerName ?? "-"}</strong>
            <b>{toPlainMoney(topReceivable?.receivable)}</b>
          </div>
          <div>
            <span>最高毛利客户</span>
            <strong>{topProfit?.customerName ?? "-"}</strong>
            <b>{toPlainMoney(topProfit?.grossProfit)}</b>
          </div>
          <div>
            <span>其余客户毛利</span>
            <strong>合并口径</strong>
            <b>{toPlainMoney(otherProfit?.grossProfit ?? 0)}</b>
          </div>
        </div>

        <CustomerMatrix
          title="公司客户费用应收应付分析表"
          tag="按照流水大小"
          customers={receivableCustomers}
          rows={makeMatrixRows(receivableCustomers, "receivable")}
        />

        <CustomerMatrix
          title="公司客户利润分析表"
          tag="按照毛利大小"
          customers={profitCustomers}
          rows={makeMatrixRows(profitCustomers, "profit")}
        />
      </Card>
    </div>
  );
}
