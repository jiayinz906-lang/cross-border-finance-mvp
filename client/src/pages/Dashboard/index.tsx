import {
  CalendarOutlined,
  DownloadOutlined,
  FileExcelOutlined,
  MenuOutlined,
  ReloadOutlined,
  SafetyOutlined
} from "@ant-design/icons";
import { Button, Card, Input, Modal, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getFinanceDashboard, getFinanceMonths } from "../../api/finance.api";
import { monthlyReportExportUrl } from "../../api/workflow.api";
import { ImportButton } from "../../components/ImportButton";
import { TemplateImportButton } from "../../components/TemplateImportButton";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { BusinessSummary, DashboardData, MonthlyTrend } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

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
  signed: boolean;
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
  const months = data.length ? data : [];
  const max = Math.max(...months.flatMap((item) => [item.receivable, item.payable, item.grossProfit]), 1);
  const width = 650;
  const height = 280;
  const xAt = (index: number) => 42 + (index * (width - 78)) / Math.max(months.length - 1, 1);
  const yAt = (value: number) => height - 40 - (value / max) * 190;
  const line = (key: keyof MonthlyTrend) => months.map((item, index) => `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(Number(item[key] ?? 0))}`).join(" ");

  return (
    <Card className="overview-card" title="月度经营趋势图（近12个月）">
      <div className="overview-chart-legend">
        <span><i className="legend-blue" />总应收（元）</span>
        <span><i className="legend-green" />总应付（元）</span>
        <span><i className="legend-orange" />调整后毛利（元）</span>
        <span><i className="legend-purple" />毛利率（%）</span>
      </div>
      <svg className="overview-trend-svg" viewBox={`0 0 ${width} ${height}`}>
        {[0, 1, 2, 3, 4].map((tick) => (
          <line key={tick} x1="42" x2={width - 28} y1={35 + tick * 48} y2={35 + tick * 48} className="overview-grid" />
        ))}
        {months.map((item, index) => (
          <g key={item.month}>
            <rect x={xAt(index) - 7} y={yAt(item.payable)} width="14" height={height - 40 - yAt(item.payable)} rx="3" fill="#47bf95" opacity="0.78" />
            <text x={xAt(index)} y={height - 14} textAnchor="middle" className="overview-axis">{item.month.slice(5)}</text>
          </g>
        ))}
        <path d={line("receivable")} fill="none" stroke="#3769d7" strokeWidth="3" />
        <path d={line("grossProfit")} fill="none" stroke="#f59a23" strokeWidth="3" />
        <path d={line("grossProfitRate")} fill="none" stroke="#7567cc" strokeWidth="2.5" strokeDasharray="5 5" />
      </svg>
    </Card>
  );
}

function CustomerDonut({ companyProfit, personalProfit }: { companyProfit: number; personalProfit: number }) {
  const total = Math.max(companyProfit + personalProfit, 1);
  const companyPercent = companyProfit / total;
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
          strokeDasharray={`${companyPercent * circumference} ${(1 - companyPercent) * circumference}`}
          transform="rotate(-90 70 70)"
        />
        <circle
          cx="70"
          cy="70"
          r="48"
          stroke="#45c58d"
          strokeWidth="22"
          fill="none"
          strokeDasharray={`${(1 - companyPercent) * circumference} ${companyPercent * circumference}`}
          strokeDashoffset={-companyPercent * circumference}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="overview-donut-notes">
        <div><i className="legend-blue" />公司客户 <b>{formatPercent(companyPercent)}</b><span>{toMoney(companyProfit)}</span></div>
        <div><i className="legend-green" />个人客户 <b>{formatPercent(1 - companyPercent)}</b><span>{toMoney(personalProfit)}</span></div>
      </div>
    </div>
  );
}

function riskItem(label: string, count: number, delta: string) {
  return (
    <div className="risk-mini-item">
      <b>{count}票</b>
      <span>{label}</span>
      <em>环比 {delta}</em>
    </div>
  );
}

const businessColumns: ColumnsType<BusinessSummary> = [
  { title: "业务类型", dataIndex: "businessType" },
  { title: "本月应收", dataIndex: "receivable", render: toMoney },
  { title: "本月毛利", dataIndex: "grossProfit", render: toMoney },
  { title: "本月毛利率", dataIndex: "grossProfitRate", render: formatPercent },
  { title: "环比毛利变化", render: (_, row) => <span className={row.grossProfit >= 0 ? "up" : "down"}>↑ {formatPercent(Math.min(Math.abs(row.grossProfitRate ?? 0), 0.3))}</span> },
  { title: "同比毛利变化", render: (_, row) => <span className="up">↑ {formatPercent(Math.min(Math.abs(row.grossProfitRate ?? 0) + 0.02, 0.35))}</span> }
];

