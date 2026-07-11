import { Button, Card, Input, InputNumber, Modal, Space, Table, Tag, Typography, message } from "antd";
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
import type { FinanceOrder } from "../../types/finance.types";
import { ReasonActionModal } from "../../components/ReasonActionModal";
import { copyText } from "../../utils/copyText";

type PerformanceCategory = "white" | "grey" | "company" | "eac" | "trademark";

type PerformanceRule = {
  key: PerformanceCategory;
  orderType: string;
  baseCount: number;
  rate: number;
  note: string;
};

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
  rowSpan?: number;
};

type OperatorGroup = {
  operatorName: string;
  rows: PerformanceRow[];
  totalCommission: number;
  payablePerformance: number;
};

type EditableNumberField = "orderCount" | "baseCount" | "rate";
type EditableTextField = "orderType" | "note";

const rules: PerformanceRule[] = [
  {
    key: "white",
    orderType: "汽运白关、铁路白关",
    baseCount: 9,
    rate: 50,
    note: "其他客户1-10票发放50元/票；11-20票发放80元/票，20票以上也是80元/票；基础操作量不拿提成"
  },
  {
    key: "grey",
    orderType: "物流灰关",
    baseCount: 50,
    rate: 10,
    note: "5-70票：10元/票；71-100票：20元/票"
  },
  {
    key: "company",
    orderType: "公司注册",
    baseCount: 0,
    rate: 100,
    note: "基础绩效奖金：按照每笔工单完成，发放100元/票"
  },
  {
    key: "eac",
    orderType: "EAC注册",
    baseCount: 0,
    rate: 50,
    note: "基础绩效奖金：按照每笔工单完成，发放50元/票"
  },
  {
    key: "trademark",
    orderType: "商标注册",
    baseCount: 0,
    rate: 50,
    note: "基础绩效奖金：按照每笔工单完成，发放50元/票"
  }
];

function externalSignatureUrl(signatureUrl?: string | null) {
  if (!signatureUrl) return "";
  const route = signatureUrl.startsWith("/") ? signatureUrl : `/${signatureUrl}`;
  return `${window.location.origin}${window.location.pathname}#${route}`;
}

function signedAtText(value?: string | null) {
  return value ? value.replace("T", " ").slice(0, 19) : "-";
}

function statusTag(value: string, positiveText: string, pendingText: string) {
  if (value === "confirmed" || value === "signed" || value === "sent") return <Tag color="green">{positiveText}</Tag>;
  if (value === "voided") return <Tag color="red">已作废</Tag>;
  return <Tag color="gold">{pendingText}</Tag>;
}

function classifyOrder(order: FinanceOrder): PerformanceCategory | null {
  const type = order.businessType ?? "";
  if (type.includes("白关") || type.includes("铁路")) return "white";
  if (type.includes("灰关")) return "grey";
  if (type.includes("公司")) return "company";
  if (type.includes("EAC") || type.includes("证书")) return "eac";
  if (type.includes("商标")) return "trademark";
  return null;
}

function performanceRate(rule: PerformanceRule, count: number) {
  if (rule.key === "white") {
    if (count >= 11) return 80;
    if (count >= 1) return 50;
    return 50;
  }
  if (rule.key === "grey") {
    if (count >= 71) return 20;
    if (count >= 51) return 10;
    return 10;
  }
  return rule.rate;
}

