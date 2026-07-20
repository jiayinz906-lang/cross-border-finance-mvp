import {
  ApiOutlined,
  ExportOutlined,
  GithubOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Input,
  Progress,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getErpnextInvoices,
  getErpnextOverview,
  getErpnextParties,
  getErpnextPayments,
  getErpnextStatus,
  testErpnextConnection
} from "../../api/erpnext.api";
import type {
  ErpnextInvoice,
  ErpnextOverview,
  ErpnextPage,
  ErpnextParty,
  ErpnextPayment,
  ErpnextStatus
} from "../../api/erpnext.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";

type InvoiceKind = "sales" | "purchase";
type InvoiceStatus = "all" | "outstanding" | "paid" | "overdue" | "return";
type PaymentType = "all" | "receive" | "pay" | "transfer";
type PartyKind = "customer" | "supplier";

function errorMessage(error: any) {
  return error?.response?.data?.message || error?.message || "ERPNext 请求失败，请检查后端配置和远程服务。";
}

function amount(value: number | undefined, currency?: string) {
  return `${currency || ""} ${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

function monthRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return { fromDate: `${month}-01`, toDate: `${month}-${String(lastDay).padStart(2, "0")}` };
}

function invoiceStatusTag(value?: string) {
  const status = value || "未知";
  const color = status === "Paid"
    ? "success"
    : status === "Overdue"
      ? "error"
      : status === "Unpaid" || status === "Partly Paid"
        ? "warning"
        : status === "Return" || status === "Credit Note Issued"
          ? "purple"
          : "default";
  const labels: Record<string, string> = {
    Paid: "已结清",
    Overdue: "已逾期",
    Unpaid: "未结清",
    "Partly Paid": "部分结算",
    Return: "退回单",
    "Credit Note Issued": "已开贷项通知单",
    Draft: "草稿",
    Submitted: "已提交",
    Cancelled: "已取消",
    Canceled: "已取消"
  };
  return <Tag color={color}>{labels[status] || status}</Tag>;
}

function paymentTypeTag(value?: string) {
  if (value === "Receive") return <Tag color="green">收款</Tag>;
  if (value === "Pay") return <Tag color="blue">付款</Tag>;
  if (value === "Internal Transfer") return <Tag color="purple">内部转账</Tag>;
  return <Tag>{value || "-"}</Tag>;
}

function PageControls({ page, hasMore, loading, onChange }: { page: number; hasMore: boolean; loading: boolean; onChange: (page: number) => void }) {
  return (
    <Space style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
      <Button disabled={page <= 1 || loading} onClick={() => onChange(page - 1)}>上一页</Button>
      <Typography.Text>第 {page} 页</Typography.Text>
      <Button disabled={!hasMore || loading} onClick={() => onChange(page + 1)}>下一页</Button>
    </Space>
  );
}

export default function ErpnextPage() {
  const { selectedMonth } = useSelectedMonth();
  const range = useMemo(() => monthRange(selectedMonth), [selectedMonth]);
  const [status, setStatus] = useState<ErpnextStatus>();
  const [overview, setOverview] = useState<ErpnextOverview>();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [keyword, setKeyword] = useState("");
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>("all");
  const [paymentType, setPaymentType] = useState<PaymentType>("all");
  const [partyKind, setPartyKind] = useState<PartyKind>("customer");
  const [invoicePage, setInvoicePage] = useState<ErpnextPage<ErpnextInvoice>>();
  const [paymentPage, setPaymentPage] = useState<ErpnextPage<ErpnextPayment>>();
  const [partyPage, setPartyPage] = useState<ErpnextPage<ErpnextParty>>();
  const [tableLoading, setTableLoading] = useState(false);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusResponse = await getErpnextStatus();
      setStatus(statusResponse.data);
      if (statusResponse.data.configured) {
        const overviewResponse = await getErpnextOverview(range);
        setOverview(overviewResponse.data);
      } else {
        setOverview(undefined);
      }
    } catch (requestError) {
      setOverview(undefined);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void loadOverview(); }, [loadOverview]);
  useEffect(() => {
    setActiveTab("overview");
    setInvoicePage(undefined);
    setPaymentPage(undefined);
  }, [selectedMonth]);

  const loadInvoices = async (kind: InvoiceKind, page = 1) => {
    setTableLoading(true);
    setError("");
    try {
      const response = await getErpnextInvoices({ kind, status: invoiceStatus, keyword, page, pageSize: 20, ...range });
      setInvoicePage(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTableLoading(false);
    }
  };

  const loadPayments = async (page = 1) => {
    setTableLoading(true);
    setError("");
    try {
      const response = await getErpnextPayments({ paymentType, keyword, page, pageSize: 20, ...range });
      setPaymentPage(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTableLoading(false);
    }
  };

  const loadParties = async (page = 1) => {
    setTableLoading(true);
    setError("");
    try {
      const response = await getErpnextParties({ kind: partyKind, keyword, page, pageSize: 20 });
      setPartyPage(response.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTableLoading(false);
    }
  };

  const reloadActiveTab = async (page = 1) => {
    if (activeTab === "sales" || activeTab === "purchase") return loadInvoices(activeTab, page);
    if (activeTab === "payments") return loadPayments(page);
    if (activeTab === "parties") return loadParties(page);
    return loadOverview();
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === "sales" || key === "purchase") void loadInvoices(key, 1);
    if (key === "payments") void loadPayments(1);
    if (key === "parties") void loadParties(1);
  };

  const handleTest = async () => {
    setTesting(true);
    setError("");
    try {
      const response = await testErpnextConnection();
      message.success(`ERPNext 连接成功，响应 ${response.data.latencyMs}ms`);
      await loadOverview();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTesting(false);
    }
  };

  const openExternal = (path = "") => {
    if (!status?.baseUrl) return;
    window.open(`${status.baseUrl}${path}`, "_blank", "noopener,noreferrer");
  };

  const invoiceColumns = (kind: InvoiceKind): ColumnsType<ErpnextInvoice> => [
    {
      title: "单据号",
      dataIndex: "name",
      fixed: "left",
      width: 180,
      render: (value) => <Button type="link" style={{ padding: 0 }} onClick={() => openExternal(`/app/${kind === "sales" ? "sales-invoice" : "purchase-invoice"}/${encodeURIComponent(value)}`)}>{value}</Button>
    },
    { title: "过账日期", dataIndex: "posting_date", width: 110 },
    { title: "到期日", dataIndex: "due_date", width: 110, render: (value) => value || "-" },
    { title: kind === "sales" ? "客户" : "供应商", width: 190, render: (_, row) => row.customer || row.supplier || "-" },
    { title: "公司", dataIndex: "company", width: 170, render: (value) => value || "-" },
    { title: "总额", width: 140, align: "right", render: (_, row) => amount(row.rounded_total || row.grand_total, row.currency) },
    { title: "已结金额", dataIndex: "paid_amount", width: 140, align: "right", render: (value, row) => amount(value, row.currency) },
    { title: "未结金额", dataIndex: "outstanding_amount", width: 140, align: "right", render: (value, row) => <Typography.Text type={Number(value) > 0 ? "danger" : undefined}>{amount(value, row.currency)}</Typography.Text> },
    {
      title: "结算进度",
      width: 150,
      render: (_, row) => {
        const total = Math.abs(Number(row.rounded_total || row.grand_total || 0));
        const outstanding = Math.max(0, Number(row.outstanding_amount || 0));
        const percent = total ? Math.max(0, Math.min(100, Math.round((1 - outstanding / total) * 100))) : 0;
        return <Progress size="small" percent={percent} />;
      }
    },
    { title: "状态", dataIndex: "status", width: 120, render: invoiceStatusTag }
  ];

  const paymentColumns: ColumnsType<ErpnextPayment> = [
    { title: "付款单号", dataIndex: "name", fixed: "left", width: 180, render: (value) => <Button type="link" style={{ padding: 0 }} onClick={() => openExternal(`/app/payment-entry/${encodeURIComponent(value)}`)}>{value}</Button> },
    { title: "日期", dataIndex: "posting_date", width: 110 },
    { title: "类型", dataIndex: "payment_type", width: 110, render: paymentTypeTag },
    { title: "往来单位类型", dataIndex: "party_type", width: 130, render: (value) => value || "-" },
    { title: "客户/供应商", width: 190, render: (_, row) => row.party_name || row.party || "-" },
    { title: "支付金额", dataIndex: "paid_amount", align: "right", width: 130, render: (value) => amount(value) },
    { title: "到账金额", dataIndex: "received_amount", align: "right", width: 130, render: (value) => amount(value) },
    { title: "未分配金额", dataIndex: "unallocated_amount", align: "right", width: 130, render: (value) => amount(value) },
    { title: "支付方式", dataIndex: "mode_of_payment", width: 130, render: (value) => value || "-" },
    { title: "外部参考号", dataIndex: "reference_no", width: 150, render: (value) => value || "-" }
  ];

  const partyColumns: ColumnsType<ErpnextParty> = [
    { title: "ERPNext 编号", dataIndex: "name", fixed: "left", width: 180, render: (value) => <Button type="link" style={{ padding: 0 }} onClick={() => openExternal(`/app/${partyKind}/${encodeURIComponent(value)}`)}>{value}</Button> },
    { title: "名称", width: 190, render: (_, row) => row.customer_name || row.supplier_name || row.name },
    { title: "类型", width: 130, render: (_, row) => row.customer_type || (partyKind === "supplier" ? "供应商" : "-") },
    { title: "分组", width: 150, render: (_, row) => row.customer_group || row.supplier_group || "-" },
    { title: "地区", width: 150, render: (_, row) => row.territory || row.country || "-" },
    { title: "状态", dataIndex: "disabled", width: 100, render: (value) => Number(value) ? <Tag>已停用</Tag> : <Tag color="success">启用</Tag> },
    { title: "最后更新", dataIndex: "modified", width: 170, render: (value) => String(value || "-").replace("T", " ").slice(0, 19) }
  ];

  const overviewContent = overview ? (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Descriptions bordered size="small" column={{ xs: 1, md: 4 }}>
        <Descriptions.Item label="连接状态"><Tag color="success">已连接</Tag></Descriptions.Item>
        <Descriptions.Item label="ERPNext 用户">{overview.connection.remoteUser}</Descriptions.Item>
        <Descriptions.Item label="响应时间">{overview.connection.latencyMs}ms</Descriptions.Item>
        <Descriptions.Item label="数据区间">{overview.range.fromDate || "全部"} 至 {overview.range.toDate || "全部"}</Descriptions.Item>
      </Descriptions>
      <Row gutter={[12, 12]}>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="客户" value={overview.counts.customerCount} suffix="个" /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="供应商" value={overview.counts.supplierCount} suffix="个" /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="销售发票" value={overview.counts.salesInvoiceCount} suffix="张" /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="采购发票" value={overview.counts.purchaseInvoiceCount} suffix="张" /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="未收销售发票" value={overview.counts.outstandingSalesInvoiceCount} suffix="张" valueStyle={{ color: overview.counts.outstandingSalesInvoiceCount ? "#cf1322" : undefined }} /></Card></Col>
        <Col xs={12} md={8} xl={4}><Card size="small"><Statistic title="未付采购发票" value={overview.counts.outstandingPurchaseInvoiceCount} suffix="张" valueStyle={{ color: overview.counts.outstandingPurchaseInvoiceCount ? "#d46b08" : undefined }} /></Card></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={12}>
          <Card title="最近销售发票" size="small" extra={<Button type="link" onClick={() => handleTabChange("sales")}>查看全部</Button>}>
            <Table rowKey="name" size="small" columns={invoiceColumns("sales").slice(0, 8)} dataSource={overview.salesInvoices} pagination={false} scroll={{ x: 1120 }} locale={{ emptyText: <Empty description="本月暂无销售发票" /> }} />
          </Card>
        </Col>
        <Col xs={24} xl={12}>
          <Card title="最近采购发票" size="small" extra={<Button type="link" onClick={() => handleTabChange("purchase")}>查看全部</Button>}>
            <Table rowKey="name" size="small" columns={invoiceColumns("purchase").slice(0, 8)} dataSource={overview.purchaseInvoices} pagination={false} scroll={{ x: 1120 }} locale={{ emptyText: <Empty description="本月暂无采购发票" /> }} />
          </Card>
        </Col>
      </Row>
    </Space>
  ) : null;

  const invoiceContent = (kind: InvoiceKind) => (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void loadInvoices(kind, 1)} placeholder={`搜索${kind === "sales" ? "客户" : "供应商"}或单据号`} style={{ width: 300 }} />
        <Select<InvoiceStatus> value={invoiceStatus} onChange={(value) => setInvoiceStatus(value)} style={{ width: 150 }} options={[
          { label: "全部状态", value: "all" },
          { label: "未结清", value: "outstanding" },
          { label: "已结清", value: "paid" },
          { label: "已逾期", value: "overdue" },
          { label: "退回/红冲", value: "return" }
        ]} />
        <Button type="primary" icon={<SearchOutlined />} loading={tableLoading} onClick={() => void loadInvoices(kind, 1)}>查询</Button>
        <Tag color="blue">{selectedMonth}</Tag>
      </Space>
      <Table rowKey="name" columns={invoiceColumns(kind)} dataSource={invoicePage?.rows ?? []} loading={tableLoading} pagination={false} scroll={{ x: 1500 }} locale={{ emptyText: "当前条件下没有 ERPNext 发票" }} />
      <PageControls page={invoicePage?.page ?? 1} hasMore={Boolean(invoicePage?.hasMore)} loading={tableLoading} onChange={(page) => void loadInvoices(kind, page)} />
    </>
  );

  const paymentContent = (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void loadPayments(1)} placeholder="搜索付款单号、客户/供应商、参考号" style={{ width: 320 }} />
        <Select<PaymentType> value={paymentType} onChange={setPaymentType} style={{ width: 140 }} options={[
          { label: "全部类型", value: "all" },
          { label: "收款", value: "receive" },
          { label: "付款", value: "pay" },
          { label: "内部转账", value: "transfer" }
        ]} />
        <Button type="primary" icon={<SearchOutlined />} loading={tableLoading} onClick={() => void loadPayments(1)}>查询</Button>
        <Tag color="blue">{selectedMonth}</Tag>
      </Space>
      <Table rowKey="name" columns={paymentColumns} dataSource={paymentPage?.rows ?? []} loading={tableLoading} pagination={false} scroll={{ x: 1350 }} locale={{ emptyText: "当前月份没有 ERPNext 收付款记录" }} />
      <PageControls page={paymentPage?.page ?? 1} hasMore={Boolean(paymentPage?.hasMore)} loading={tableLoading} onChange={(page) => void loadPayments(page)} />
    </>
  );

  const partyContent = (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Select<PartyKind> value={partyKind} onChange={(value) => { setPartyKind(value); setPartyPage(undefined); }} style={{ width: 140 }} options={[{ label: "客户", value: "customer" }, { label: "供应商", value: "supplier" }]} />
        <Input.Search allowClear value={keyword} onChange={(event) => setKeyword(event.target.value)} onSearch={() => void loadParties(1)} placeholder="搜索编号或名称" style={{ width: 280 }} />
        <Button type="primary" icon={<SearchOutlined />} loading={tableLoading} onClick={() => void loadParties(1)}>查询</Button>
      </Space>
      <Table rowKey="name" columns={partyColumns} dataSource={partyPage?.rows ?? []} loading={tableLoading} pagination={false} scroll={{ x: 1050 }} locale={{ emptyText: `ERPNext 暂无${partyKind === "customer" ? "客户" : "供应商"}` }} />
      <PageControls page={partyPage?.page ?? 1} hasMore={Boolean(partyPage?.hasMore)} loading={tableLoading} onChange={(page) => void loadParties(page)} />
    </>
  );

  return (
    <>
      <PageHeader
        title="ERPNext 财务中心"
        description={`通过服务器 Token 只读连接 ERPNext，当前查询月份：${selectedMonth}。ERPNext 数据不会自动写入 XJD 原始台账。`}
        extra={(
          <Space wrap>
            <Button icon={<GithubOutlined />} onClick={() => window.open(status?.sourceRepository || "https://github.com/frappe/erpnext", "_blank", "noopener,noreferrer")}>官方仓库</Button>
            <Button icon={<ApiOutlined />} loading={testing} disabled={!status?.configured} onClick={() => void handleTest()}>测试连接</Button>
            <Button icon={<ReloadOutlined />} loading={loading || tableLoading} onClick={() => void reloadActiveTab()}>刷新</Button>
            {status?.baseUrl ? <Button type="primary" icon={<ExportOutlined />} onClick={() => openExternal()}>打开 ERPNext</Button> : null}
          </Space>
        )}
      />

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="接入边界"
        description="XJD 仅通过 ERPNext/Frappe 官方 REST API 查询 Customer、Supplier、Sales Invoice、Purchase Invoice 和 Payment Entry；API Secret 只保存在后端，当前不会创建、修改或删除 ERPNext 单据。"
      />
      {error ? <Alert style={{ marginBottom: 16 }} type="error" showIcon message="ERPNext 暂不可用" description={error} action={<Button onClick={() => void reloadActiveTab()}>重试</Button>} /> : null}
      {!loading && status && !status.configured ? (
        <Alert
          type="warning"
          showIcon
          message="ERPNext 连接尚未配置"
          description="请在本地 .env 或 Render 环境变量中配置 ERPNEXT_BASE_URL、ERPNEXT_API_KEY、ERPNEXT_API_SECRET，然后重新部署后端。建议在 ERPNext 创建专用只读 API 用户，不要使用 Administrator。"
        />
      ) : null}

      {loading ? <div className="page-state"><Spin tip="正在连接 ERPNext" /></div> : overview ? (
        <Card styles={{ body: { paddingTop: 8 } }}>
          <Tabs activeKey={activeTab} onChange={handleTabChange} items={[
            { key: "overview", label: "财务总览", children: overviewContent },
            { key: "sales", label: "销售发票", children: invoiceContent("sales") },
            { key: "purchase", label: "采购发票", children: invoiceContent("purchase") },
            { key: "payments", label: "收付款记录", children: paymentContent },
            { key: "parties", label: "客户/供应商", children: partyContent }
          ]} />
        </Card>
      ) : null}
    </>
  );
}