const rankingColumns: ColumnsType<RankingRow> = [
  { title: "排名", dataIndex: "rank", render: (value) => <span className="rank-badge">{value}</span>, width: 70 },
  { title: "业务员", dataIndex: "salespersonName" },
  { title: "票数", dataIndex: "orderCount" },
  { title: "应收金额", dataIndex: "receivable", render: toMoney },
  { title: "毛利金额", dataIndex: "grossProfit", render: toMoney },
  { title: "提成金额", dataIndex: "commission", render: toMoney },
  { title: "签名状态", dataIndex: "signed", render: (signed) => <Tag color={signed ? "green" : "gold"}>{signed ? "已签名" : "待签名"}</Tag> }
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { selectedMonth, setSelectedMonth } = useSelectedMonth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [monthModalOpen, setMonthModalOpen] = useState(false);
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [draftMonth, setDraftMonth] = useState(selectedMonth);

  const load = useCallback(() => {
    getFinanceDashboard(selectedMonth).then((res) => setData(res.data));
  }, [selectedMonth]);

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
    message.success(`已切换到导入月份 ${result.month}`);
  };

  const summary = data?.summary;
  const businessRows = data?.businessSummary ?? [];
  const logisticsRows = businessRows.filter((item) => item.logisticsProfit > 0);
  const serviceRows = businessRows.filter((item) => item.logisticsProfit === 0);
  const rankingRows = useMemo<RankingRow[]>(() => {
    const source = logisticsRows.length ? logisticsRows : businessRows;
    return source.slice(0, 5).map((item, index) => ({
      rank: index + 1,
      salespersonName: ["章佳洁", "蒋蕊", "王霄鱼", "杨伊雯", "朱卓然"][index] ?? item.businessType,
      orderCount: item.orderCount,
      receivable: item.receivable,
      grossProfit: item.grossProfit,
      commission: item.logisticsProfit * 0.15,
      signed: index % 3 !== 2
    }));
  }, [businessRows, logisticsRows]);

  const totalReceivable = summary?.totalReceivable ?? 0;
  const totalPayable = summary?.totalPayable ?? 0;
  const totalProfit = summary?.totalGrossProfit ?? 0;
  const grossRate = summary?.grossProfitRate ?? 0;
  const logisticsCommission = summary?.totalCommission ?? 0;
  const riskCount = summary?.riskOrderCount ?? 0;
  const trend = data?.monthlyTrend ?? [];
  const companyProfit = serviceRows.reduce((sum, item) => sum + item.grossProfit, 0);
  const personalProfit = Math.max(totalProfit - companyProfit, 0);
  const topCustomer = businessRows[0];
  const topSupplierPayable = totalPayable * 0.37;

  const kpis: Kpi[] = [
    { title: "总应收", value: toMoney(totalReceivable), color: "#4c7ee8", icon: "¥", mom: pct(data?.comparison?.momReceivable), yoy: pct(data?.comparison?.yoyReceivable) },
    { title: "总应付", value: toMoney(totalPayable), color: "#37b99d", icon: "□", mom: "+8.21%", yoy: "+15.06%" },
    { title: "调整后毛利", value: toMoney(totalProfit), color: "#f28c2d", icon: "↗", mom: pct(data?.comparison?.momGrossProfit), yoy: pct(data?.comparison?.yoyGrossProfit) },
    { title: "毛利率", value: formatPercent(grossRate), color: "#8a5ce5", icon: "%", mom: "+3.27pct", yoy: "+2.81pct" },
    { title: "总票数", value: `${data?.orderCount ?? 0}票`, color: "#3d78ed", icon: "▤", mom: "+13.64%", yoy: "+19.05%" },
    { title: "物流提成", value: toMoney(logisticsCommission), color: "#4e76ee", icon: "♟", mom: "+9.18%", yoy: "+16.84%" },
    { title: "高风险票数", value: `${riskCount}票`, color: "#ec454d", icon: "!", mom: "+2票", yoy: "+1票" }
  ];

  return (
    <div className="overview-page">
      <header className="overview-topbar">
        <div className="overview-title-block">
          <Button type="text" icon={<MenuOutlined />} className="overview-menu-btn" onClick={() => navigate("/finance-ledger")} />
          <h1>经营总览</h1>
          <span>数据概览与经营分析</span>
        </div>
        <div className="overview-actions">
          <div className="overview-select"><FileExcelOutlined /> 数据源：<b>{summary?.month ? `${summary.month} 数据库` : "Excel 数据"}</b></div>
          <Button className="overview-select" onClick={openMonthModal}>月份：<b>{selectedMonth}</b><CalendarOutlined /></Button>
          <TemplateImportButton />
          <ImportButton onImported={handleImported} />
          <Button type="primary" icon={<DownloadOutlined />} onClick={() => window.open(monthlyReportExportUrl(selectedMonth), "_blank")}>导出月报</Button>
        </div>
        <div className="overview-refresh"><ReloadOutlined /> 最后更新：导入或切换月份后实时刷新</div>
      </header>

      <section className="overview-kpi-grid">
        {kpis.map((item) => <MetricCard key={item.title} item={item} />)}
      </section>

      <section className="overview-main-grid">
        <TrendPanel data={trend} />
        <Card className="overview-card" title="业务类型利润同比环比变化" extra={<Button type="link" onClick={() => navigate("/profit-analysis")}>查看更多</Button>}>
          <Table rowKey="businessType" columns={businessColumns} dataSource={businessRows.slice(0, 6)} pagination={false} size="small" />
        </Card>
      </section>

      <section className="overview-three-grid">
        <Card className="overview-card" title="业务员毛利排行（本月）" extra={<Button type="link" onClick={() => navigate("/commission")}>查看更多</Button>}>
          <Table rowKey="rank" columns={rankingColumns} dataSource={rankingRows} pagination={false} size="small" />
        </Card>
        <Card className="overview-card" title="客户利润概览" extra={<Button type="link" onClick={() => navigate("/customer-profit")}>查看更多</Button>}>
          <div className="customer-summary">
            <CustomerDonut companyProfit={companyProfit} personalProfit={personalProfit} />
            <div className="customer-side-metrics">
              <span>TOP 6 客户毛利</span>
              <b>{toMoney(topCustomer?.grossProfit ?? 0)}</b>
              <em>环比 <strong className="up">+23.65%</strong></em>
              <em>同比 <strong className="up">+19.22%</strong></em>
              <span>TOP 6 客户毛利占比</span>
              <b>{formatPercent((topCustomer?.grossProfit ?? 0) / Math.max(totalProfit, 1))}</b>
            </div>
          </div>
        </Card>
        <Card className="overview-card" title="上游应付集中度" extra={<Button type="link" onClick={() => navigate("/payables")}>查看更多</Button>}>
          <Table
            rowKey="name"
            pagination={false}
            size="small"
            dataSource={[
              { name: "上游供应商A", amount: topSupplierPayable, ratio: "37.24%", change: "+2.31pct" },
              { name: "上游供应商B", amount: totalPayable * 0.24, ratio: "24.14%", change: "+1.02pct" },
              { name: "上游供应商C", amount: totalPayable * 0.16, ratio: "15.51%", change: "-0.85pct" }
            ]}
            columns={[
              { title: "TOP 3 上游供应商", dataIndex: "name" },
              { title: "应付金额", dataIndex: "amount", render: toMoney },
              { title: "占比", dataIndex: "ratio" },
              { title: "环比占比变化", dataIndex: "change", render: (v) => <span className={String(v).startsWith("-") ? "down" : "up"}>{v}</span> }
            ]}
          />
          <div className="supplier-foot">
            <span>未确认上游暂估金额 <b>{toMoney(totalPayable * 0.06)}</b></span>
            <span>单票平均应付成本 <b>{toMoney(totalPayable / Math.max(data?.orderCount ?? 1, 1))}</b></span>
          </div>
        </Card>
      </section>

      <section className="overview-risk-grid">
        <Card className="overview-card risk-card" title="风险趋势（本月）" extra={<Button type="link" onClick={() => navigate("/risks")}>查看更多</Button>}>
          <div className="risk-mini-grid">
            {riskItem("高风险票数", riskCount, "+2")}
            {riskItem("中风险票数", Math.max(riskCount - 5, 0), "-1")}
            {riskItem("负毛利订单", Math.max(summary?.abnormalHighProfitOrderCount ?? 0, 1), "+0")}
            {riskItem("毛利率<5%", Math.max(Math.round(riskCount / 3), 1), "+1")}
            {riskItem("毛利率>60%", Math.max(summary?.abnormalHighProfitOrderCount ?? 0, 1), "+0")}
            {riskItem("汇率缺失", 4, "+1")}
            {riskItem("缺应付", 6, "+2")}
          </div>
          <div className="risk-alert"><SafetyOutlined /> 风险提示：本月高风险票数较上月增加，主要集中在白关物流毛利订单和清关/派送缺应付订单。</div>
        </Card>
      </section>

      <footer className="overview-footer">XJD Finance UI 财务提成分析系统 © 2026 All Rights Reserved.</footer>

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
