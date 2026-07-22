import {
  CalendarOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyOutlined
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, Modal, Space, Spin, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFinanceDashboard, getFinanceMonths } from "../../api/finance.api";
import { downloadMonthlyReport } from "../../api/workflow.api";
import { ImportButton } from "../../components/ImportButton";
import { TemplateImportButton } from "../../components/TemplateImportButton";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { BusinessSummary, DashboardData, MonthlyTrend } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";
import { useAuth } from "../../contexts/AuthContext";
import { hasPermission } from "../../config/access";

type Kpi = {
  title: string;
  value: string;
  color: string;
  icon: string;
  mom: string;
  yoy: string;
};

type RankingRow = {
  rank: number;
  salespersonName: string;
  orderCount: number;
  receivable: number;
  grossProfit: number;
  commission: number;
  signatureStatus: string;
};

type MonthOption = {
  month: string;
  totalReceivable: number;
  totalGrossProfit: number;
};

function toMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥");
}

function pct(value?: number | null) {
  return typeof value === "number" ? `${value > 0 ? "+" : ""}${formatPercent(value)}` : "--";
}

function pctPoint(value?: number | null) {
  if (typeof value !== "number") return "--";
  return `${value > 0 ? "+" : ""}${(value * 100).toFixed(2)}pct`;
}

function MetricCard({ item }: { item: Kpi }) {
  return (
    <Card className="overview-kpi-card">
      <div className="overview-kpi-head">
        <span>{item.title}</span>
        <span className="overview-kpi-icon" style={{ background: item.color }}>{item.icon}</span>
      </div>
      <div className="overview-kpi-value">{item.value}</div>
      <div className="overview-kpi-line"><span>环比</span><b className="up">↑ {item.mom}</b></div>
      <div className="overview-kpi-line"><span>同比</span><b className="up">↑ {item.yoy}</b></div>
    </Card>
  );
}

