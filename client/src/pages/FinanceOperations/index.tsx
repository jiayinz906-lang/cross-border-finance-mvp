import { Alert, Button, Card, Form, Input, InputNumber, Modal, Pagination, Select, Space, Statistic, Table, Tabs, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  confirmMatch,
  createBankTransaction,
  createPartner,
  getBankTransactions,
  getInvoices,
  getOperationsOverview,
  getPartners,
  getWorkflowTasks,
  resolveWorkflowTask,
  suggestMatches,
  syncInvoices,
  updatePartner,
  type BankTransaction,
  type BusinessPartner,
  type FinanceInvoice,
  type OperationsOverview,
  type WorkflowTask
} from "../../api/operations.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import { formatMoney } from "../../utils/formatMoney";

const statusText: Record<string, string> = {
  open: "待核销",
  partial: "部分核销",
  overdue: "已逾期",
  settled: "已结清",
  unmatched: "待匹配",
  matched: "已匹配",
  pending: "待处理",
  resolved: "已完成"
};

const statusColor = (status: string) => status === "settled" || status === "matched" || status === "resolved" ? "green" : status === "overdue" ? "red" : status === "partial" ? "blue" : "gold";
const dateText = (value: string) => new Date(value).toISOString().slice(0, 10);

export default function FinanceOperations() {
  const { selectedMonth } = useSelectedMonth();
  const navigate = useNavigate();
  const [overview, setOverview] = useState<OperationsOverview | null>(null);
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [invoices, setInvoices] = useState<FinanceInvoice[]>([]);
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [partners, setPartners] = useState<BusinessPartner[]>([]);
  const [loading, setLoading] = useState(false);
  const [invoiceType, setInvoiceType] = useState<string>();
  const [invoiceStatus, setInvoiceStatus] = useState<string>();
  const [partnerModal, setPartnerModal] = useState(false);
  const [bankModal, setBankModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<BusinessPartner | null>(null);
  const [partnerForm] = Form.useForm();
  const [bankForm] = Form.useForm();
  const [page, setPage] = useState({ invoice: 1, bank: 1, partner: 1, task: 1 });
  const [totals, setTotals] = useState({ invoice: 0, bank: 0, partner: 0, task: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [overviewRes, taskRes, invoiceRes, bankRes, partnerRes] = await Promise.all([
        getOperationsOverview(selectedMonth),
        getWorkflowTasks({ month: selectedMonth, status: "pending", page: page.task, pageSize: 20 }),
        getInvoices({ month: selectedMonth, invoiceType, status: invoiceStatus, page: page.invoice, pageSize: 20 }),
        getBankTransactions({ month: selectedMonth, page: page.bank, pageSize: 20 }),
        getPartners({ page: page.partner, pageSize: 20 })
      ]);
      setOverview(overviewRes.data);
      setTasks(taskRes.data.rows);
      setInvoices(invoiceRes.data.rows);
      setTransactions(bankRes.data.rows);
      setPartners(partnerRes.data.rows);
      setTotals({ invoice: invoiceRes.data.total, bank: bankRes.data.total, partner: partnerRes.data.total, task: taskRes.data.total });
    } catch (error: any) {
      message.error(error?.response?.data?.message || "财务工作台加载失败。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth, invoiceType, invoiceStatus, page]);

  useEffect(() => { void load(); }, [load]);

  const taskColumns: ColumnsType<WorkflowTask> = useMemo(() => [
    { title: "优先级", dataIndex: "priority", width: 90, render: (value) => <Tag color={value === "high" ? "red" : "blue"}>{value === "high" ? "紧急" : "普通"}</Tag> },
    { title: "待办事项", dataIndex: "title", render: (value, row) => <><b>{value}</b><div className="muted-cell">{row.description}</div></> },
    { title: "负责人", width: 130, render: (_, row) => row.ownerName || ({ finance: "财务", supervisor: "主管", sales: "销售/操作员" }[row.ownerRole] || row.ownerRole) },
    { title: "到期日", dataIndex: "dueAt", width: 120, render: (value) => value ? dateText(value) : "-" },
    { title: "操作", width: 170, render: (_, row) => <Space><Button size="small" onClick={() => row.route && navigate(row.route)}>去处理</Button><Button size="small" onClick={async () => { await resolveWorkflowTask(row.id); await load(); }}>标记完成</Button></Space> }
  ], [load, navigate]);

  const invoiceColumns: ColumnsType<FinanceInvoice> = [
    { title: "账单号", dataIndex: "invoiceNo", width: 210 },
    { title: "类型", dataIndex: "invoiceType", width: 90, render: (value) => value === "receivable" ? "应收" : "应付" },
    { title: "往来单位", render: (_, row) => row.partner?.name || "待确认" },
    { title: "订单号", dataIndex: "orderNo" },
    { title: "账单金额", dataIndex: "localAmount", align: "right", render: formatMoney },
    { title: "已核销", dataIndex: "allocatedAmount", align: "right", render: formatMoney },
    { title: "未核销", align: "right", render: (_, row) => formatMoney(Math.max(0, row.localAmount - row.allocatedAmount)) },
    { title: "到期日", dataIndex: "dueAt", render: (value) => dateText(value) },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={statusColor(value)}>{statusText[value] || value}</Tag> }
  ];

  const bankColumns: ColumnsType<BankTransaction> = [
    { title: "流水号", dataIndex: "transactionNo", width: 190 },
    { title: "日期", dataIndex: "transactionDate", render: (value) => dateText(value) },
    { title: "方向", dataIndex: "direction", render: (value) => value === "receivable" ? "收款" : "付款" },
    { title: "交易对方", dataIndex: "counterparty" },
    { title: "金额", dataIndex: "localAmount", align: "right", render: formatMoney },
    { title: "已匹配", dataIndex: "matchedAmount", align: "right", render: formatMoney },
    { title: "状态", dataIndex: "status", render: (value) => <Tag color={statusColor(value)}>{statusText[value] || value}</Tag> },
    {
      title: "建议匹配",
      width: 320,
      render: (_, row) => row.reconciliationMatches?.length
        ? <Space direction="vertical" size={4}>{row.reconciliationMatches.map((match) => <div key={match.id} className="match-suggestion"><span>{match.invoice.invoiceNo} · {Math.round(match.score * 100)}%</span><Button size="small" type="primary" onClick={async () => { await confirmMatch(match.id, match.suggestedAmount); message.success("核销完成，应收应付已同步更新。"); await load(); }}>核销 {formatMoney(match.suggestedAmount)}</Button></div>)}</Space>
        : <Button size="small" onClick={async () => { await suggestMatches(row.id); await load(); }}>重新匹配</Button>
    }
  ];

  const partnerColumns: ColumnsType<BusinessPartner> = [
    { title: "编码", dataIndex: "partnerCode" },
    { title: "名称", dataIndex: "name" },
    { title: "类型", dataIndex: "partnerType", render: (value) => ({ customer: "客户", supplier: "供应商", both: "客户/供应商" } as Record<string, string>)[String(value)] || String(value) },
    { title: "账期", dataIndex: "paymentTermDays", render: (value) => `${value} 天` },
    { title: "信用额度", dataIndex: "creditLimit", render: formatMoney },
    { title: "联系人", render: (_, row) => [row.contactName, row.contactPhone].filter(Boolean).join(" / ") || "-" },
    { title: "状态", dataIndex: "isActive", render: (value) => <Tag color={value ? "green" : "default"}>{value ? "启用" : "停用"}</Tag> },
    { title: "操作", render: (_, row) => <Button size="small" onClick={() => { setEditingPartner(row); partnerForm.setFieldsValue(row); setPartnerModal(true); }}>编辑</Button> }
  ];

  const savePartner = async () => {
    const values = await partnerForm.validateFields();
    if (editingPartner) await updatePartner(editingPartner.id, values); else await createPartner(values);
    message.success("往来单位已保存。");
    setPartnerModal(false); setEditingPartner(null); partnerForm.resetFields(); await load();
  };

  const saveBank = async () => {
    const values = await bankForm.validateFields();
    await createBankTransaction({ ...values, month: selectedMonth });
    message.success("流水已录入并完成首轮自动匹配。");
    setBankModal(false); bankForm.resetFields(); await load();
  };

  const pagination = (key: keyof typeof page) => <Pagination current={page[key]} total={totals[key]} pageSize={20} showSizeChanger={false} onChange={(value) => setPage((current) => ({ ...current, [key]: value }))} />;

  return (
    <div className="finance-operations-page">
      <header className="operations-header"><div><h1>财务工作台</h1><p>{selectedMonth} 往来单位、账单核销、流水匹配与跨部门待办</p></div><Button onClick={load} loading={loading}>刷新</Button></header>
      <Alert type="info" showIcon message="账单由当前月份有效财务订单生成，核销结果同步回应收与应付；原始金额仍以 Excel 费用明细账为准。" />
      <section className="operations-stat-grid">
        <Card><Statistic title="往来单位" value={overview?.partners || 0} suffix="家" /></Card>
        <Card><Statistic title="账单总额" value={overview?.invoiceAmount || 0} precision={2} prefix="¥" /></Card>
        <Card><Statistic title="未核销金额" value={(overview?.invoiceAmount || 0) - (overview?.allocatedAmount || 0)} precision={2} prefix="¥" /></Card>
        <Card><Statistic title="待匹配流水" value={overview?.unmatchedBank || 0} suffix="笔" /></Card>
        <Card><Statistic title="待办事项" value={overview?.pendingTasks || 0} suffix="项" /></Card>
      </section>
      <Card className="operations-main-card">
        <Tabs items={[
          { key: "tasks", label: `统一待办（${totals.task}）`, children: <><Table rowKey="id" columns={taskColumns} dataSource={tasks} loading={loading} pagination={false} scroll={{ x: 900 }} />{pagination("task")}</> },
          { key: "invoices", label: `应收应付账单（${totals.invoice}）`, children: <><div className="operations-toolbar"><Space wrap><Select allowClear placeholder="账单类型" value={invoiceType} onChange={setInvoiceType} options={[{ value: "receivable", label: "应收" }, { value: "payable", label: "应付" }]} /><Select allowClear placeholder="核销状态" value={invoiceStatus} onChange={setInvoiceStatus} options={["open", "partial", "overdue", "settled"].map((value) => ({ value, label: statusText[value] }))} /><Button onClick={async () => { await syncInvoices(selectedMonth); await load(); }}>从订单同步账单</Button></Space></div><Table rowKey="id" columns={invoiceColumns} dataSource={invoices} loading={loading} pagination={false} scroll={{ x: 1100 }} />{pagination("invoice")}</> },
          { key: "bank", label: `流水对账（${totals.bank}）`, children: <><div className="operations-toolbar"><Button type="primary" onClick={() => { bankForm.setFieldsValue({ direction: "receivable", currency: "CNY", exchangeRate: 1, transactionDate: new Date().toISOString().slice(0, 10) }); setBankModal(true); }}>录入银行流水</Button></div><Table rowKey="id" columns={bankColumns} dataSource={transactions} loading={loading} pagination={false} scroll={{ x: 1250 }} />{pagination("bank")}</> },
          { key: "partners", label: `客户/供应商（${totals.partner}）`, children: <><div className="operations-toolbar"><Button type="primary" onClick={() => { setEditingPartner(null); partnerForm.resetFields(); partnerForm.setFieldsValue({ partnerType: "customer", currency: "CNY", paymentTermDays: 30, creditLimit: 0, isActive: true }); setPartnerModal(true); }}>新增往来单位</Button></div><Table rowKey="id" columns={partnerColumns} dataSource={partners} loading={loading} pagination={false} scroll={{ x: 1000 }} />{pagination("partner")}</> }
        ]} />
      </Card>

      <Modal title={editingPartner ? "编辑往来单位" : "新增往来单位"} open={partnerModal} onCancel={() => setPartnerModal(false)} onOk={savePartner} destroyOnClose>
        <Form form={partnerForm} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="partnerType" label="类型" rules={[{ required: true }]}><Select options={[{ value: "customer", label: "客户" }, { value: "supplier", label: "供应商" }, { value: "both", label: "客户/供应商" }]} /></Form.Item>
          <Form.Item name="partnerCode" label="自定义编码"><Input placeholder="留空自动生成" /></Form.Item>
          <Form.Item name="taxNumber" label="税号"><Input /></Form.Item>
          <Space align="start"><Form.Item name="contactName" label="联系人"><Input /></Form.Item><Form.Item name="contactPhone" label="联系电话"><Input /></Form.Item></Space>
          <Space align="start"><Form.Item name="paymentTermDays" label="账期天数"><InputNumber min={0} /></Form.Item><Form.Item name="creditLimit" label="信用额度"><InputNumber min={0} /></Form.Item></Space>
        </Form>
      </Modal>
      <Modal title="录入银行流水" open={bankModal} onCancel={() => setBankModal(false)} onOk={saveBank} destroyOnClose>
        <Form form={bankForm} layout="vertical">
          <Form.Item name="transactionDate" label="交易日期" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="direction" label="方向" rules={[{ required: true }]}><Select options={[{ value: "receivable", label: "收款" }, { value: "payable", label: "付款" }]} /></Form.Item>
          <Form.Item name="counterparty" label="交易对方" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="originalAmount" label="原币金额" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} style={{ width: "100%" }} /></Form.Item>
          <Space align="start"><Form.Item name="currency" label="币种"><Select style={{ width: 120 }} options={[{ value: "CNY", label: "人民币" }, { value: "USD", label: "美元" }]} /></Form.Item><Form.Item name="exchangeRate" label="汇率"><InputNumber min={0.0001} precision={4} /></Form.Item></Space>
          <Form.Item name="bankReference" label="银行流水参考号"><Input /></Form.Item>
          <Form.Item name="note" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
