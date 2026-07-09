import { Button, Card, Modal, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCommissions } from "../../api/commissions.api";
import { getFinanceDashboard } from "../../api/finance.api";
import { confirmSalespersonCommission, generateLogisticsDocuments, getDocuments } from "../../api/workflow.api";
import type { DashboardData } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type CommissionOrder = {
  orderNo: string;
  adjustedReceivable: number;
  adjustedGrossProfitRate: number | null;
  needSupervisorConfirm: boolean;
};

type CommissionRecord = {
  id: number;
  salespersonName: string;
  grossProfit: number;
  commissionRate: number;
  commissionAmount: number;
  confirmStatus: string;
  needSupervisorConfirm: boolean;
  financeOrder?: CommissionOrder;
};

type SalespersonCommission = {
  salespersonName: string;
  orderCount: number;
  grossProfit: number;
  grossProfitRate: number | null;
  commissionRate: number;
  commissionAmount: number;
  highRiskCount: number;
  confirmStatus: string;
};

type MetricCard = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

const commissionTiers = [
  { range: "1.5万-5万元", rate: "15%" },
  { range: "5万-10万元", rate: "20%" },
  { range: "10万-15万元", rate: "25%" },
  { range: "≥15万元", rate: "30%" }
];

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥").replace(/\s/g, "");
}

function rateText(value?: number | null) {
  return typeof value === "number" ? `${(value * 100).toFixed(2)}%` : "-";
}

