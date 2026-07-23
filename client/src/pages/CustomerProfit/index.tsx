import { Alert, Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCustomerProfitAnalysis } from "../../api/analytics.api";
import { getFinanceDashboard } from "../../api/finance.api";
import { useAuth } from "../../contexts/AuthContext";
import { useSelectedMonth } from "../../contexts/MonthContext";
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
  payable?: number;
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
  visibility?: { upstreamCosts: boolean };
  rows: CustomerRow[];
  receivableRank: CustomerRow[];
  profitRank: CustomerRow[];
};

const palette = ["#3574df", "#20a878", "#df9419", "#dc4853", "#716bb2", "#31aeb0", "#9aa8ba"];

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥").replace(/\s/g, "");
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
    payable: (sum.payable ?? 0) + (row.payable ?? 0),
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

function makeMatrixRows(customers: CustomerRow[], mode: "receivable" | "profit", showPayable: boolean): MatrixRow[] {
  if (mode === "receivable") {
    return [
      { key: "receivable", label: "总应收", values: customers.map((item) => toPlainMoney(item.receivable)) },
      ...(showPayable ? [{ key: "payable", label: "总应付", values: customers.map((item) => toPlainMoney(item.payable)) }] : []),
      { key: "profit", label: "总毛利", values: customers.map((item) => toPlainMoney(item.grossProfit)) },
      { key: "rate", label: "毛利率", values: customers.map((item) => pctText(item.grossProfitRate)) }
    ];
  }

  return [
    { key: "profit", label: "总毛利", values: customers.map((item) => toPlainMoney(item.grossProfit)) },
    { key: "rate", label: "毛利率", values: customers.map((item) => pctText(item.grossProfitRate)) },
    { key: "receivable", label: "总应收", values: customers.map((item) => toPlainMoney(item.receivable)) },
    ...(showPayable ? [{ key: "payable", label: "总应付", values: customers.map((item) => toPlainMoney(item.payable)) }] : [])
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
  const { user } = useAuth();
  const isSalesAccount = user?.role === "sales" || user?.role === "sales_operator";
  const { selectedMonth } = useSelectedMonth();
  const [analysis, setAnalysis] = useState<CustomerAnalysis | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, dashboardRes] = await Promise.all([
        getCustomerProfitAnalysis(selectedMonth),
        getFinanceDashboard(selectedMonth)
      ]);
      setAnalysis(ledgerRes.data);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("客户利润分析数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = dashboard?.summary;
  const customerRows = analysis?.rows ?? [];
  const showUpstreamCosts = !isSalesAccount && analysis?.visibility?.upstreamCosts !== false;
  const logisticsReceivable = customerRows.reduce((sum, item) => sum + item.receivable, 0);
  const logisticsPayable = customerRows.reduce((sum, item) => sum + (item.payable ?? 0), 0);
  const logisticsProfit = customerRows.reduce((sum, item) => sum + item.grossProfit, 0);
  const logisticsGrossRate = logisticsReceivable > 0 ? logisticsProfit / logisticsReceivable : null;
  const logisticsOrderCount = customerRows.reduce((sum, item) => sum + item.orderCount, 0);

  const metrics: MetricCard[] = useMemo(() => {
    const rows: MetricCard[] = [
    {
      title: "总应收",
      value: toPlainMoney(logisticsReceivable),
      accent: "blue",
      tag: "仅物流",
      note: "不含注册/证书/店铺等服务类应收"
    },
    {
      title: "调整后毛利",
      value: toPlainMoney(logisticsProfit),
      accent: "green",
      tag: formatPercent(logisticsGrossRate),
      note: "客户利润页仅按物流客户计算"
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
      note: isSalesAccount ? "低毛利、异常毛利等需关注订单" : "汇率、负毛利、缺应付"
    },
    {
      title: "总票数",
      value: `${logisticsOrderCount}`,
      accent: "blue",
      tag: "物流票",
      note: "服务类订单已排除"
    }
    ];
    if (showUpstreamCosts) rows.push({
      title: "调整后应付",
      value: toPlainMoney(logisticsPayable),
      accent: "green",
      tag: "仅物流",
      note: "不含注册/证书/店铺等服务类应付"
    });
    return rows;
  }, [logisticsGrossRate, logisticsOrderCount, logisticsPayable, logisticsProfit, logisticsReceivable, showUpstreamCosts, summary]);

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
          <h1>{isSalesAccount ? `${selectedMonth} 我的客户利润` : `${selectedMonth} 跨境物流财务管理`}</h1>
          <p>{isSalesAccount ? "仅显示本人名下客户的应收、已核算毛利、毛利率与订单数量。" : "基于当前有效导入批次汇总，统一汇率、倒推成本、物流提成和风险复核口径。"}</p>
        </div>
        <Space size={12} wrap>
          <div className="profit-source">数据源：<b>{selectedMonth} 数据库</b></div>
          <Button type="primary" className="profit-month-btn">{selectedMonth}</Button>
          <Button className="profit-print-btn" onClick={() => window.print()}>打印 / 导出 PDF</Button>
          <Button onClick={loadData}>刷新</Button>
        </Space>
      </header>

      <section className="profit-metric-grid">
        {metrics.map((item) => (
          <Card key={item.title} className={`profit-metric-card profit-accent-${item.accent}`} loading={loading} aria-label={`${item.title}：${item.value}`}>
            <span className="profit-metric-icon" aria-hidden="true" />
            <span className="profit-metric-title">{item.title}</span>
            <strong>{item.value}</strong>
            <div className="profit-metric-note">
              <Tag bordered={false}>{item.tag}</Tag>
              <span>{item.note}</span>
            </div>
          </Card>
        ))}
      </section>

      <Alert
        className="customer-scope-alert"
        type="info"
        showIcon
        message="客户利润分析口径提醒"
        description={isSalesAccount ? "本页只统计本人名下物流客户的应收与已核算毛利；注册、证书、公司注销、店铺租赁等服务提成请到“我的注册提成”查看。" : "本页应收、应付、毛利、图表和客户明细只统计物流业务；注册、证书、公司注销、店铺租赁等服务类订单已排除，需到“注册提成”页面单独查看。"}
      />

      <Card
        className="customer-profit-card"
        title={isSalesAccount ? "我的客户应收与毛利分析" : "公司客户费用应收应付分析表"}
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
          title={isSalesAccount ? "我的客户应收与毛利分析" : "公司客户费用应收应付分析表"}
          tag="按照流水大小"
          customers={receivableCustomers}
          rows={makeMatrixRows(receivableCustomers, "receivable", showUpstreamCosts)}
        />

        <CustomerMatrix
          title={isSalesAccount ? "我的客户利润分析" : "公司客户利润分析表"}
          tag="按照毛利大小"
          customers={profitCustomers}
          rows={makeMatrixRows(profitCustomers, "profit", showUpstreamCosts)}
        />
      </Card>
    </div>
  );
}
