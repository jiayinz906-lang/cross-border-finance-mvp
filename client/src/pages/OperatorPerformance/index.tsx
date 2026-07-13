import { Alert, Button, Card, Modal, Space, Table, Tag, Typography, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOperatorPerformanceAnalysis } from "../../api/analytics.api";
import {
  type ConfirmationDocument,
  downloadConfirmationDocumentFile,
  generateOperatorDocuments,
  getDocuments,
  sendSignatureLink,
  supervisorConfirmDocument,
  voidDocument
} from "../../api/workflow.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import { ReasonActionModal } from "../../components/ReasonActionModal";
import { copyText } from "../../utils/copyText";
import { externalSignatureUrl, productionAppUrl, usesLocalSignatureBackend } from "../../utils/externalSignatureUrl";

type PerformanceRow = {
  id: string;
  operatorName: string;
  orderType: string;
  orderCount: number;
  baseCount: number;
  commissionOrderCount: number;
  rate: number;
  commissionAmount: number;
  note: string;
  bracketLabel?: string;
  rowSpan?: number;
};

type OperatorGroup = {
  operatorName: string;
  rows: PerformanceRow[];
  totalCommission: number;
  payablePerformance: number;
};

function signedAtText(value?: string | null) {
  return value ? value.replace("T", " ").slice(0, 19) : "-";
}

function statusTag(value: string, positiveText: string, pendingText: string) {
  if (value === "confirmed" || value === "signed" || value === "sent") return <Tag color="green">{positiveText}</Tag>;
  if (value === "voided") return <Tag color="red">已作废</Tag>;
  return <Tag color="gold">{pendingText}</Tag>;
}

