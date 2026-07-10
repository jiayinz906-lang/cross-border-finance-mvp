import { Button, Card, Descriptions, Modal, Progress, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFinanceDashboard } from "../../api/finance.api";
import {
  type ConfirmationDocument,
  confirmationDocumentDownloadUrl,
  createExportJob,
  exportDownloadUrl,
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

type MetricCard = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

type ConfirmationPayloadDetail = {
  orderNo: string;
  originalOrderNo?: string | null;
  customerName?: string | null;
  businessType: string;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  commissionRate: number;
  commissionAmount: number;
  source?: string;
};

type ConfirmationPayload = {
  title: string;
  fileType: string;
  documentCode: string;
  monthLabel: string;
  generatedAt: string;
  summary: {
    ownerName: string;
    businessType: string;
    orderCount: number;
    receivable: number;
    payable: number;
    grossProfit: number;
    commissionRate: number;
    accruedCommission: number;
    supervisorAdjustmentAmount: number;
    finalCommission: number;
    abnormalNote: string;
    status: string;
  };
  details: ConfirmationPayloadDetail[];
  statement: string;
  signatureTrace: {
    employeeSignature: string;
    signedAt: string | null;
    confirmIp: string;
    deviceInfo: string;
    supervisorConfirm: string;
  };
};

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥").replace(/\s/g, "");
}

function signTime(row: ConfirmationDocument) {
  return row.signedAt ? row.signedAt.replace("T", " ").slice(0, 19) : "-";
}

function parsePayload(row?: ConfirmationDocument | null): ConfirmationPayload | null {
  if (!row?.payloadJson) return null;
  try {
    return JSON.parse(row.payloadJson) as ConfirmationPayload;
  } catch {
    return null;
  }
}

function dateTimeText(value?: string | null) {
  return value ? value.replace("T", " ").slice(0, 19) : "____ 年 ____ 月 ____ 日 ____:____";
}

