import { Button, Card, Progress, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFinanceDashboard } from "../../api/finance.api";
import {
  type ConfirmationDocument,
  createExportJob,
  exportDownloadUrl,
  generateLogisticsDocuments,
  getDocuments,
  sendSignatureLink,
  supervisorConfirmDocument,
  voidDocument
} from "../../api/workflow.api";
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

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN楼", "楼").replace(/\s/g, "");
}

function signTime(row: ConfirmationDocument) {
  return row.signedAt ? row.signedAt.replace("T", " ").slice(0, 19) : "-";
}

export default function SignatureConfirm() {
  const [documents, setDocuments] = useState<ConfirmationDocument[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docRes, dashboardRes] = await Promise.all([
        getDocuments("2026-06", "logistics_commission"),
        getFinanceDashboard("2026-06")
      ]);
      setDocuments(docRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("电子签名数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBatchGenerate = async () => {
    const res = await generateLogisticsDocuments("2026-06");
    message.success(`已批量生成 ${res.data.rows?.length ?? 0} 份确认单`);
    await loadData();
  };

  const handleExport = async () => {
    const res = await createExportJob("signature_summary", "xlsx", "2026-06", { documentCount: documents.length });
    message.success(`签名汇总表已生成：${res.data.fileName}`);
    window.open(exportDownloadUrl(res.data.id), "_blank");
  };

  const handleDownload = async (row: ConfirmationDocument, fileFormat: "pdf" | "png") => {
    const res = await createExportJob(`signature_${fileFormat}`, fileFormat, "2026-06", row);
    window.open(exportDownloadUrl(res.data.id), "_blank");
  };

  const handleSend = async (row: ConfirmationDocument) => {
    const res = await sendSignatureLink(row.id);
    await navigator.clipboard?.writeText(`${location.origin}${res.data.signatureUrl ?? ""}`);
    message.success("签名链接已生成并复制");
    await loadData();
  };

  const handleSupervisorConfirm = async (row: ConfirmationDocument) => {
    await supervisorConfirmDocument(row.id);
    message.success(`${row.ownerName} 已主管确认`);
    await loadData();
  };

  const handleVoid = async (row: ConfirmationDocument) => {
    await voidDocument(row.id);
    message.success(`${row.ownerName} 已作废，等待重签`);
    await loadData();
  };

  const summary = dashboard?.summary;
  const metrics: MetricCard[] = useMemo(() => [
    { title: "总应收", value: toPlainMoney(summary?.totalReceivable), accent: "blue", tag: "优化后", note: "汇率缺失统一按 6.85 修正" },
    { title: "调整后毛利", value: toPlainMoney(summary?.totalGrossProfit), accent: "green", tag: formatPercent(summary?.grossProfitRate), note: "可用于经营分析口径" },
    { title: "物流提成", value: toPlainMoney(summary?.totalCommission), accent: "orange", tag: "15%", note: "统一按物流毛利计提" },
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
    { title: "业务类型", dataIndex: "businessType", width: 110, render: (value) => value || "logistics" },
    { title: "订单数量", dataIndex: "orderCount", width: 100 },
    { title: "最终提成金额", dataIndex: "commissionAmount", align: "right", width: 140, render: toPlainMoney },
    { title: "个人确认单状态", dataIndex: "documentStatus", width: 130, render: (value) => <Tag color={value === "voided" ? "red" : "blue"}>{value === "voided" ? "已作废" : "已生成"}</Tag> },
    { title: "发送状态", dataIndex: "sendStatus", width: 110, render: (value) => value === "sent" ? <Tag color="green">已发送</Tag> : <Tag color="gold">未发送</Tag> },
    { title: "员工签名状态", dataIndex: "signatureStatus", width: 120, render: (value) => value === "signed" ? <Tag color="green">已签名</Tag> : <Tag color="gold">待签名</Tag> },
    { title: "签名时间", width: 190, render: (_, row) => signTime(row) },
    { title: "主管确认状态", dataIndex: "supervisorStatus", width: 130, render: (value) => value === "confirmed" ? <Tag color="green">主管已确认</Tag> : <Tag color="gold">待签名</Tag> },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 450,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => message.info(`${row.ownerName} 确认单金额 ${toPlainMoney(row.commissionAmount)}`)}>查看个人确认单</Button>
          <Button size="small" onClick={() => handleSend(row)}>发送签名链接</Button>
          <Button size="small" onClick={() => navigator.clipboard?.writeText(`${location.origin}${row.signatureUrl ?? ""}`)}>复制链接</Button>
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>下载 PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>下载 PNG</Button>
          <Button size="small" disabled={row.supervisorStatus === "confirmed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button>
          <Button size="small" onClick={() => handleVoid(row)}>作废重签</Button>
        </Space>
      )
    }
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
    </div>
  );
}
