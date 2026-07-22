import { Alert, Button, Card, Descriptions, Modal, Progress, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import {
  type ConfirmationDocument,
  createExportJob,
  downloadConfirmationDocumentFile,
  downloadExportJobFile,
  generateLogisticsDocuments,
  generateSalaryDocuments,
  getDocuments,
  markSignatureLinkNotified,
  sendSignatureLink,
  supervisorConfirmDocument,
  voidDocument
} from "../../api/workflow.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";
import { ReasonActionModal } from "../../components/ReasonActionModal";
import { copyText } from "../../utils/copyText";
import { externalSignatureUrl, productionAppUrl, usesLocalSignatureBackend } from "../../utils/externalSignatureUrl";
import { useAuth } from "../../contexts/AuthContext";

type ConfirmationPayloadDetail = {
  orderNo: string;
  originalOrderNo?: string | null;
  customerName?: string | null;
  businessType: string;
  receivable: number;
  payable?: number;
  grossProfit: number;
  grossProfitRate: number | null;
  commissionRate: number;
  commissionAmount: number;
  source?: string;
  salaryComponent?: string;
  performanceCategory?: string;
  rawOrderCount?: number;
  baseCount?: number;
  commissionOrderCount?: number;
  performanceRate?: number;
  performanceRateUnit?: string;
  bracketLabel?: string;
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
    payable?: number;
    grossProfit: number;
    commissionRate: number;
    accruedCommission: number;
    supervisorAdjustmentAmount: number;
    finalCommission: number;
    logisticsCommission?: number;
    serviceCommission?: number;
    abnormalNote: string;
    payoutNote?: string;
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

function notificationChannelLabel(channel?: string | null) {
  if (channel === "dingtalk_direct") return "钉钉单聊";
  if (channel === "dingtalk_webhook") return "钉钉群机器人";
  if (channel === "wecom_webhook") return "企业微信机器人";
  return "手工通知";
}

function salaryDocumentTypeLabel(fileType?: string | null) {
  if (fileType === "sales_salary_confirmation") return "销售提成薪资确认单";
  if (fileType === "customer_service_salary_confirmation" || fileType === "operator_salary_confirmation") return "操作员薪资确认单";
  return "个人薪资确认单";
}

function salaryStatusLabel(status?: string | null, signatureStatus?: string | null) {
  if (signatureStatus === "signed") return "员工已签名";
  if (status === "pending employee signature") return "待员工签名";
  if (status === "supervisor confirmed") return "主管已确认";
  return status || "待确认";
}

export default function SignatureConfirm() {
  const { user } = useAuth();
  const isSalesAccount = user?.role === "sales" || user?.role === "sales_operator";
  const isOperatorAccount = user?.role === "operator" || user?.role === "sales_operator";
  const isDualAccount = user?.role === "sales_operator";
  const isPersonalAccount = isSalesAccount || isOperatorAccount;
  const canApprove = Boolean(user?.auth?.permissions.includes("confirmation:approve"));
  const canExport = Boolean(user?.auth?.permissions.includes("reports:export"));
  const [documents, setDocuments] = useState<ConfirmationDocument[]>([]);
  const [salesSalaryDocuments, setSalesSalaryDocuments] = useState<ConfirmationDocument[]>([]);
  const [customerServiceSalaryDocuments, setCustomerServiceSalaryDocuments] = useState<ConfirmationDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<ConfirmationDocument | null>(null);
  const [exporting, setExporting] = useState(false);
  const [generatingSalary, setGeneratingSalary] = useState(false);
  const [supervisorDocument, setSupervisorDocument] = useState<ConfirmationDocument | null>(null);
  const [voidingDocument, setVoidingDocument] = useState<ConfirmationDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const { selectedMonth } = useSelectedMonth();

  const selectedPayload = parsePayload(selectedDocument);
  const isOperatorSalaryDocument = selectedDocument?.documentType === "customer_service_salary"
    || selectedPayload?.summary.businessType === "operator_salary";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [docRes, salesRes, customerServiceRes] = await Promise.all([
        isOperatorAccount && !isDualAccount ? Promise.resolve({ data: { rows: [] as ConfirmationDocument[] } }) : getDocuments(selectedMonth, "logistics_commission"),
        isOperatorAccount && !isDualAccount ? Promise.resolve({ data: { rows: [] as ConfirmationDocument[] } }) : getDocuments(selectedMonth, "sales_salary"),
        isSalesAccount && !isDualAccount ? Promise.resolve({ data: { rows: [] as ConfirmationDocument[] } }) : getDocuments(selectedMonth, "customer_service_salary")
      ]);
      setDocuments(docRes.data.rows ?? []);
      setSalesSalaryDocuments(salesRes.data.rows ?? []);
      setCustomerServiceSalaryDocuments(customerServiceRes.data.rows ?? []);
    } catch {
      message.error("电子签名数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [isDualAccount, isOperatorAccount, isSalesAccount, selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBatchGenerate = async () => {
    const res = await generateLogisticsDocuments(selectedMonth);
    message.success(`已批量生成 ${res.data.rows?.length ?? 0} 份确认单`);
    await loadData();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await createExportJob("signature_summary", "xlsx", selectedMonth, { documentCount: documents.length });
      await downloadExportJobFile(res.data.id, res.data.fileName);
      message.success(`签名汇总表已下载：${res.data.fileName}`);
    } finally {
      setExporting(false);
    }
  };

  const handleDownload = async (row: ConfirmationDocument, fileFormat: "pdf" | "png") => {
    await downloadConfirmationDocumentFile(row.id, fileFormat);
  };

  const handleGenerateSalaryDocuments = async () => {
    setGeneratingSalary(true);
    try {
      const res = await generateSalaryDocuments(selectedMonth);
      message.success(`已生成 ${res.data.rows?.length ?? 0} 份提成/绩效薪资确认单`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? "生成薪资确认单失败。");
    } finally {
      setGeneratingSalary(false);
    }
  };

  const handleSend = async (row: ConfirmationDocument) => {
    if (usesLocalSignatureBackend()) {
      Modal.warning({
        title: "本地确认单不能外发",
        content: <Space direction="vertical"><Typography.Paragraph>当前确认单和签名 Token 保存于本机数据库，复制出的 localhost 链接只能在本机打开，不能发给手机或其他员工。</Typography.Paragraph><Typography.Link href={`${productionAppUrl}#/signature-confirm`} target="_blank">打开线上 XJD Finance 生成可外发链接</Typography.Link></Space>
      });
      return;
    }
    const res = await sendSignatureLink(row.id);
    const url = externalSignatureUrl(res.data.signatureUrl);
    const copied = await copyText(url);
    if (res.data.sendStatus === "notified") {
      message.success(`签名链接已通过${notificationChannelLabel(res.data.notificationChannel)}发送${copied ? "，并已复制" : ""}`);
    } else if (res.data.sendStatus === "delivery_failed") {
      Modal.warning({
        title: `${notificationChannelLabel(res.data.notificationChannel)}发送失败`,
        content: <Space direction="vertical"><Typography.Paragraph>{res.data.notificationError ?? "请检查机器人凭据和员工钉钉映射。"}</Typography.Paragraph><Typography.Paragraph copyable>{url}</Typography.Paragraph></Space>
      });
    } else {
      Modal.info({
        title: "签名链接已生成，但未配置机器人发送",
        content: <Space direction="vertical"><Typography.Paragraph>请在参数规则页配置钉钉企业应用或群机器人；当前可复制链接后手工发送。</Typography.Paragraph><Typography.Paragraph copyable>{url}</Typography.Paragraph></Space>
      });
    }
    await loadData();
  };

  const handleMarkNotified = async (row: ConfirmationDocument) => {
    try {
      await markSignatureLinkNotified(row.id, "manual_copy");
      message.success("已记录为手工复制通知，等待员工签名");
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message ?? "通知记录失败，请先生成有效签名链接");
    }
  };

  const handleSupervisorConfirm = (row: ConfirmationDocument) => setSupervisorDocument(row);

  const handleVoid = (row: ConfirmationDocument) => setVoidingDocument(row);

  const needConfirmCount = documents.length;
  const sentCount = documents.filter((row) => row.sendStatus === "notified").length;
  const signedCount = documents.filter((row) => row.signatureStatus === "signed").length;
  const pendingSignCount = Math.max(needConfirmCount - signedCount, 0);
  const supervisorConfirmedCount = documents.filter((row) => row.supervisorStatus === "confirmed").length;
  const progressPercent = needConfirmCount ? Math.round((signedCount / needConfirmCount) * 100) : 0;
  const salaryDocuments = [
    ...salesSalaryDocuments.map((row) => ({ ...row, salaryRole: "销售代表" as const })),
    ...customerServiceSalaryDocuments.map((row) => ({ ...row, salaryRole: "操作员" as const }))
  ];
  const salesSalaryTotal = salesSalaryDocuments.reduce((sum, row) => sum + row.commissionAmount, 0);
  const customerServiceSalaryTotal = customerServiceSalaryDocuments.reduce((sum, row) => sum + row.commissionAmount, 0);
  const personalSalesPayload = parsePayload(salesSalaryDocuments[0]);
  const personalLogisticsCommission = personalSalesPayload?.summary.logisticsCommission
    ?? personalSalesPayload?.details.filter((row) => row.salaryComponent !== "注册/服务提成").reduce((sum, row) => sum + row.commissionAmount, 0)
    ?? 0;
  const personalServiceCommission = personalSalesPayload?.summary.serviceCommission
    ?? personalSalesPayload?.details.filter((row) => row.salaryComponent === "注册/服务提成").reduce((sum, row) => sum + row.commissionAmount, 0)
    ?? 0;

  const columns: ColumnsType<ConfirmationDocument> = [
    { title: "销售代表", dataIndex: "ownerName", fixed: "left", width: 110 },
    { title: "业务类型", dataIndex: "businessType", width: 110, render: () => "物流业务" },
    { title: "订单数量", dataIndex: "orderCount", width: 100 },
    { title: "最终提成金额", dataIndex: "commissionAmount", align: "right", width: 140, render: toPlainMoney },
    { title: "个人确认单状态", dataIndex: "documentStatus", width: 130, render: (value) => <Tag color={value === "voided" ? "red" : "blue"}>{value === "voided" ? "已作废" : "已生成"}</Tag> },
    {
      title: "通知状态",
      dataIndex: "sendStatus",
      width: 130,
      render: (value, row) => {
        if (value === "notified") return <Tag color="green">{notificationChannelLabel(row.notificationChannel)}已发送</Tag>;
        if (value === "delivery_failed") return <Tag color="red" title={row.notificationError ?? "发送失败"}>{notificationChannelLabel(row.notificationChannel)}发送失败</Tag>;
        if (value === "link_generated") return <Tag color="blue">链接已生成</Tag>;
        return <Tag color="gold">未生成链接</Tag>;
      }
    },
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
          {canApprove ? <Button size="small" onClick={() => handleSend(row)}>生成并发送钉钉</Button> : null}
          {canApprove ? <Button size="small" disabled={!row.signatureUrl} onClick={async () => {
            if (usesLocalSignatureBackend()) {
              Modal.warning({
                title: "这是本机调试链接",
                content: <Space direction="vertical"><Typography.Paragraph>本机数据库生成的链接不能在外部设备打开。请在线上系统生成后再复制发送。</Typography.Paragraph><Typography.Link href={`${productionAppUrl}#/signature-confirm`} target="_blank">打开线上签名管理</Typography.Link></Space>
              });
              return;
            }
            const url = externalSignatureUrl(row.signatureUrl);
            if (await copyText(url)) message.success("签名链接已复制");
            else Modal.info({ title: "请手动复制签名链接", content: <Typography.Paragraph copyable>{url}</Typography.Paragraph> });
          }}>复制链接</Button> : null}
          {canApprove ? <Button size="small" disabled={!row.signatureUrl || row.sendStatus === "notified"} onClick={() => handleMarkNotified(row)}>标记手工通知</Button> : null}
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>下载 PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>下载 PNG</Button>
          {canApprove ? <Button size="small" disabled={row.supervisorStatus === "confirmed" || row.signatureStatus !== "signed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button> : null}
          {canApprove ? <Button size="small" onClick={() => handleVoid(row)}>作废重签</Button> : null}
        </Space>
      )
    }
  ];

  const salesDetailColumns: ColumnsType<ConfirmationPayloadDetail> = [
    { title: "系统订单号", dataIndex: "orderNo", fixed: "left", width: 130 },
    { title: "原始订单号", dataIndex: "originalOrderNo", width: 130, render: (value) => value || "-" },
    { title: "业务类型", dataIndex: "businessType", width: 130 },
    { title: "金额构成", dataIndex: "salaryComponent", width: 130, render: (value) => value || "物流提成" },
    { title: "毛利", dataIndex: "grossProfit", align: "right", width: 120, render: toPlainMoney },
    { title: "提成比例", dataIndex: "commissionRate", align: "right", width: 110, render: formatPercent },
    { title: "确认提成", dataIndex: "commissionAmount", align: "right", width: 130, render: toPlainMoney }
  ];

  const operatorDetailColumns: ColumnsType<ConfirmationPayloadDetail> = [
    { title: "绩效板块", dataIndex: "performanceCategory", fixed: "left", width: 160, render: (value, row) => value || row.orderNo },
    { title: "Excel票数", dataIndex: "rawOrderCount", align: "right", width: 110, render: (value) => value ?? "-" },
    { title: "规则基础票数", dataIndex: "baseCount", align: "right", width: 120, render: (value) => value ?? "-" },
    { title: "计发票数", dataIndex: "commissionOrderCount", align: "right", width: 110, render: (value) => value ?? "-" },
    { title: "绩效规则", dataIndex: "bracketLabel", width: 230, render: (value) => value || "-" },
    { title: "计薪单价", dataIndex: "performanceRate", align: "right", width: 120, render: (value, row) => `${value ?? 0}${row.performanceRateUnit ?? ""}` },
    { title: "绩效金额", dataIndex: "commissionAmount", align: "right", width: 130, render: toPlainMoney }
  ];

  const detailColumns = isOperatorSalaryDocument ? operatorDetailColumns : salesDetailColumns;

  const salaryColumns: ColumnsType<(typeof salaryDocuments)[number]> = [
    { title: "人员类型", dataIndex: "salaryRole", width: 110, render: (value) => <Tag color={value === "销售代表" ? "blue" : "purple"}>{value}</Tag> },
    { title: "姓名", dataIndex: "ownerName", fixed: "left", width: 120 },
    { title: "确认单", dataIndex: "businessType", width: 160, render: (value) => value === "sales_salary" ? "销售提成薪资确认单" : "操作员薪资确认单" },
    { title: "订单/业务量", dataIndex: "orderCount", width: 120 },
    { title: "本月确认金额", dataIndex: "commissionAmount", align: "right", width: 150, render: toPlainMoney },
    { title: "员工签名", dataIndex: "signatureStatus", width: 110, render: (value) => value === "signed" ? <Tag color="green">已签名</Tag> : <Tag color="gold">待签名</Tag> },
    { title: "主管确认", dataIndex: "supervisorStatus", width: 110, render: (value) => value === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待确认</Tag> },
    {
      title: "操作",
      key: "actions",
      fixed: "right",
      width: 410,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => setSelectedDocument(row)}>查看确认单</Button>
          {canApprove ? <Button size="small" onClick={() => handleSend(row)}>生成并发送钉钉</Button> : null}
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>PNG</Button>
          {canApprove ? <Button size="small" disabled={row.supervisorStatus === "confirmed" || row.signatureStatus !== "signed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button> : null}
          {canApprove ? <Button size="small" danger onClick={() => handleVoid(row)}>作废重签</Button> : null}
        </Space>
      )
    }
  ];

  return (
    <div className="signature-board">
      {(!isPersonalAccount || isSalesAccount) ? <Card
        className="signature-confirm-card"
        title={<div className="signature-title-block"><strong>{isSalesAccount ? "我的物流提成确认单" : "员工电子签名确认中心"}</strong><span>{isSalesAccount ? "仅显示本人作为销售代表的物流订单、提成金额和签名状态。" : "主管生成个人提成确认单，员工在线签名后回传状态，最终由主管确认发放。"}</span></div>}
        extra={<Space size={10} wrap>{canApprove ? <Button type="primary" onClick={handleBatchGenerate}>批量生成确认单</Button> : null}{canExport ? <Button loading={exporting} onClick={handleExport}>导出签名汇总表</Button> : null}</Space>}
      >
        <div className="signature-stat-grid">
          <div><span>本月需确认人数</span><strong>{needConfirmCount}</strong></div>
          <div><span>已通知人数</span><strong>{sentCount}</strong></div>
          <div><span>已签名人数</span><strong>{signedCount}</strong></div>
          <div><span>待签名人数</span><strong>{pendingSignCount}</strong></div>
          <div><span>已主管确认人数</span><strong>{supervisorConfirmedCount}</strong></div>
        </div>

        <Progress className="signature-progress" percent={progressPercent} showInfo={false} strokeColor={{ "0%": "#5274ef", "100%": "#40c58d" }} trailColor="#eef3f9" />
        <Table rowKey="id" className="signature-summary-table" loading={loading} columns={columns} dataSource={documents} pagination={false} scroll={{ x: 1680 }} />
      </Card> : null}

      <Card
        className="signature-confirm-card"
        title={<div className="signature-title-block"><strong>{isDualAccount ? "我的综合提成与绩效确认单" : isSalesAccount ? "我的综合提成确认单" : isOperatorAccount ? "我的操作员绩效确认单" : "薪资汇总与确认单"}</strong><span>{isDualAccount ? "同时列示本人销售提成和本人作为操作员负责的绩效，两类金额分别计算、分别留痕。" : isSalesAccount ? "合并列示本人物流提成和已由主管确认的注册/服务提成。" : isOperatorAccount ? "按本人负责业务的各绩效板块列示 Excel 票数、规则和绩效金额。" : "销售代表按物流提成与已主管确认的注册/服务提成汇总；操作员按各绩效板块汇总。金额仅来自当前月份已导入数据，不包含固定工资、社保及个税。"}</span></div>}
        extra={canApprove ? <Button type="primary" loading={generatingSalary} onClick={handleGenerateSalaryDocuments}>批量生成薪资确认单</Button> : null}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={isPersonalAccount ? "个人确认范围" : "薪资确认范围说明"}
          description={isDualAccount
            ? "销售确认单仅汇总本人作为销售代表的物流与注册/服务提成；操作员确认单仅汇总本人作为客服代表的绩效，互不混算。"
            : isSalesAccount
            ? "下方确认单只汇总本人的物流提成和已由主管确认的注册/服务提成。未完成主管确认的注册业务不会提前计入。"
            : isOperatorAccount
              ? "下方确认单只列示本人各绩效板块的 Excel 统计、规则基础票数、计发票数、单价和绩效小计。"
              : "销售代表确认单汇总物流提成及已主管确认的注册/服务提成；操作员确认单按各绩效板块列示 Excel 票数、基础票数、计发票数、规则和小计。生成后可发送外部签名链接，员工签名和主管确认均会写入确认单证据链。"}
        />
        {isDualAccount ? (
          <div className="signature-stat-grid">
            <div><span>物流提成</span><strong>{toPlainMoney(personalLogisticsCommission)}</strong></div>
            <div><span>注册/服务提成</span><strong>{toPlainMoney(personalServiceCommission)}</strong></div>
            <div><span>销售提成合计</span><strong>{toPlainMoney(salesSalaryTotal)}</strong></div>
            <div><span>操作员绩效</span><strong>{toPlainMoney(customerServiceSalaryTotal)}</strong></div>
            <div><span>本月确认合计</span><strong>{toPlainMoney(salesSalaryTotal + customerServiceSalaryTotal)}</strong></div>
          </div>
        ) : isSalesAccount ? (
          <div className="signature-stat-grid signature-stat-grid-personal">
            <div><span>物流提成</span><strong>{toPlainMoney(personalLogisticsCommission)}</strong></div>
            <div><span>注册/服务提成</span><strong>{toPlainMoney(personalServiceCommission)}</strong></div>
            <div><span>本月确认合计</span><strong>{toPlainMoney(salesSalaryTotal)}</strong></div>
            <div><span>确认单状态</span><strong>{salesSalaryDocuments[0]?.signatureStatus === "signed" ? "已签名" : salesSalaryDocuments.length ? "待签名" : "未生成"}</strong></div>
          </div>
        ) : isOperatorAccount ? (
          <div className="signature-stat-grid signature-stat-grid-personal">
            <div><span>本人业务量</span><strong>{customerServiceSalaryDocuments[0]?.orderCount ?? 0}</strong></div>
            <div><span>绩效确认金额</span><strong>{toPlainMoney(customerServiceSalaryTotal)}</strong></div>
            <div><span>员工签名</span><strong>{customerServiceSalaryDocuments[0]?.signatureStatus === "signed" ? "已签名" : customerServiceSalaryDocuments.length ? "待签名" : "未生成"}</strong></div>
            <div><span>主管确认</span><strong>{customerServiceSalaryDocuments[0]?.supervisorStatus === "confirmed" ? "已确认" : "待确认"}</strong></div>
          </div>
        ) : (
          <div className="signature-stat-grid">
            <div><span>销售代表确认人数</span><strong>{salesSalaryDocuments.length}</strong></div>
            <div><span>销售提成确认金额</span><strong>{toPlainMoney(salesSalaryTotal)}</strong></div>
            <div><span>操作员确认人数</span><strong>{customerServiceSalaryDocuments.length}</strong></div>
            <div><span>操作员绩效确认金额</span><strong>{toPlainMoney(customerServiceSalaryTotal)}</strong></div>
            <div><span>薪资确认合计</span><strong>{toPlainMoney(salesSalaryTotal + customerServiceSalaryTotal)}</strong></div>
          </div>
        )}
        <Table
          rowKey={(row) => `${row.salaryRole}-${row.id}`}
          className="signature-summary-table"
          loading={loading || generatingSalary}
          columns={salaryColumns}
          dataSource={salaryDocuments}
          locale={{ emptyText: "尚未生成薪资确认单，请先点击“批量生成薪资确认单”。" }}
          pagination={false}
          scroll={{ x: 1280 }}
        />
      </Card>

      <Modal
        open={Boolean(selectedDocument)}
        title={selectedPayload?.title ?? `${selectedDocument?.ownerName ?? ""} 个人确认单`}
        footer={<Button type="primary" onClick={() => setSelectedDocument(null)}>关闭</Button>}
        onCancel={() => setSelectedDocument(null)}
        width={1180}
        className="salary-confirmation-modal"
      >
        {selectedPayload ? (
          <Space direction="vertical" size={16} style={{ width: "100%" }}>
            <div className="salary-confirmation-meta">
              <Tag color={isOperatorSalaryDocument ? "purple" : "blue"}>{salaryDocumentTypeLabel(selectedPayload.fileType)}</Tag>
              <Typography.Text type="secondary">确认月份：{selectedPayload.monthLabel}</Typography.Text>
              <Typography.Text type="secondary">确认单编号：{selectedPayload.documentCode}</Typography.Text>
              <Typography.Text type="secondary">生成时间：{dateTimeText(selectedPayload.generatedAt)}</Typography.Text>
            </div>

            <Typography.Title level={5}>一、确认信息与金额汇总</Typography.Title>
            <Descriptions className="salary-confirmation-summary" bordered column={{ xs: 1, md: 2 }} size="small">
              <Descriptions.Item label="员工姓名">{selectedPayload.summary.ownerName}</Descriptions.Item>
              <Descriptions.Item label="确认状态">{salaryStatusLabel(selectedPayload.summary.status, selectedDocument?.signatureStatus)}</Descriptions.Item>
              <Descriptions.Item label="订单数量">{selectedPayload.summary.orderCount}</Descriptions.Item>
              <Descriptions.Item label="提成比例">{formatPercent(selectedPayload.summary.commissionRate)}</Descriptions.Item>
              <Descriptions.Item label="应收金额">{toPlainMoney(selectedPayload.summary.receivable)}</Descriptions.Item>
              {!isSalesAccount ? <Descriptions.Item label="调整后应付">{toPlainMoney(selectedPayload.summary.payable)}</Descriptions.Item> : null}
              <Descriptions.Item label="调整后毛利">{toPlainMoney(selectedPayload.summary.grossProfit)}</Descriptions.Item>
              <Descriptions.Item label="应计提成">{toPlainMoney(selectedPayload.summary.accruedCommission)}</Descriptions.Item>
              <Descriptions.Item label="主管调整金额">{toPlainMoney(selectedPayload.summary.supervisorAdjustmentAmount)}</Descriptions.Item>
              <Descriptions.Item label="最终确认提成"><Typography.Text strong>{toPlainMoney(selectedPayload.summary.finalCommission)}</Typography.Text></Descriptions.Item>
              <Descriptions.Item label="确认口径" span={2}>{selectedPayload.summary.abnormalNote}</Descriptions.Item>
              <Descriptions.Item label="发放说明" span={2}>{selectedPayload.summary.payoutNote ?? "-"}</Descriptions.Item>
            </Descriptions>

            <Typography.Title level={5}>{isOperatorSalaryDocument ? "二、绩效板块明细" : "二、订单提成明细"}</Typography.Title>
            <Table
              rowKey={(row) => `${row.orderNo}-${row.originalOrderNo ?? ""}`}
              size="small"
              pagination={false}
              dataSource={selectedPayload.details}
              columns={detailColumns}
              scroll={{ x: isOperatorSalaryDocument ? 980 : 900 }}
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
                {selectedDocument?.signatureUrl ? externalSignatureUrl(selectedDocument.signatureUrl) : "待发送后生成"}
              </Descriptions.Item>
            </Descriptions>
          </Space>
        ) : (
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="业务类型">{selectedDocument?.businessType || "logistics"}</Descriptions.Item>
            <Descriptions.Item label="订单数量">{selectedDocument?.orderCount ?? 0}</Descriptions.Item>
            <Descriptions.Item label="最终提成金额">{toPlainMoney(selectedDocument?.commissionAmount)}</Descriptions.Item>
            <Descriptions.Item label="确认单状态">{selectedDocument?.documentStatus}</Descriptions.Item>
              <Descriptions.Item label="通知状态">{selectedDocument?.sendStatus === "notified" ? `${notificationChannelLabel(selectedDocument.notificationChannel)}已发送` : selectedDocument?.sendStatus === "delivery_failed" ? `${notificationChannelLabel(selectedDocument.notificationChannel)}发送失败：${selectedDocument.notificationError ?? "请复制链接后手工发送"}` : selectedDocument?.sendStatus === "link_generated" ? "链接已生成，待通知" : "未生成链接"}</Descriptions.Item>
            <Descriptions.Item label="员工签名状态">{selectedDocument?.signatureStatus}</Descriptions.Item>
            <Descriptions.Item label="主管确认状态">{selectedDocument?.supervisorStatus}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
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
            await loadData();
          } finally { setActionLoading(false); }
        }}
      />
      <ReasonActionModal
        open={Boolean(voidingDocument)}
        title={`作废并重签：${voidingDocument?.ownerName ?? ""}`}
        description="原确认单会保留审计记录，需要重新生成新版本。"
        confirmText="确认作废"
        danger
        loading={actionLoading}
        onCancel={() => setVoidingDocument(null)}
        onConfirm={async (reason) => {
          if (!voidingDocument) return;
          setActionLoading(true);
          try {
            await voidDocument(voidingDocument.id, reason);
            message.success(`${voidingDocument.ownerName} 已作废，等待重签`);
            setVoidingDocument(null);
            await loadData();
          } finally { setActionLoading(false); }
        }}
      />
    </div>
  );
}
