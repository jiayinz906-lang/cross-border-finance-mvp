import { Button, Card, Input, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFinanceDashboard } from "../../api/finance.api";
import { getMonthlyReport } from "../../api/reports.api";
import { confirmServiceRecord, generateServiceDocuments, getDocuments } from "../../api/workflow.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { DashboardData } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type ServiceRecord = {
  id: number;
  serviceType: string;
  originalPrice: number;
  costAmount: number | null;
  grossProfit: number | null;
  suggestedCommissionMin: number | null;
  suggestedCommissionMax: number | null;
  confirmStatus: string;
  financeOrder?: {
    orderNo: string;
    customerOrderNo?: string | null;
    customerName: string;
    calculationNote?: string | null;
  };
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

function commissionRange(row: ServiceRecord) {
  if (row.serviceType.includes("公司")) {
    return (row.originalPrice ?? 0) > 25000 ? "2000~3500元" : "1500~2000元";
  }
  if (row.serviceType.includes("EAC")) {
    return (row.originalPrice ?? 0) <= 3500 ? "100~200元" : "200~400元";
  }
  if (row.serviceType.includes("商标")) {
    return (row.grossProfit ?? 0) > 2000 ? "25%" : "20%";
  }
  if (row.serviceType.includes("店铺")) {
    return (row.originalPrice ?? 0) >= 3000 ? "700元" : "500元";
  }
  return `${formatMoney(row.suggestedCommissionMin)} - ${formatMoney(row.suggestedCommissionMax)}`;
}

function defaultCommission(row: ServiceRecord) {
  const range = commissionRange(row);
  if (range.includes("2000~3500")) return "2750";
  if (range.includes("1500~2000")) return "1750";
  if (range.includes("700")) return "700";
  if (range.includes("500")) return "500";
  if (range.includes("100~200")) return "150";
  if (range.includes("200~400")) return "300";
  if (range.includes("25%")) return String(Math.round((row.grossProfit ?? 0) * 0.25));
  if (range.includes("20%")) return String(Math.round((row.grossProfit ?? 0) * 0.2));
  return String(Math.round(row.suggestedCommissionMin ?? 0));
}

function serviceCondition(row: ServiceRecord) {
  if (row.serviceType.includes("公司")) {
    return `公司注册/注销：成交单价 ${(row.originalPrice ?? 0) > 25000 ? ">2.5万" : "<2.5万"}`;
  }
  if (row.serviceType.includes("EAC")) {
    return `EAC证书-DOC：成交单价 ${(row.originalPrice ?? 0) <= 3500 ? "<3.5K" : ">3.5K"}`;
  }
  if (row.serviceType.includes("商标")) {
    return `商标注册：成交利润 ${(row.grossProfit ?? 0) > 2000 ? ">2000" : "<2000"}`;
  }
  if (row.serviceType.includes("店铺")) {
    return `店铺租赁：单价${(row.originalPrice ?? 0) >= 30000 ? 3000 : 2500}/月`;
  }
  return "待主管确认";
}

export default function ServiceConfirm() {
  const [rows, setRows] = useState<ServiceRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const { selectedMonth } = useSelectedMonth();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [reportRes, dashboardRes] = await Promise.all([
        getMonthlyReport(selectedMonth),
        getFinanceDashboard(selectedMonth)
      ]);
      setRows(reportRes.data.serviceRecords ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("注册确认数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateServiceDocuments = async () => {
    const res = await generateServiceDocuments(selectedMonth);
    message.success(`已生成 ${res.data.rows?.length ?? 0} 份注册业务确认单`);
  };

  const handleViewSignatureStatus = async () => {
    const res = await getDocuments(selectedMonth, "service_commission");
    const rows = res.data.rows ?? [];
    const signed = rows.filter((row: { signatureStatus: string }) => row.signatureStatus === "signed").length;
    message.info(`注册业务确认单 ${rows.length} 份，已签名 ${signed} 份`);
  };

  const handleSaveConfirm = async (row: ServiceRecord) => {
    await confirmServiceRecord(row.id, Number(defaultCommission(row)) || 0);
    message.success(`${row.financeOrder?.orderNo ?? row.serviceType} 已保存确认`);
    await loadData();
  };

  const summary = dashboard?.summary;
  const serviceReceivable = rows.reduce((sum, row) => sum + (row.originalPrice ?? 0), 0);
  const serviceProfit = rows.reduce((sum, row) => sum + (row.grossProfit ?? 0), 0);

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
      title: "服务类毛利",
      value: toPlainMoney(serviceProfit),
      accent: "orange",
      tag: `${rows.length}单`,
      note: "注册/证书/店铺单独确认"
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
      title: "服务类应收",
      value: toPlainMoney(serviceReceivable),
      accent: "green",
      tag: "主管确认",
      note: "不进入物流提成"
    }
  ], [dashboard?.orderCount, rows.length, serviceProfit, serviceReceivable, summary]);

  const columns: ColumnsType<ServiceRecord> = [
    { title: "单号/客户", dataIndex: ["financeOrder", "orderNo"], fixed: "left", width: 150 },
    { title: "服务", dataIndex: "serviceType", width: 150 },
    { title: "成交单价", dataIndex: "originalPrice", align: "right", render: toPlainMoney },
    { title: "成交利润", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
    { title: "限定条件", render: (_, row) => serviceCondition(row) },
    { title: "提成比例", render: (_, row) => <Input value={commissionRange(row)} /> },
    { title: "确认提成", render: (_, row) => <Input value={defaultCommission(row)} /> },
    {
      title: "状态",
      dataIndex: "confirmStatus",
      render: (status: string) => status === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待主管确认</Tag>
    },
    { title: "操作", fixed: "right", width: 110, render: (_, row) => <Button size="small" onClick={() => handleSaveConfirm(row)}>保存确认</Button> }
  ];

  return (
    <div className="service-board">
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
        className="service-confirm-card"
        title="注册/证书/店铺服务主管确认"
        extra={(
          <Space size={10} wrap>
            <Tag bordered={false} className="service-policy-tag">按图一红框规则，可手动修改比例</Tag>
            <Button onClick={handleGenerateServiceDocuments}>生成注册业务确认单</Button>
            <Button onClick={handleViewSignatureStatus}>查看签名状态</Button>
          </Space>
        )}
      >
        <div className="service-rule-panel">
          <span className="service-rule-title">提成限定条件文字备注</span>
          <div className="service-rule-grid">
            <div>
              <strong>公司注册</strong>
              <span>成交单价 &lt; 2.5万：1500~2000元</span>
              <span>成交单价 &gt; 2.5万：2000~3500元</span>
              <span>包含地址*1 + 银行*1</span>
            </div>
            <div>
              <strong>EAC证书</strong>
              <span>COC &gt; 1.4万：600~1000元</span>
              <span>COC &lt; 1.4万：400~600元</span>
              <span>DOC &gt; 3.5K：200~400元</span>
              <span>DOC &lt; 3.5K：100~200元</span>
            </div>
            <div>
              <strong>商标注册</strong>
              <span>成交利润 &gt; 2000：25%</span>
              <span>成交利润 &lt; 2000：20%</span>
            </div>
            <div>
              <strong>店铺租赁</strong>
              <span>单价2500/月：500元</span>
              <span>单价3000/月：700元</span>
              <span>3个月为一个计算周期，额外免租优惠需领导审批</span>
            </div>
          </div>
        </div>

        <Table
          rowKey="id"
          className="service-confirm-table"
          loading={loading}
          dataSource={rows}
          columns={columns}
          pagination={false}
          scroll={{ x: 1320 }}
        />
      </Card>
    </div>
  );
}