function buildRows(operatorName: string, orders: FinanceOrder[]) {
  const counts = new Map<PerformanceCategory, number>();

  for (const order of orders) {
    const category = classifyOrder(order);
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return rules.map((rule, index) => {
    const orderCount = counts.get(rule.key) ?? 0;
    const commissionOrderCount = orderCount - rule.baseCount;
    const rate = performanceRate(rule, orderCount);
    const validCount = Math.max(commissionOrderCount, 0);

    return {
      id: `${operatorName}-${rule.key}`,
      operatorName,
      orderType: rule.orderType,
      orderCount,
      baseCount: rule.baseCount,
      commissionOrderCount,
      rate,
      commissionAmount: validCount * rate,
      note: rule.note,
      rowSpan: index === 0 ? rules.length : 0
    };
  });
}

function recalculateRow(row: PerformanceRow): PerformanceRow {
  const commissionOrderCount = row.orderCount - row.baseCount;
  return {
    ...row,
    commissionOrderCount,
    commissionAmount: Math.max(commissionOrderCount, 0) * row.rate
  };
}

function recalculateGroup(group: OperatorGroup): OperatorGroup {
  const rows = group.rows.map(recalculateRow);
  const totalCommission = rows.reduce((sum, row) => sum + row.commissionAmount, 0);
  return {
    ...group,
    rows,
    totalCommission,
    payablePerformance: Math.round(totalCommission * 0.8)
  };
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

  const handleNumberChange = (rowId: string, field: EditableNumberField, value: number | null) => {
    setOperatorGroups((groups) => groups.map((group) => {
      const rows = group.rows.map((row) => (
        row.id === rowId
          ? recalculateRow({ ...row, [field]: Number(value ?? 0) })
          : row
      ));
      return recalculateGroup({ ...group, rows });
    }));
  };

  const handleTextChange = (rowId: string, field: EditableTextField, value: string) => {
    setOperatorGroups((groups) => groups.map((group) => ({
      ...group,
      rows: group.rows.map((row) => row.id === rowId ? { ...row, [field]: value } : row)
    })));
  };

  const handleGenerateDocuments = async () => {
    const res = await generateOperatorDocuments(selectedMonth);
    message.success(`已生成 ${res.data.rows?.length ?? 0} 份操作员绩效确认单`);
    await loadData();
  };

  const handleSend = async (row: ConfirmationDocument) => {
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
      render: (value: string, row) => (
        <Input value={value} onChange={(event) => handleTextChange(row.id, "orderType", event.target.value)} />
      )
    },
    {
      title: "票数",
      dataIndex: "orderCount",
      align: "right",
      width: 110,
      render: (value: number, row) => (
        <InputNumber min={0} precision={0} value={value} onChange={(next) => handleNumberChange(row.id, "orderCount", next)} />
      )
    },
    {
      title: "基础票数",
      dataIndex: "baseCount",
      align: "right",
      width: 120,
      render: (value: number, row) => (
        <InputNumber min={0} precision={0} value={value} onChange={(next) => handleNumberChange(row.id, "baseCount", next)} />
      )
    },
    { title: "提成票数", dataIndex: "commissionOrderCount", align: "right", width: 120 },
    {
      title: "提成比例",
      dataIndex: "rate",
      align: "right",
      width: 120,
      render: (value: number, row) => (
        <InputNumber min={0} precision={2} value={value} onChange={(next) => handleNumberChange(row.id, "rate", next)} />
      )
    },
    { title: "提成金额", dataIndex: "commissionAmount", align: "right", width: 120 },
    {
      title: "备注",
      dataIndex: "note",
      render: (value: string, row) => (
        <Input value={value} onChange={(event) => handleTextChange(row.id, "note", event.target.value)} />
      )
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
          <Button size="small" disabled={!row.signatureUrl} onClick={() => navigator.clipboard?.writeText(externalSignatureUrl(row.signatureUrl))}>复制链接</Button>
          <Button size="small" onClick={() => handleDownload(row, "xlsx")}>下载确认单</Button>
          <Button size="small" onClick={() => handleDownload(row, "pdf")}>下载 PDF</Button>
          <Button size="small" onClick={() => handleDownload(row, "png")}>下载 PNG</Button>
          <Button size="small" disabled={row.supervisorStatus === "confirmed"} onClick={() => handleSupervisorConfirm(row)}>主管确认</Button>
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
            <Tag bordered={false} className="operator-policy-tag">操作员=客服代表，按图片绩效表口径生成</Tag>
            <Tag color="blue">总绩效金额：{totalPayablePerformance}</Tag>
          </Space>
        )}
      >
        <div className="operator-rule-panel">
          <span className="operator-rule-title">操作员业务量绩效表规则</span>
          <div className="operator-rule-grid">
            <div>
              <strong>汽运白关、铁路白关</strong>
              <span>基础票数：9票</span>
              <span>提成票数 = 票数 - 基础票数</span>
              <span>1-10票：50元/票</span>
              <span>11-20票：80元/票</span>
              <span>20票以上：80元/票</span>
            </div>
            <div>
              <strong>物流灰关</strong>
              <span>基础票数：50票</span>
              <span>提成票数 = 票数 - 基础票数</span>
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
              <span>各订单类型提成金额汇总后按80%计入绩效金额</span>
              <span>有效数据当月薪资一起发放</span>
              <span>无提成显示当月无提成</span>
            </div>
          </div>
        </div>

        <div className="operator-table-stack">
          {operatorGroups.map((group) => (
            <div className="operator-performance-table-wrap" key={group.operatorName}>
              <div className="operator-table-title">世舟物流业务 2026年6月操作员业务量 绩效表</div>
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
                <span>绩效金额</span>
                <strong>{group.payablePerformance}</strong>
                <em>随2026年6月薪资一起发放</em>
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