export default function SignatureConfirm() {
  const [documents, setDocuments] = useState<ConfirmationDocument[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ConfirmationDocument | null>(null);
  const { selectedMonth } = useSelectedMonth();

  const selectedPayload = parsePayload(selectedDocument);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docRes, dashboardRes] = await Promise.all([
        getDocuments(selectedMonth, "logistics_commission"),
        getFinanceDashboard(selectedMonth)
      ]);
      setDocuments(docRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("电子签名数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBatchGenerate = async () => {
    const res = await generateLogisticsDocuments(selectedMonth);
    message.success(`已批量生成 ${res.data.rows?.length ?? 0} 份确认单`);
    await loadData();
  };

  const handleExport = async () => {
    const res = await createExportJob("signature_summary", "xlsx", selectedMonth, { documentCount: documents.length });
    message.success(`签名汇总表已生成：${res.data.fileName}`);
    window.open(exportDownloadUrl(res.data.id), "_blank");
  };

  const handleDownload = async (row: ConfirmationDocument, fileFormat: "pdf" | "png") => {
    const res = await createExportJob(`signature_${fileFormat}`, fileFormat, selectedMonth, row);
    window.open(exportDownloadUrl(res.data.id), "_blank");
  };

  const handleSend = async (row: ConfirmationDocument) => {
    const res = await sendSignatureLink(row.id);
    await navigator.clipboard?.writeText(`${location.origin}${res.data.signatureUrl ?? ""}`);
    message.success("签名链接已生成并复制");
    await loadData();
  };

  const handleSupervisorConfirm = async (row: ConfirmationDocument) => {
    const adjustReason = window.prompt("如本次主管确认涉及调整，请填写原因；无调整可直接确定：") ?? undefined;
    await supervisorConfirmDocument(row.id, adjustReason?.trim() || undefined);
    message.success(`${row.ownerName} 已主管确认`);
    await loadData();
  };

  const handleVoid = async (row: ConfirmationDocument) => {
    const voidReason = window.prompt("请输入作废/重签原因：");
    if (!voidReason?.trim()) {
      message.warning("作废确认单必须填写原因");
      return;
    }
    await voidDocument(row.id, voidReason.trim());
    message.success(`${row.ownerName} 已作废，等待重签`);
    await loadData();
  };

  const summary = dashboard?.summary;
  const metrics: MetricCard[] = useMemo(() => [
    { title: "总应收", value: toPlainMoney(summary?.totalReceivable), accent: "blue", tag: "原始台账", note: "按导入后的原始台账记录汇总" },
    { title: "调整后毛利", value: toPlainMoney(summary?.totalGrossProfit), accent: "green", tag: formatPercent(summary?.grossProfitRate), note: "用于经营分析口径" },
    { title: "物流提成", value: toPlainMoney(summary?.totalCommission), accent: "orange", tag: "阶梯", note: "按销售代表月毛利计提" },
    { title: "高风险票", value: `${summary?.riskOrderCount ?? 0}票`, accent: "red", tag: "需复核", note: "汇率、负毛利、缺应付" },
    { title: "总票数", value: `${dashboard?.orderCount ?? 0}`, accent: "blue", tag: "Excel", note: "按运单口径去重" },
    { title: "调整后应付", value: toPlainMoney(summary?.totalPayable), accent: "green", tag: "含暂估", note: "清关/派送缺应付补齐" }
  ], [dashboard?.orderCount, summary]);

  const needConfirmCount = documents.length;
  const sentCount = documents.filter((row) => row.sendStatus === "sent").length;
  const signedCount = documents.filter((row) => row.signatureStatus === "signed").length;
  const pendingSignCount = Math.max(needConfirmCount - signedCount, 0);
  const supervisorConfirmedCount = documents.filter((row) => row.supervisorStatus === "confirmed").length;
  const progressPercent = needConfirmCount ? Math.round((signedCount / needConfirmCount) * 100) : 0;

  const columns: ColumnsType<ConfirmationDocument> = [
    { title: "业务员", dataIndex: "ownerName", fixed: "left", width: 110 },
    { title: "业务类型", dataIndex: "businessType", width: 110, render: () => "物流业务" },
    { title: "订单数量", dataIndex: "orderCount", width: 100 },
    { title: "最终提成金额", dataIndex: "commissionAmount", align: "right", width: 140, render: toPlainMoney },
    { title: "个人确认单状态", dataIndex: "documentStatus", width: 130, render: (value) => <Tag color={value === "voided" ? "red" : "blue"}>{value === "voided" ? "已作废" : "已生成"}</Tag> },
    { title: "发送状态", dataIndex: "sendStatus", width: 110, render: (value) => value === "sent" ? <Tag color="green">已发送</Tag> : <Tag color="gold">未发送</Tag> },
    { title: "员工签名状态", dataIndex: "signatureStatus", width: 120, render: (value) => value === "signed" ? <Tag color="green">已签名</Tag> : <Tag color="gold">待签名</Tag> },
    { title: "签名时间", width: 190, render: (_, row) => signTime(row) },
    { title: "主管确认状态", dataIndex: "supervisorStatus", width: 130, render: (value) => value === "confirmed" ? <Tag color="green">主管已确认</Tag> : <Tag color="gold">待确认</Tag> },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 450,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => setSelectedDocument(row)}>查看个人确认单</Button>
          <Button size="small" onClick={() => handleSend(row)}>发送签名链接</Button>
          <Button size="small" onClick={() => navigator.clipboard?.writeText(`${location.origin}${row.signatureUrl ?? ""}`)}>复制链接</Button>
          <Button size="small" onClick={() => window.open(confirmationDocumentDownloadUrl(row.id), "_blank")}>下载确认单</Button>
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>下载 PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>下载 PNG</Button>
          <Button size="small" disabled={row.supervisorStatus === "confirmed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button>
          <Button size="small" onClick={() => handleVoid(row)}>作废重签</Button>
        </Space>
      )
    }
  ];

  const detailColumns: ColumnsType<ConfirmationPayloadDetail> = [
    { title: "运单号", dataIndex: "orderNo", fixed: "left", width: 130 },
    { title: "原始订单号", dataIndex: "originalOrderNo", width: 140, render: (value) => value || "-" },
    { title: "业务类型", dataIndex: "businessType", width: 140 },
    { title: "应收", dataIndex: "receivable", align: "right", render: toPlainMoney },
    { title: "应付", dataIndex: "payable", align: "right", render: toPlainMoney },
    { title: "毛利", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
    { title: "毛利率", dataIndex: "grossProfitRate", align: "right", render: formatPercent },
    { title: "提成比例", dataIndex: "commissionRate", align: "right", render: formatPercent },
    { title: "提成金额", dataIndex: "commissionAmount", align: "right", render: toPlainMoney }
  ];

  return (
    <div className="signature-board">
      <section className="profit-metric-grid">
        {metrics.map((item) => (
          <Card key={item.title} className={`profit-metric-card profit-accent-${item.accent}`} loading={loading}>
            <span className="profit-metric-icon" />
            <span className="profit-metric-title">{item.title}</span>
            <strong>{item.value}</strong>
            <div className="profit-metric-note"><Tag bordered={false}>{item.tag}</Tag><span>{item.note}</span></div>
          </Card>
        ))}
      </section>

      <Card
        className="signature-confirm-card"
        title={<div className="signature-title-block"><strong>员工电子签名确认中心</strong><span>主管生成个人提成确认单，员工在线签名后回传状态，最终由主管确认发放。</span></div>}
        extra={<Space size={10} wrap><Button type="primary" onClick={handleBatchGenerate}>批量生成确认单</Button><Button onClick={handleExport}>导出签名汇总表</Button></Space>}
      >
        <div className="signature-stat-grid">
          <div><span>本月需确认人数</span><strong>{needConfirmCount}</strong></div>
          <div><span>已发送人数</span><strong>{sentCount}</strong></div>
          <div><span>已签名人数</span><strong>{signedCount}</strong></div>
          <div><span>待签名人数</span><strong>{pendingSignCount}</strong></div>
          <div><span>已主管确认人数</span><strong>{supervisorConfirmedCount}</strong></div>
        </div>

        <Progress className="signature-progress" percent={progressPercent} showInfo={false} strokeColor={{ "0%": "#5274ef", "100%": "#40c58d" }} trailColor="#eef3f9" />
        <Table rowKey="id" className="signature-summary-table" loading={loading} columns={columns} dataSource={documents} pagination={false} scroll={{ x: 1680 }} />
      </Card>

      <Modal
        open={Boolean(selectedDocument)}
        title={`${selectedPayload?.summary.ownerName ?? selectedDocument?.ownerName ?? ""} 个人提成签名确认单`}
        footer={<Button type="primary" onClick={() => setSelectedDocument(null)}>关闭</Button>}
        onCancel={() => setSelectedDocument(null)}
        width={1180}
      >
        {selectedPayload ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <Typography.Title level={4} style={{ margin: 0 }}>{selectedPayload.title}</Typography.Title>
            <Typography.Text type="secondary">
              文件类型：{selectedPayload.fileType}　月份：{selectedPayload.monthLabel}
              <br />
              确认单编号：{selectedPayload.documentCode}　生成时间：{dateTimeText(selectedPayload.generatedAt)}
            </Typography.Text>

            <Typography.Title level={5}>一、员工与提成汇总</Typography.Title>
            <Descriptions bordered column={4} size="small">
              <Descriptions.Item label="员工姓名">{selectedPayload.summary.ownerName}</Descriptions.Item>
              <Descriptions.Item label="业务类型">{selectedPayload.summary.businessType}</Descriptions.Item>
              <Descriptions.Item label="订单数量">{selectedPayload.summary.orderCount}</Descriptions.Item>
              <Descriptions.Item label="状态">{selectedDocument?.signatureStatus === "signed" ? "已员工签名" : selectedPayload.summary.status}</Descriptions.Item>
              <Descriptions.Item label="应收金额">{toPlainMoney(selectedPayload.summary.receivable)}</Descriptions.Item>
              <Descriptions.Item label="调整后应付">{toPlainMoney(selectedPayload.summary.payable)}</Descriptions.Item>
              <Descriptions.Item label="调整后毛利">{toPlainMoney(selectedPayload.summary.grossProfit)}</Descriptions.Item>
              <Descriptions.Item label="提成比例">{formatPercent(selectedPayload.summary.commissionRate)}</Descriptions.Item>
              <Descriptions.Item label="应计提成">{toPlainMoney(selectedPayload.summary.accruedCommission)}</Descriptions.Item>
              <Descriptions.Item label="主管调整金额">{toPlainMoney(selectedPayload.summary.supervisorAdjustmentAmount)}</Descriptions.Item>
              <Descriptions.Item label="最终确认提成">{toPlainMoney(selectedPayload.summary.finalCommission)}</Descriptions.Item>
              <Descriptions.Item label="异常说明">{selectedPayload.summary.abnormalNote}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5}>二、订单明细</Typography.Title>
            <Table
              rowKey={(row) => `${row.orderNo}-${row.originalOrderNo ?? ""}`}
              size="small"
              pagination={false}
              dataSource={selectedPayload.details}
              columns={detailColumns}
              scroll={{ x: 1100 }}
            />

            <Typography.Title level={5}>三、员工确认声明</Typography.Title>
            <Typography.Paragraph>{selectedPayload.statement}</Typography.Paragraph>

            <Typography.Title level={5}>四、签名留痕</Typography.Title>
            <Descriptions bordered column={1} size="small">
              <Descriptions.Item label="员工签名">{selectedDocument?.signatureStatus === "signed" ? "已电子签名" : selectedPayload.signatureTrace.employeeSignature}</Descriptions.Item>
              <Descriptions.Item label="签名时间">{dateTimeText(selectedDocument?.signedAt ?? selectedPayload.signatureTrace.signedAt)}</Descriptions.Item>
              <Descriptions.Item label="确认 IP">{selectedPayload.signatureTrace.confirmIp}</Descriptions.Item>
              <Descriptions.Item label="设备信息">{selectedPayload.signatureTrace.deviceInfo}</Descriptions.Item>
              <Descriptions.Item label="主管最终确认">{selectedDocument?.supervisorStatus === "confirmed" ? "主管已确认" : selectedPayload.signatureTrace.supervisorConfirm}</Descriptions.Item>
              <Descriptions.Item label="签名链接">
                {selectedDocument?.signatureUrl ? `${location.origin}${selectedDocument.signatureUrl}` : "待发送后生成"}
              </Descriptions.Item>
            </Descriptions>
          </Space>
        ) : (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="业务类型">{selectedDocument?.businessType || "logistics"}</Descriptions.Item>
            <Descriptions.Item label="订单数量">{selectedDocument?.orderCount ?? 0}</Descriptions.Item>
            <Descriptions.Item label="最终提成金额">{toPlainMoney(selectedDocument?.commissionAmount)}</Descriptions.Item>
            <Descriptions.Item label="确认单状态">{selectedDocument?.documentStatus}</Descriptions.Item>
            <Descriptions.Item label="发送状态">{selectedDocument?.sendStatus}</Descriptions.Item>
            <Descriptions.Item label="员工签名状态">{selectedDocument?.signatureStatus}</Descriptions.Item>
            <Descriptions.Item label="主管确认状态">{selectedDocument?.supervisorStatus}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </div>
  );
}