export default function Commission() {
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [commissionRes, dashboardRes] = await Promise.all([
        getCommissions(),
        getFinanceDashboard("2026-06")
      ]);
      setRecords(commissionRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("物流提成数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGenerateDocuments = async () => {
    const res = await generateLogisticsDocuments("2026-06");
    message.success(`已生成 ${res.data.rows?.length ?? 0} 份个人确认单`);
  };

  const handleViewSignatureStatus = async () => {
    const res = await getDocuments("2026-06", "logistics_commission");
    const rows = res.data.rows ?? [];
    const signed = rows.filter((row: { signatureStatus: string }) => row.signatureStatus === "signed").length;
    message.info(`物流确认单 ${rows.length} 份，已签名 ${signed} 份`);
  };

  const handleConfirmSalesperson = async (row: SalespersonCommission) => {
    await confirmSalespersonCommission(row.salespersonName, "2026-06");
    message.success(`${row.salespersonName} 提成已确认`);
    await loadData();
  };

  const handleAdjustSalesperson = async (row: SalespersonCommission) => {
    const nextRate = row.commissionRate > 0 ? row.commissionRate : 0.15;
    await confirmSalespersonCommission(row.salespersonName, "2026-06", nextRate);
    message.success(`${row.salespersonName} 已按 ${(nextRate * 100).toFixed(0)}% 调整并确认`);
    await loadData();
  };

  const handleGenerateOne = async (row: SalespersonCommission) => {
    const res = await generateLogisticsDocuments("2026-06");
    const document = (res.data.rows ?? []).find((item: { ownerName: string }) => item.ownerName === row.salespersonName);
    message.success(document ? `${row.salespersonName} 确认单已生成` : "确认单已刷新");
  };

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
      tag: "阶梯",
      note: "按销售代表月毛利计提"
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

  const salespersonRows = useMemo(() => {
    const group = new Map<string, SalespersonCommission & { receivable: number }>();

    for (const item of records) {
      const current = group.get(item.salespersonName) ?? {
        salespersonName: item.salespersonName,
        orderCount: 0,
        grossProfit: 0,
        grossProfitRate: null,
        commissionRate: 0,
        commissionAmount: 0,
        highRiskCount: 0,
        confirmStatus: "confirmed",
        receivable: 0
      };

      const receivable = item.financeOrder?.adjustedReceivable ?? 0;
      const isHighRisk = item.needSupervisorConfirm || item.financeOrder?.needSupervisorConfirm || ((item.financeOrder?.adjustedGrossProfitRate ?? 1) < 0.1);

      current.orderCount += 1;
      current.grossProfit += item.grossProfit;
      current.commissionAmount += item.commissionAmount;
      current.receivable += receivable;
      current.highRiskCount += isHighRisk ? 1 : 0;
      current.confirmStatus = current.confirmStatus === "pending" || item.confirmStatus !== "confirmed" ? "pending" : "confirmed";
      group.set(item.salespersonName, current);
    }

    return Array.from(group.values())
      .map((item) => ({
        ...item,
        grossProfitRate: item.receivable > 0 ? item.grossProfit / item.receivable : null,
        commissionRate: item.grossProfit > 0 ? item.commissionAmount / item.grossProfit : 0
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }, [records]);

  const columns: ColumnsType<SalespersonCommission> = [
    { title: "销售代表", dataIndex: "salespersonName", fixed: "left", width: 130 },
    {
      title: "票数",
      dataIndex: "orderCount",
      width: 90,
      render: (value: number, row) => (
        <Button type="link" className="commission-ticket-link" onClick={() => setSelectedSalesperson(row.salespersonName)}>
          {value} 票 ▾
        </Button>
      )
    },
    { title: "物流调整后毛利", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
    { title: "汇总毛利率", dataIndex: "grossProfitRate", align: "right", render: formatPercent },
    { title: "提成比例", dataIndex: "commissionRate", align: "right", render: rateText },
    { title: "汇总应记提成", dataIndex: "commissionAmount", align: "right", render: toPlainMoney },
    { title: "高风险票", dataIndex: "highRiskCount", align: "center", width: 100 },
    {
      title: "状态",
      dataIndex: "confirmStatus",
      width: 110,
      render: (status: string) => status === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待确认</Tag>
    },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 220,
      render: (_, row) => (
        <Space size={6}>
          <Button size="small" onClick={() => handleAdjustSalesperson(row)}>调整</Button>
          <Button size="small" onClick={() => handleConfirmSalesperson(row)}>确认</Button>
          <Button size="small" onClick={() => handleGenerateOne(row)}>确认单</Button>
        </Space>
      )
    }
  ];

  return (
    <div className="commission-board">
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
        className="commission-confirm-card"
        title="物流销售代表提成确认"
        extra={(
          <Space size={10} wrap>
            <Tag bordered={false} className="commission-policy-tag">销售代表按自然月毛利阶梯比例</Tag>
            <Button onClick={handleGenerateDocuments}>生成个人确认单</Button>
            <Button onClick={handleViewSignatureStatus}>查看签名状态</Button>
          </Space>
        )}
      >
        <div className="commission-rule-panel">
          <div className="commission-rule-copy">
            <strong>物流业务提成统一计算公式（销售代表）</strong>
            <span>总提成 = 个人月度毛利 × 提成比例</span>
            <span>毛利以自然月计算维度，以单月（10号前）全部运费收齐为核算发放条件</span>
            <span>毛利计算方式：自然月毛利 - 无责底薪</span>
          </div>
          <Table
            rowKey="range"
            size="small"
            pagination={false}
            dataSource={commissionTiers}
            columns={[
              { title: "月度毛利区间（全业务）", dataIndex: "range", align: "center" },
              { title: "提成比例（物流专项）", dataIndex: "rate", align: "center" }
            ]}
          />
        </div>

        <Table
          rowKey="salespersonName"
          className="commission-summary-table"
          loading={loading}
          columns={columns}
          dataSource={salespersonRows}
          pagination={false}
          scroll={{ x: 1300 }}
        />
      </Card>

      <Modal
        open={Boolean(selectedSalesperson)}
        title={`${selectedSalesperson ?? ""} 物流提成订单明细`}
        footer={<Button type="primary" onClick={() => setSelectedSalesperson(null)}>关闭</Button>}
        width={860}
        onCancel={() => setSelectedSalesperson(null)}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={records.filter((item) => item.salespersonName === selectedSalesperson)}
          columns={[
            { title: "单号", dataIndex: ["financeOrder", "orderNo"], width: 140 },
            { title: "毛利", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
            { title: "提成比例", dataIndex: "commissionRate", align: "right", render: rateText },
            { title: "提成金额", dataIndex: "commissionAmount", align: "right", render: toPlainMoney },
            {
              title: "状态",
              dataIndex: "confirmStatus",
              width: 100,
              render: (status: string) => status === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待确认</Tag>
            }
          ]}
        />
      </Modal>
    </div>
  );
}
