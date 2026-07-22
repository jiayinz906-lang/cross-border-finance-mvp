import { Button, Card, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getCommissions, updateCommissionRate } from "../../api/commissions.api";
import { getFinanceDashboard } from "../../api/finance.api";
import {
  type ConfirmationDocument,
  confirmSalespersonCommission,
  downloadConfirmationDocumentFile,
  generateLogisticsDocuments,
  getDocuments,
  sendSignatureLink,
  supervisorConfirmDocument,
  voidDocument
} from "../../api/workflow.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { DashboardData } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";
import { ReasonActionModal } from "../../components/ReasonActionModal";
import { copyText } from "../../utils/copyText";
import { externalSignatureUrl, productionAppUrl, usesLocalSignatureBackend } from "../../utils/externalSignatureUrl";
import { useAuth } from "../../contexts/AuthContext";

type CommissionOrder = {
  orderNo: string;
  customerOrderNo?: string | null;
  customerName?: string | null;
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
  manualCommissionAmount?: number | null;
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

function effectiveCommissionAmount(row: CommissionRecord) {
  return row.manualCommissionAmount ?? row.commissionAmount;
}

function statusTag(value: string, confirmedText = "已确认", pendingText = "待确认") {
  if (value === "confirmed" || value === "signed" || value === "sent") {
    return <Tag color="green">{confirmedText}</Tag>;
  }
  if (value === "voided") return <Tag color="red">已作废</Tag>;
  return <Tag color="gold">{pendingText}</Tag>;
}

export default function Commission() {
  const { selectedMonth } = useSelectedMonth();
  const { user } = useAuth();
  const isSalesAccount = user?.role === "sales" || user?.role === "sales_operator";
  const canApprove = Boolean(user?.auth?.permissions.includes("confirmation:approve"));
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [documents, setDocuments] = useState<ConfirmationDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [selectedSalesperson, setSelectedSalesperson] = useState<string | null>(null);
  const [documentsOpen, setDocumentsOpen] = useState(false);
  const [adjustingSalesperson, setAdjustingSalesperson] = useState<SalespersonCommission | null>(null);
  const [adjustmentPercent, setAdjustmentPercent] = useState<number>(15);
  const [adjustingDetail, setAdjustingDetail] = useState<CommissionRecord | null>(null);
  const [detailAdjustmentPercent, setDetailAdjustmentPercent] = useState<number>(15);
  const [supervisorDocument, setSupervisorDocument] = useState<ConfirmationDocument | null>(null);
  const [voidingDocument, setVoidingDocument] = useState<ConfirmationDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [commissionRes, dashboardRes] = await Promise.all([
        getCommissions(selectedMonth),
        getFinanceDashboard(selectedMonth)
      ]);
      setRecords(commissionRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("物流提成数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  const loadDocuments = useCallback(async () => {
    setDocumentsLoading(true);
    try {
      const res = await getDocuments(selectedMonth, "logistics_commission");
      setDocuments(res.data.rows ?? []);
      return res.data.rows ?? [];
    } finally {
      setDocumentsLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateDocuments = async () => {
    setDocumentsLoading(true);
    try {
      const res = await generateLogisticsDocuments(selectedMonth);
      const rows = res.data.rows ?? [];
      setDocuments(rows);
      setDocumentsOpen(true);
      message.success(`已生成并保存 ${rows.length} 份个人确认单`);
    } finally {
      setDocumentsLoading(false);
    }
  };

  const handleViewSignatureStatus = async () => {
    const rows = await loadDocuments();
    const signed = rows.filter((row: ConfirmationDocument) => row.signatureStatus === "signed").length;
    setDocumentsOpen(true);
    message.info(`数据库确认单 ${rows.length} 份，已签名 ${signed} 份`);
  };

  const handleConfirmSalesperson = async (row: SalespersonCommission) => {
    await confirmSalespersonCommission(row.salespersonName, selectedMonth);
    message.success(`${row.salespersonName} 提成已确认`);
    await loadData();
  };

  const handleAdjustSalesperson = (row: SalespersonCommission) => {
    setAdjustingSalesperson(row);
    setAdjustmentPercent(Number(((row.commissionRate > 0 ? row.commissionRate : 0.15) * 100).toFixed(2)));
  };

  const handleGenerateOne = async (row: SalespersonCommission) => {
    const res = await generateLogisticsDocuments(selectedMonth);
    const document = (res.data.rows ?? []).find((item: ConfirmationDocument) => item.ownerName === row.salespersonName);
    setDocuments(res.data.rows ?? []);
    setDocumentsOpen(true);
    message.success(document ? `${row.salespersonName} 确认单已保存到数据库` : "确认单已刷新");
  };

  const handleAdjustDetail = (row: CommissionRecord) => {
    setAdjustingDetail(row);
    setDetailAdjustmentPercent(Number(((row.commissionRate ?? 0) * 100).toFixed(2)));
  };

  const handleSendDocument = async (row: ConfirmationDocument) => {
    if (usesLocalSignatureBackend()) {
      Modal.warning({
        title: "本地确认单不能外发",
        content: <Typography.Paragraph>当前链接对应本机数据库，仅能在本机使用。请使用线上系统生成外部签名链接：<Typography.Link href={`${productionAppUrl}#/commission`} target="_blank">打开线上物流提成</Typography.Link></Typography.Paragraph>
      });
      return;
    }
    const res = await sendSignatureLink(row.id);
    const url = externalSignatureUrl(res.data.signatureUrl);
    const copied = await copyText(url);
    if (copied) message.success(`${row.ownerName} 的个人确认单链接已生成并复制，可直接发送签名`);
    else Modal.info({ title: "签名链接已生成，请手动复制", content: <Input.TextArea value={url} readOnly autoSize={{ minRows: 2, maxRows: 4 }} /> });
    await loadDocuments();
  };

  const handleSupervisorConfirm = (row: ConfirmationDocument) => setSupervisorDocument(row);

  const handleVoidDocument = (row: ConfirmationDocument) => setVoidingDocument(row);

  const handleDownloadDocument = async (row: ConfirmationDocument, format: "pdf" | "png") => {
    await downloadConfirmationDocumentFile(row.id, format);
  };

  const summary = dashboard?.summary;

  const metrics: MetricCard[] = useMemo(() => [
    {
      title: "总应收",
      value: toPlainMoney(summary?.totalReceivable),
      accent: "blue",
      tag: "优化后",
      note: "按原始表格汇率口径计算"
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
      current.commissionAmount += effectiveCommissionAmount(item);
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

  const selectedRows = records.filter((item) => item.salespersonName === selectedSalesperson);

  const columns: ColumnsType<SalespersonCommission> = [
    { title: "销售代表", dataIndex: "salespersonName", fixed: "left", width: 130 },
    {
      title: "票数",
      dataIndex: "orderCount",
      width: 90,
      render: (value: number, row) => (
        <Button type="link" className="commission-ticket-link" onClick={() => setSelectedSalesperson(row.salespersonName)}>
          {value} 票 ▼
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
        canApprove ? <Space size={6}>
          <Button size="small" onClick={() => handleAdjustSalesperson(row)}>调整</Button>
          <Button size="small" onClick={() => handleConfirmSalesperson(row)}>确认</Button>
          <Button size="small" onClick={() => handleGenerateOne(row)}>确认单</Button>
        </Space> : <Typography.Text type="secondary">只读</Typography.Text>
      )
    }
  ];

  const detailColumns: ColumnsType<CommissionRecord> = [
    { title: "单号", dataIndex: ["financeOrder", "orderNo"], width: 130 },
    { title: "原始订单号", dataIndex: ["financeOrder", "customerOrderNo"], width: 160, render: (value) => value || "-" },
    { title: "对应用户", dataIndex: ["financeOrder", "customerName"], width: 160, render: (value) => value || "-" },
    { title: "毛利", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
    {
      title: "提成比例",
      dataIndex: "commissionRate",
      align: "right",
      width: 150,
      render: (value: number, row) => (
        <Space size={6}>
          <Typography.Text>{rateText(value)}</Typography.Text>
          {canApprove ? <Button size="small" onClick={() => handleAdjustDetail(row)}>调整</Button> : null}
        </Space>
      )
    },
    { title: "提成金额", dataIndex: "commissionAmount", align: "right", render: (_, row) => toPlainMoney(effectiveCommissionAmount(row)) },
    {
      title: "状态",
      dataIndex: "confirmStatus",
      width: 100,
      render: (status: string) => status === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待确认</Tag>
    }
  ];

  const documentColumns: ColumnsType<ConfirmationDocument> = [
    { title: "销售代表", dataIndex: "ownerName", fixed: "left", width: 120 },
    { title: "月份", dataIndex: "month", width: 100 },
    { title: "订单数", dataIndex: "orderCount", width: 90 },
    { title: "确认毛利", dataIndex: "grossProfit", align: "right", width: 140, className: "commission-money-cell", render: toPlainMoney },
    { title: "确认提成", dataIndex: "commissionAmount", align: "right", width: 140, className: "commission-money-cell", render: toPlainMoney },
    { title: "单据状态", dataIndex: "documentStatus", width: 100, render: (value) => statusTag(value, "已生成") },
    { title: "发送状态", dataIndex: "sendStatus", width: 100, render: (value) => statusTag(value, "已发送", "未发送") },
    { title: "签名状态", dataIndex: "signatureStatus", width: 100, render: (value) => statusTag(value, "已签名", "待签名") },
    { title: "主管确认", dataIndex: "supervisorStatus", width: 110, render: (value) => statusTag(value, "已确认", "待确认") },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 390,
      render: (_, row) => (
        <Space size={6}>
          <Button size="small" onClick={() => handleDownloadDocument(row, "pdf")}>PDF</Button>
          <Button size="small" onClick={() => handleDownloadDocument(row, "png")}>PNG</Button>
          {canApprove ? <Button size="small" onClick={() => handleSendDocument(row)}>发送链接</Button> : null}
          {canApprove ? <Button size="small" onClick={() => handleSupervisorConfirm(row)}>主管确认</Button> : null}
          {canApprove ? <Button size="small" danger onClick={() => handleVoidDocument(row)}>作废</Button> : null}
        </Space>
      )
    }
  ];

  return (
    <div className="commission-board">
      <div className="metric-grid metric-grid-compact">
        {metrics.map((item) => (
          <div key={item.title} className={`metric-card metric-${item.accent}`}>
            <div className="metric-icon" />
            <span>{item.title}</span>
            <strong>{item.value}</strong>
            <p><Tag bordered={false}>{item.tag}</Tag>{item.note}</p>
          </div>
        ))}
      </div>

      <Card
        className="commission-confirm-card"
        title={isSalesAccount ? "我的物流提成" : "物流销售代表提成确认"}
        extra={(
          <Space size={10} wrap>
            <Tag bordered={false} className="commission-policy-tag">
              {isSalesAccount ? "仅显示本人订单与物流提成" : "销售代表按自然月毛利阶梯比例"}
            </Tag>
            {canApprove ? <Button onClick={handleGenerateDocuments}>生成个人确认单</Button> : null}
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
          className="commission-summary-table"
          rowKey="salespersonName"
          loading={loading}
          dataSource={salespersonRows}
          columns={columns}
          pagination={false}
          scroll={{ x: 1180 }}
        />
      </Card>

      <Modal
        open={Boolean(selectedSalesperson)}
        title={`${selectedSalesperson ?? ""} 物流提成订单明细`}
        footer={<Button type="primary" onClick={() => setSelectedSalesperson(null)}>关闭</Button>}
        width={1120}
        onCancel={() => setSelectedSalesperson(null)}
      >
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={selectedRows}
          columns={detailColumns}
        />
      </Modal>

      <Modal
        open={documentsOpen}
        title={`${selectedMonth} 个人确认单数据库记录`}
        footer={<Button type="primary" onClick={() => setDocumentsOpen(false)}>关闭</Button>}
        width={1180}
        className="commission-documents-modal"
        onCancel={() => setDocumentsOpen(false)}
      >
        <div className="commission-documents-intro">
          <div><span>确认单数量</span><strong>{documents.length}</strong></div>
          <div><span>已发送</span><strong>{documents.filter((row) => row.sendStatus === "sent").length}</strong></div>
          <div><span>已签名</span><strong>{documents.filter((row) => row.signatureStatus === "signed").length}</strong></div>
          <div><span>待主管确认</span><strong>{documents.filter((row) => row.supervisorStatus !== "confirmed").length}</strong></div>
        </div>
        <Table
          rowKey="id"
          loading={documentsLoading}
          size="small"
          pagination={false}
          dataSource={documents}
          columns={documentColumns}
          className="commission-documents-table"
          scroll={{ x: 1320 }}
        />
      </Modal>

      <ReasonActionModal
        open={Boolean(adjustingDetail)}
        title={`调整单票提成：${adjustingDetail?.financeOrder?.orderNo ?? ""}`}
        description="调整只影响当前订单。请核对调整后比例和预计提成，并填写调整原因；操作将写入审计记录。"
        confirmText="保存调整"
        loading={actionLoading}
        onCancel={() => setAdjustingDetail(null)}
        onConfirm={async (reason) => {
          if (!adjustingDetail) return;
          setActionLoading(true);
          try {
            await updateCommissionRate(adjustingDetail.id, detailAdjustmentPercent / 100, reason);
            message.success(`${adjustingDetail.financeOrder?.orderNo ?? adjustingDetail.salespersonName} 提成比例已更新`);
            setAdjustingDetail(null);
            await loadData();
          } finally {
            setActionLoading(false);
          }
        }}
      >
        <div className="action-impact-grid">
          <span>当前比例<b>{rateText(adjustingDetail?.commissionRate)}</b></span>
          <span>调整后比例<InputNumber min={0} max={100} precision={2} value={detailAdjustmentPercent} addonAfter="%" onChange={(value) => setDetailAdjustmentPercent(value ?? 0)} /></span>
          <span>预计提成<b>{toPlainMoney((adjustingDetail?.grossProfit ?? 0) * detailAdjustmentPercent / 100)}</b></span>
        </div>
      </ReasonActionModal>

      <ReasonActionModal
        open={Boolean(adjustingSalesperson)}
        title={`调整 ${adjustingSalesperson?.salespersonName ?? ""} 的提成比例`}
        description="调整会影响本月应计提成，并写入操作审计记录。"
        confirmText="保存并确认"
        loading={actionLoading}
        onCancel={() => setAdjustingSalesperson(null)}
        onConfirm={async (reason) => {
          if (!adjustingSalesperson) return;
          setActionLoading(true);
          try {
            await confirmSalespersonCommission(adjustingSalesperson.salespersonName, selectedMonth, adjustmentPercent / 100, reason);
            message.success(`${adjustingSalesperson.salespersonName} 已按 ${adjustmentPercent.toFixed(2)}% 调整并确认`);
            setAdjustingSalesperson(null);
            await loadData();
          } finally {
            setActionLoading(false);
          }
        }}
      >
        <div className="action-impact-grid">
          <span>当前比例<b>{rateText(adjustingSalesperson?.commissionRate)}</b></span>
          <span>调整后比例<InputNumber min={0} max={100} precision={2} value={adjustmentPercent} addonAfter="%" onChange={(value) => setAdjustmentPercent(value ?? 0)} /></span>
          <span>预计提成<b>{toPlainMoney((adjustingSalesperson?.grossProfit ?? 0) * adjustmentPercent / 100)}</b></span>
        </div>
      </ReasonActionModal>

      <ReasonActionModal
        open={Boolean(supervisorDocument)}
        title={`主管确认：${supervisorDocument?.ownerName ?? ""}`}
        description={`确认后该版本不可覆盖，最终提成为 ${toPlainMoney(supervisorDocument?.commissionAmount)}。`}
        confirmText="主管确认"
        reasonRequired={false}
        loading={actionLoading}
        onCancel={() => setSupervisorDocument(null)}
        onConfirm={async (reason) => {
          if (!supervisorDocument) return;
          setActionLoading(true);
          try {
            await supervisorConfirmDocument(supervisorDocument.id, reason || undefined);
            message.success(`${supervisorDocument.ownerName} 已主管确认`);
            setSupervisorDocument(null);
            await loadDocuments();
          } finally {
            setActionLoading(false);
          }
        }}
      />

      <ReasonActionModal
        open={Boolean(voidingDocument)}
        title={`作废并重签：${voidingDocument?.ownerName ?? ""}`}
        description="作废后原确认单保留审计记录，需要重新生成新版本并发送签名。"
        confirmText="确认作废"
        danger
        loading={actionLoading}
        onCancel={() => setVoidingDocument(null)}
        onConfirm={async (reason) => {
          if (!voidingDocument) return;
          setActionLoading(true);
          try {
            await voidDocument(voidingDocument.id, reason);
            message.success(`${voidingDocument.ownerName} 已作废，可重新生成确认单`);
            setVoidingDocument(null);
            await loadDocuments();
          } finally {
            setActionLoading(false);
          }
        }}
      />
    </div>
  );
}