export default function OperatorPerformance() {
  const { selectedMonth } = useSelectedMonth();
  const [operatorGroups, setOperatorGroups] = useState<OperatorGroup[]>([]);
  const [documents, setDocuments] = useState<ConfirmationDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [supervisorDocument, setSupervisorDocument] = useState<ConfirmationDocument | null>(null);
  const [voidingDocument, setVoidingDocument] = useState<ConfirmationDocument | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, documentRes] = await Promise.all([
        getOperatorPerformanceAnalysis(selectedMonth),
        getDocuments(selectedMonth, "operator_performance")
      ]);
      setOperatorGroups(ledgerRes.data.rows ?? []);
      setDocuments(documentRes.data.rows ?? []);
    } catch {
      message.error("操作员绩效数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleGenerateDocuments = async () => {
    const res = await generateOperatorDocuments(selectedMonth);
    message.success(`已生成 ${res.data.rows?.length ?? 0} 份操作员绩效确认单`);
    await loadData();
  };

  const handleSend = async (row: ConfirmationDocument) => {
    if (usesLocalSignatureBackend()) {
      Modal.warning({
        title: "本地确认单不能外发",
        content: <Typography.Paragraph>当前链接对应本机数据库，仅能在本机使用。请在线上系统生成可发送给员工的链接：<Typography.Link href={`${productionAppUrl}#/operator-performance`} target="_blank">打开线上操作员绩效</Typography.Link></Typography.Paragraph>
      });
      return;
    }
    const res = await sendSignatureLink(row.id);
    const url = externalSignatureUrl(res.data.signatureUrl);
    const copied = await copyText(url);
    if (copied) message.success("绩效签名链接已生成并复制，可直接发送给客服代表");
    else Modal.info({ title: "签名链接已生成，请手动复制", content: <Typography.Paragraph copyable>{url}</Typography.Paragraph> });
    await loadData();
  };

  const handleDownload = async (row: ConfirmationDocument, fileFormat: "xlsx" | "pdf" | "png") => {
    await downloadConfirmationDocumentFile(row.id, fileFormat);
  };

  const handleSupervisorConfirm = (row: ConfirmationDocument) => setSupervisorDocument(row);

  const handleVoid = (row: ConfirmationDocument) => setVoidingDocument(row);

  const totalPayablePerformance = useMemo(
    () => operatorGroups.reduce((sum, group) => sum + group.payablePerformance, 0),
    [operatorGroups]
  );

  const columns: ColumnsType<PerformanceRow> = [
    {
      title: "业务人员",
      dataIndex: "operatorName",
      align: "center",
      width: 130,
      render: (value, row) => ({
        children: <strong className="operator-name-cell">{value}</strong>,
        props: { rowSpan: row.rowSpan }
      })
    },
    {
      title: "订单类型",
      dataIndex: "orderType",
      width: 190,
      render: (value: string) => value
    },
    {
      title: "票数（Excel 统计）",
      dataIndex: "orderCount",
      align: "right",
      width: 110,
      render: (value: number) => value
    },
    {
      title: "规则基础票数",
      dataIndex: "baseCount",
      align: "right",
      width: 120,
      render: (value: number) => value
    },
    {
      title: "自动匹配档位",
      dataIndex: "bracketLabel",
      width: 210,
      render: (value: string | undefined) => value || "-"
    },
    { title: "计发票数", dataIndex: "commissionOrderCount", align: "right", width: 120 },
    {
      title: "绩效单价（元/票）",
      dataIndex: "rate",
      align: "right",
      width: 120,
      render: (value: number) => value || "-"
    },
    { title: "分类绩效金额", dataIndex: "commissionAmount", align: "right", width: 120 },
    {
      title: "备注",
      dataIndex: "note",
      render: (value: string) => value
    }
  ];

  const documentColumns: ColumnsType<ConfirmationDocument> = [
    { title: "客服代表", dataIndex: "ownerName", fixed: "left", width: 120 },
    { title: "绩效票数", dataIndex: "orderCount", width: 100 },
    { title: "绩效金额", dataIndex: "commissionAmount", align: "right", width: 120 },
    { title: "确认单状态", dataIndex: "documentStatus", width: 120, render: (value) => statusTag(value, "已生成", "待生成") },
    { title: "发送状态", dataIndex: "sendStatus", width: 110, render: (value) => statusTag(value, "已发送", "未发送") },
    { title: "员工签名", dataIndex: "signatureStatus", width: 110, render: (value) => statusTag(value, "已签名", "待签名") },
    { title: "签名时间", dataIndex: "signedAt", width: 170, render: signedAtText },
    { title: "主管确认", dataIndex: "supervisorStatus", width: 120, render: (value) => statusTag(value, "已确认", "待确认") },
    {
      title: "操作",
      fixed: "right",
      width: 470,
      render: (_, row) => (
        <Space size={6} wrap>
          <Button size="small" onClick={() => handleSend(row)}>发送签名链接</Button>
          <Button size="small" disabled={!row.signatureUrl} onClick={async () => {
            if (usesLocalSignatureBackend()) {
              Modal.warning({ title: "这是本机调试链接", content: <Typography.Paragraph>本机数据库生成的链接无法在外部设备使用。请在线上系统重新生成。</Typography.Paragraph> });
              return;
            }
            const url = externalSignatureUrl(row.signatureUrl);
            if (await copyText(url)) message.success("签名链接已复制");
            else Modal.info({ title: "请手动复制签名链接", content: <Typography.Paragraph copyable>{url}</Typography.Paragraph> });
          }}>复制链接</Button>
          <Button size="small" onClick={() => handleDownload(row, "xlsx")}>下载确认单</Button>
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>下载 PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>下载 PNG</Button>
          <Button size="small" disabled={row.supervisorStatus === "confirmed" || row.signatureStatus !== "signed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button>
          <Button size="small" onClick={() => handleVoid(row)}>作废重签</Button>
        </Space>
      )
    }
  ];

  return (
    <div className="operator-board">
      <Card
        className="operator-performance-card"
        title="操作员绩效计算"
        extra={(
          <Space size={10} wrap>
            <Tag bordered={false} className="operator-policy-tag">按客服代表汇总；票数仅来自当前月份有效导入批次</Tag>
            <Tag color="blue">全额绩效金额：{totalPayablePerformance}</Tag>
          </Space>
        )}
      >
        <Alert
          type="info"
          showIcon
          message="票数为导入 Excel 的实际订单统计，基础票数和单价由规则自动匹配，页面不支持人工增减。"
          description="最终绩效金额等于各分类绩效金额合计，不再执行 80% 折算。"
          style={{ marginBottom: 12 }}
        />
        <div className="operator-rule-panel">
          <span className="operator-rule-title">操作员业务量绩效表规则</span>
          <div className="operator-rule-grid">
            <div>
              <strong>汽运白关、铁路白关</strong>
              <span>基础票数：9票</span>
              <span>计发票数 = 实际票数 - 9票基础量</span>
              <span>第10票：50元/票</span>
              <span>第11票及以上：80元/票</span>
            </div>
            <div>
              <strong>物流灰关</strong>
              <span>基础票数：50票</span>
              <span>计发票数 = 实际票数 - 50票基础量</span>
              <span>51-70票：10元/票</span>
              <span>71-100票：20元/票</span>
            </div>
            <div>
              <strong>公司注册</strong>
              <span>基础票数：0票</span>
              <span>按照每笔工单完成</span>
              <span>发放100元/票</span>
            </div>
            <div>
              <strong>EAC注册 / 商标注册</strong>
              <span>基础票数：0票</span>
              <span>按照每笔工单完成</span>
              <span>EAC注册：50元/票</span>
              <span>商标注册：50元/票</span>
            </div>
            <div>
              <strong>绩效金额</strong>
              <span>各订单类型分类绩效金额全额汇总</span>
              <span>不执行 80% 折算</span>
              <span>有效数据当月薪资一起发放</span>
              <span>无提成显示当月无提成</span>
            </div>
          </div>
        </div>

        <div className="operator-table-stack">
          {operatorGroups.map((group) => (
            <div className="operator-performance-table-wrap" key={group.operatorName}>
              <div className="operator-table-title">世舟物流业务 {selectedMonth} 操作员业务量绩效表</div>
              <Table
                rowKey="id"
                className="operator-performance-table"
                columns={columns}
                dataSource={group.rows}
                loading={loading}
                pagination={false}
                bordered
              />
              <div className="operator-total-row">
                <span>最终绩效金额（全额计发）</span>
                <strong>{group.payablePerformance}</strong>
                <em>随 {selectedMonth} 薪资一起发放</em>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        className="operator-signature-card"
        title={<div className="signature-title-block"><strong>操作员绩效签名确认</strong><span>按客服代表生成个人绩效确认单，员工在线签名后回传状态，最终由主管确认发放。</span></div>}
        extra={(
          <Space size={10} wrap>
            <Button type="primary" onClick={handleGenerateDocuments}>批量生成绩效确认单</Button>
            <Button onClick={loadData}>刷新状态</Button>
          </Space>
        )}
      >
        <div className="signature-stat-grid">
          <div><span>本月需确认人数</span><strong>{documents.length}</strong></div>
          <div><span>已发送人数</span><strong>{documents.filter((row) => row.sendStatus === "sent").length}</strong></div>
          <div><span>已签名人数</span><strong>{documents.filter((row) => row.signatureStatus === "signed").length}</strong></div>
          <div><span>待签名人数</span><strong>{documents.filter((row) => row.signatureStatus !== "signed").length}</strong></div>
          <div><span>已主管确认人数</span><strong>{documents.filter((row) => row.supervisorStatus === "confirmed").length}</strong></div>
        </div>

        <Table
          rowKey="id"
          className="signature-summary-table"
          loading={loading}
          columns={documentColumns}
          dataSource={documents}
          pagination={false}
          scroll={{ x: 1500 }}
        />
      </Card>
      <ReasonActionModal
        open={Boolean(supervisorDocument)}
        title={`主管确认绩效：${supervisorDocument?.ownerName ?? ""}`}
        description={`确认金额：${supervisorDocument?.commissionAmount ?? 0} 元。确认后该版本不可覆盖。`}
        confirmText="主管确认"
        reasonRequired={false}
        loading={actionLoading}
        onCancel={() => setSupervisorDocument(null)}
        onConfirm={async (reason) => {
          if (!supervisorDocument) return;
          setActionLoading(true);
          try {
            await supervisorConfirmDocument(supervisorDocument.id, reason || undefined);
            message.success(`${supervisorDocument.ownerName} 绩效单已主管确认`);
            setSupervisorDocument(null);
            await loadData();
          } finally { setActionLoading(false); }
        }}
      />
      <ReasonActionModal
        open={Boolean(voidingDocument)}
        title={`作废绩效确认单：${voidingDocument?.ownerName ?? ""}`}
        description="作废后原单保留审计记录，需要重新生成并发送签名。"
        confirmText="确认作废"
        danger
        loading={actionLoading}
        onCancel={() => setVoidingDocument(null)}
        onConfirm={async (reason) => {
          if (!voidingDocument) return;
          setActionLoading(true);
          try {
            await voidDocument(voidingDocument.id, reason);
            message.success(`${voidingDocument.ownerName} 绩效单已作废，等待重签`);
            setVoidingDocument(null);
            await loadData();
          } finally { setActionLoading(false); }
        }}
      />
    </div>
  );
}