function TrendPanel({ data }: { data: MonthlyTrend[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const months = data.length ? data : [];
  const max = Math.max(...months.flatMap((item) => [item.receivable, item.payable, item.grossProfit]), 1);
  const width = 650;
  const height = 280;
  const xAt = (index: number) => 42 + (index * (width - 78)) / Math.max(months.length - 1, 1);
  const yAt = (value: number) => height - 40 - (value / max) * 190;
  const line = (key: keyof MonthlyTrend) => months.map((item, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(Number(item[key] ?? 0))}`).join(" ");
  const activeMonth = activeIndex === null ? null : months[activeIndex];
  const hoverBounds = (index: number) => {
    const current = xAt(index);
    const left = index === 0 ? 28 : (xAt(index - 1) + current) / 2;
    const right = index === months.length - 1 ? width - 28 : (current + xAt(index + 1)) / 2;
    return { left, width: Math.max(right - left, 1) };
  };

  return (
    <Card className="overview-card" title="月度经营趋势图（近12个月）">
      <div className="overview-chart-legend">
        <span><i className="legend-blue" />总应收（元）</span>
        <span><i className="legend-green" />总应付（元）</span>
        <span><i className="legend-orange" />调整后毛利（元）</span>
        <span><i className="legend-purple" />毛利率（%）</span>
      </div>
      <div className="overview-trend-stage" onMouseLeave={() => setActiveIndex(null)}>
        <svg className="overview-trend-svg" viewBox={`0 0 ${width} ${height}`}>
          {[0, 1, 2, 3, 4].map((tick) => (
            <line key={tick} x1="42" x2={width - 28} y1={35 + tick * 48} y2={35 + tick * 48} className="overview-grid" />
          ))}
          {activeIndex !== null ? (() => {
            const bounds = hoverBounds(activeIndex);
            return <rect x={bounds.left} y="22" width={bounds.width} height={height - 52} rx="6" className="overview-hover-column" />;
          })() : null}
          {months.map((item, index) => (
            <g key={item.month} className={activeIndex !== null && activeIndex !== index ? "overview-month-dimmed" : ""}>
              <rect x={xAt(index) - 7} y={yAt(item.payable)} width="14" height={height - 40 - yAt(item.payable)} rx="3" className={activeIndex === index ? "overview-payable-bar is-active" : "overview-payable-bar"} />
              <text x={xAt(index)} y={height - 14} textAnchor="middle" className={activeIndex === index ? "overview-axis is-active" : "overview-axis"}>{item.month.slice(5)}</text>
            </g>
          ))}
          <path d={line("receivable")} fill="none" stroke="#3769d7" strokeWidth="3" />
          <path d={line("grossProfit")} fill="none" stroke="#f59a23" strokeWidth="3" />
          <path d={line("grossProfitRate")} fill="none" stroke="#7567cc" strokeWidth="2.5" strokeDasharray="5 5" />
          {activeMonth && activeIndex !== null ? (
            <g className="overview-active-points">
              <circle cx={xAt(activeIndex)} cy={yAt(activeMonth.receivable)} r="6" fill="#3769d7" />
              <circle cx={xAt(activeIndex)} cy={yAt(activeMonth.grossProfit)} r="6" fill="#f59a23" />
              <circle cx={xAt(activeIndex)} cy={yAt(Number(activeMonth.grossProfitRate ?? 0))} r="5" fill="#7567cc" />
            </g>
          ) : null}
          {months.map((item, index) => {
            const bounds = hoverBounds(index);
            return (
              <rect
                key={`hover-${item.month}`}
                x={bounds.left}
                y="20"
                width={bounds.width}
                height={height - 46}
                fill="#fff"
                fillOpacity="0.001"
                className="overview-hover-target"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseMove={() => setActiveIndex(index)}
                onPointerEnter={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onBlur={() => setActiveIndex(null)}
                tabIndex={0}
                aria-label={`${item.month}经营数据`}
              />
            );
          })}
        </svg>
        {activeMonth && activeIndex !== null ? (
          <div
            className="overview-trend-tooltip"
            style={{
              left: `${(xAt(activeIndex) / width) * 100}%`,
              transform: activeIndex >= months.length / 2 ? "translateX(-100%)" : "translateX(0)"
            }}
          >
            <strong>{activeMonth.month}</strong>
            <span><i className="legend-blue" />总应收<b>{toMoney(activeMonth.receivable)}</b></span>
            <span><i className="legend-green" />总应付<b>{toMoney(activeMonth.payable)}</b></span>
            <span><i className="legend-orange" />调整后毛利<b>{toMoney(activeMonth.grossProfit)}</b></span>
            <span><i className="legend-purple" />毛利率<b>{formatPercent(activeMonth.grossProfitRate)}</b></span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function CustomerDonut({ topProfit, otherProfit }: { topProfit: number; otherProfit: number }) {
  const total = Math.max(topProfit + otherProfit, 1);
  const topPercent = topProfit / total;
  const circumference = 2 * Math.PI * 48;

  return (
    <div className="overview-donut-wrap">
      <svg viewBox="0 0 140 140" className="overview-donut">
        <circle cx="70" cy="70" r="48" stroke="#e6edf8" strokeWidth="22" fill="none" />
        <circle
          cx="70"
          cy="70"
          r="48"
          stroke="#4073df"
          strokeWidth="22"
          fill="none"
          strokeDasharray={`${topPercent * circumference} ${(1 - topPercent) * circumference}`}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r="48"
          stroke="#45c58d"
          strokeWidth="22"
          fill="none"
          strokeDasharray={`${(1 - topPercent) * circumference} ${topPercent * circumference}`}
          strokeDashoffset={-topPercent * circumference}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="overview-donut-notes">
        <div><i className="legend-blue" />TOP客户 <b>{formatPercent(topPercent)}</b><span>{toMoney(topProfit)}</span></div>
        <div><i className="legend-green" />其余客户 <b>{formatPercent(1 - topPercent)}</b><span>{toMoney(otherProfit)}</span></div>
      </div>
    </div>
  );
}

function riskItem(label: string, count: number, note: string) {
  return (
    <div className="risk-mini-item">
      <b>{count}票</b>
      <span>{label}</span>
      <em>{note}</em>
    </div>
  );
}

const businessColumns: ColumnsType<BusinessSummary> = [
  { title: "业务类型", dataIndex: "businessType" },
  { title: "本月应收", dataIndex: "receivable", render: toMoney },
  { title: "本月毛利", dataIndex: "grossProfit", render: toMoney },
  { title: "本月毛利率", dataIndex: "grossProfitRate", render: formatPercent },
  {
    title: "环比毛利变化",
    dataIndex: "momGrossProfitChange",
    render: (value) => typeof value === "number"
      ? <span className={value >= 0 ? "up" : "down"}>{pct(value)}</span>
      : "--"
  },
  {
    title: "同比毛利变化",
    dataIndex: "yoyGrossProfitChange",
    render: (value) => typeof value === "number"
      ? <span className={value >= 0 ? "up" : "down"}>{pct(value)}</span>
      : "--"
  }
];

const rankingColumns: ColumnsType<RankingRow> = [
  { title: "排名", dataIndex: "rank", render: (value) => <span className="rank-badge">{value}</span>, width: 70 },
  { title: "业务员", dataIndex: "salespersonName" },
  { title: "票数", dataIndex: "orderCount" },
  { title: "应收金额", dataIndex: "receivable", render: toMoney },
  { title: "毛利金额", dataIndex: "grossProfit", render: toMoney },
  { title: "提成金额", dataIndex: "commission", render: toMoney },
  {
    title: "签名状态",
    dataIndex: "signatureStatus",
    render: (status) => {
      const labels: Record<string, { color: string; text: string }> = {
        confirmed: { color: "green", text: "主管确认" },
        signed: { color: "cyan", text: "已签名" },
        pending: { color: "gold", text: "待签名" },
        not_generated: { color: "default", text: "未生成" }
      };
      const item = labels[String(status)] ?? { color: "default", text: String(status || "-") };
      return <Tag color={item.color}>{item.text}</Tag>;
    }
  }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const permissions = user?.auth?.permissions;
  const isSalesAccount = user?.role === "sales" || user?.role === "sales_operator";
  const canImport = hasPermission(permissions, "finance:import");
  const canExport = hasPermission(permissions, "reports:export");
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [monthModalOpen, setMonthModalOpen] = useState(false);
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [draftMonth, setDraftMonth] = useState(selectedMonth);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const loadMonth = useCallback(async (month: string) => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await getFinanceDashboard(month);
      setData(response.data);
    } catch {
      setData(null);
      setLoadError("经营总览加载失败，请检查登录状态或后端服务。");
    } finally {
      setLoading(false);
    }
  }, []);

  const load = useCallback(() => {
    return loadMonth(selectedMonth);
  }, [loadMonth, selectedMonth]);

  useEffect(() => {
    load();
  }, [load]);

  const openMonthModal = async () => {
    setDraftMonth(selectedMonth);
    setMonthModalOpen(true);
    try {
      const res = await getFinanceMonths();
      setMonthOptions(res.data.rows ?? []);
    } catch {
      message.error("月份列表加载失败，请确认后端服务可用。");
    }
  };

  const confirmMonth = () => {
    setSelectedMonth(draftMonth);
    setMonthModalOpen(false);
  };

  const handleImported = (result: { month: string }) => {
    setSelectedMonth(result.month);
    void loadMonth(result.month);
    message.success(`已切换到导入月份 ${result.month}`);
  };

  const summary = data?.summary;
  const businessRows = data?.businessSummary ?? [];
  const rankingRows: RankingRow[] = (data?.salespersonSummary ?? []).slice(0, 5);
  const allSupplierRows = data?.supplierPayableSummary ?? [];
  const supplierRows = allSupplierRows.slice(0, 3);
  const customerRows = data?.customerProfitSummary ?? [];
  const topReceivableCustomer = [...customerRows].sort((a, b) => b.receivable - a.receivable)[0];
  const topProfitCustomer = customerRows[0];

  const totalReceivable = summary?.totalReceivable ?? 0;
  const totalPayable = summary?.totalPayable ?? 0;
  const totalProfit = summary?.totalGrossProfit ?? 0;
  const grossRate = summary?.grossProfitRate ?? 0;
  const logisticsCommission = summary?.totalCommission ?? 0;
  const riskCount = summary?.riskOrderCount ?? 0;
  const riskOverview = data?.riskOverview;
  const trend = data?.monthlyTrend ?? [];
  const logisticsCustomerProfit = customerRows.reduce((sum, item) => sum + item.grossProfit, 0);
  const topCustomerProfit = topProfitCustomer?.grossProfit ?? 0;
  const otherCustomerProfit = Math.max(logisticsCustomerProfit - topCustomerProfit, 0);
  const supplierPayableTotal = allSupplierRows.reduce((sum, item) => sum + item.payable, 0);
  const unassignedSupplierPayable = allSupplierRows.find((item) => item.supplierName === "未指定供应商")?.payable ?? 0;
  const averageLogisticsPayable = supplierPayableTotal / Math.max(data?.logisticsOrderCount ?? data?.orderCount ?? 1, 1);

  const kpis: Kpi[] = [
    { title: "总应收", value: toMoney(totalReceivable), color: "#4c7ee8", icon: "¥", mom: pct(data?.comparison?.momReceivable), yoy: pct(data?.comparison?.yoyReceivable) },
    { title: "总应付", value: toMoney(totalPayable), color: "#37b99d", icon: "□", mom: pct(data?.comparison?.momPayable), yoy: pct(data?.comparison?.yoyPayable) },
    { title: "调整后毛利", value: toMoney(totalProfit), color: "#f28c2d", icon: "↗", mom: pct(data?.comparison?.momGrossProfit), yoy: pct(data?.comparison?.yoyGrossProfit) },
    { title: "毛利率", value: formatPercent(grossRate), color: "#8a5ce5", icon: "%", mom: pctPoint(data?.comparison?.momGrossProfitRate), yoy: pctPoint(data?.comparison?.yoyGrossProfitRate) },
    { title: "总票数", value: `${data?.orderCount ?? 0}票`, color: "#3d78ed", icon: "▤", mom: pct(data?.comparison?.momOrderCount), yoy: pct(data?.comparison?.yoyOrderCount) },
    { title: "物流提成", value: toMoney(logisticsCommission), color: "#4e76ee", icon: "♟", mom: pct(data?.comparison?.momCommission), yoy: pct(data?.comparison?.yoyCommission) },
    ...(hasPermission(permissions, "risk:read")
      ? [{ title: "高风险票数", value: `${riskCount}票`, color: "#ec454d", icon: "!", mom: pct(data?.comparison?.momRiskOrderCount), yoy: pct(data?.comparison?.yoyRiskOrderCount) }]
      : [])
  ];

  return (
    <div className="overview-page">
      <header className="overview-topbar">
        <div className="overview-title-block">
          {hasPermission(permissions, "ledger:read") ? <Button type="text" icon={<MenuOutlined />} className="overview-menu-btn" onClick={() => navigate("/finance-ledger")} /> : null}
          <h1>{isSalesAccount ? "我的经营" : "经营总览"}</h1>
          <span>{isSalesAccount ? "仅显示本人销售订单、利润与提成" : "数据概览与经营分析"}</span>
        </div>
        <div className="overview-actions">
          <div className="overview-select"><FileExcelOutlined /> 数据源：<b>{summary?.month ? `${summary.month} 数据库` : "Excel 数据"}</b></div>
          <Button className="overview-select" onClick={openMonthModal}>月份：<b>{selectedMonth}</b><CalendarOutlined /></Button>
          {canImport ? <TemplateImportButton /> : null}
          {canImport ? <ImportButton targetMonth={selectedMonth} onImported={handleImported} /> : null}
          {canExport ? <Button type="primary" loading={reportDownloading} icon={<DownloadOutlined />} onClick={async () => {
            setReportDownloading(true);
            try {
              await downloadMonthlyReport(selectedMonth);
              message.success("月报已下载");
            } catch {
              message.error("月报下载失败，请检查登录状态或后端服务");
            } finally {
              setReportDownloading(false);
            }
          }}>导出月报</Button> : null}
        </div>
        <div className="overview-refresh"><ReloadOutlined /> 最后更新：导入或切换月份后实时刷新</div>
      </header>

      {loadError ? <Alert className="overview-load-alert" type="error" showIcon message={loadError} action={<Button onClick={load}>重试</Button>} /> : null}
      {loading && !data ? <div className="page-state"><Spin size="large" tip="正在加载经营数据" /></div> : null}

      {data && !summary ? (
        <Card className="first-import-card">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={<Space direction="vertical" size={4}><strong>当前月份暂无可查看数据</strong><span>{canImport ? "请上传符合固定表头规范的 Excel，系统会生成原始台账、应收应付、毛利、风险与提成数据。" : "当前账号不能导入数据，请联系财务或主管确认月份及数据范围。"}</span></Space>}
          >
            <Space wrap>
              {canImport ? <ImportButton targetMonth={selectedMonth} onImported={handleImported} /> : null}
              {canImport ? <TemplateImportButton /> : null}
              <Button onClick={() => navigate("/settings")}>查看模板与参数规则</Button>
            </Space>
          </Empty>
        </Card>
      ) : data ? <><section className="overview-kpi-grid">
        {kpis.map((item) => <MetricCard key={item.title} item={item} />)}
      </section>

      <section className="overview-main-grid">
        <TrendPanel data={trend} />
        <Card className="overview-card" title="业务类型利润同比环比变化" extra={hasPermission(permissions, "profit:read") ? <Button type="link" onClick={() => navigate("/profit-analysis")}>查看更多</Button> : null}>
          <Table rowKey="businessType" columns={businessColumns} dataSource={businessRows.slice(0, 6)} pagination={false} size="small" />
        </Card>
      </section>

      <section className={`overview-three-grid${isSalesAccount ? " is-personal" : ""}`}>
        <Card className="overview-card" title={isSalesAccount ? "我的毛利与提成（本月）" : "业务员毛利排行（本月）"} extra={hasPermission(permissions, "commission:read") ? <Button type="link" onClick={() => navigate("/commission")}>查看更多</Button> : null}>
          <Table rowKey="rank" columns={rankingColumns} dataSource={rankingRows} pagination={false} size="small" />
        </Card>
        <Card className="overview-card" title="客户利润概览" extra={hasPermission(permissions, "customer-profit:read") ? <Button type="link" onClick={() => navigate("/customer-profit")}>查看更多</Button> : null}>
          <div className="customer-summary">
            <CustomerDonut topProfit={topCustomerProfit} otherProfit={otherCustomerProfit} />
            <div className="customer-side-metrics">
              <span>最大流水客户</span>
              <b>{topReceivableCustomer?.customerName ?? "-"}</b>
              <em>应收 <strong>{toMoney(topReceivableCustomer?.receivable ?? 0)}</strong></em>
              <em>票数 <strong>{topReceivableCustomer?.orderCount ?? 0}票</strong></em>
              <span>最高毛利客户</span>
              <b>{topProfitCustomer?.customerName ?? "-"}</b>
              <em>毛利 <strong>{toMoney(topProfitCustomer?.grossProfit ?? 0)}</strong></em>
              <em>毛利占比 <strong>{formatPercent(topProfitCustomer?.profitRatio ?? 0)}</strong></em>
            </div>
          </div>
        </Card>
        {hasPermission(permissions, "payables:read") ? <Card className="overview-card" title="上游应付集中度" extra={<Button type="link" onClick={() => navigate("/payables")}>查看更多</Button>}>
          <Table
            rowKey="supplierName"
            pagination={false}
            size="small"
            dataSource={supplierRows}
            columns={[
              { title: "TOP 3 上游供应商", dataIndex: "supplierName" },
              { title: "票数", dataIndex: "orderCount" },
              { title: "应付金额", dataIndex: "payable", render: toMoney },
              { title: "未付金额", dataIndex: "outstanding", render: toMoney },
              { title: "占比", dataIndex: "ratio", render: formatPercent }
            ]}
          />
          <div className="supplier-foot">
            <span>未指定供应商应付 <b>{toMoney(unassignedSupplierPayable)}</b></span>
            <span>单票平均应付成本 <b>{toMoney(averageLogisticsPayable)}</b></span>
          </div>
        </Card> : null}
      </section>

      {hasPermission(permissions, "risk:read") ? <section className="overview-risk-grid">
        <Card className="overview-card risk-card" title="风险趋势（本月）" extra={hasPermission(permissions, "risk:read") ? <Button type="link" onClick={() => navigate("/risks")}>查看更多</Button> : null}>
          <div className="risk-mini-grid">
            {riskItem("高风险票数", riskOverview?.highRiskCount ?? riskCount, "待复核")}
            {riskItem("中风险票数", riskOverview?.mediumRiskCount ?? 0, "异常高利润")}
            {riskItem("负毛利订单", riskOverview?.negativeProfitCount ?? 0, "需查成本")}
            {riskItem("毛利率<5%", riskOverview?.lowProfitUnderFiveCount ?? 0, "重点跟进")}
            {riskItem("异常高利润", riskOverview?.abnormalHighProfitCount ?? 0, "防漏成本")}
            {riskItem("汇率缺失", riskOverview?.exchangeRateMissingCount ?? 0, "按原表复核")}
            {riskItem("缺应付", riskOverview?.costMissingCount ?? 0, "补录成本")}
          </div>
          <div className="risk-alert">
            <SafetyOutlined /> 风险提示：本月待复核 {riskOverview?.openRiskCount ?? riskCount} 票，已复核 {riskOverview?.reviewedRiskCount ?? 0} 票。
            {riskOverview?.topRiskReason ? ` 首要风险：${riskOverview.topRiskReason}` : " 暂无待复核风险。"}
          </div>
        </Card>
      </section> : null}

      <footer className="overview-footer">XJD Finance UI 财务提成分析系统 © 2026 All Rights Reserved.</footer>

      </> : null}

      <Modal
        open={monthModalOpen}
        title="选择经营月份"
        okText="切换月份"
        cancelText="取消"
        onOk={confirmMonth}
        onCancel={() => setMonthModalOpen(false)}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <Input type="month" value={draftMonth} onChange={(event) => setDraftMonth(event.target.value || selectedMonth)} />
          <div className="month-option-list">
            {monthOptions.map((item) => (
              <button key={item.month} type="button" className="month-option" onClick={() => setDraftMonth(item.month)}>
                <span>{item.month}</span>
                <em>应收 {toMoney(item.totalReceivable)} / 毛利 {toMoney(item.totalGrossProfit)}</em>
              </button>
            ))}
          </div>
        </Space>
      </Modal>
    </div>
  );
}
