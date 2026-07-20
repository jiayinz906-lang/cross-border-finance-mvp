import { DownloadOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, DatePicker, Input, InputNumber, Modal, Popconfirm, Progress, Row, Segmented, Select, Space, Statistic, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { getChargeLines } from "../../api/finance.api";
import { exportPayables, getPayables, getPaymentRecords, recordPayment, voidPayment } from "../../api/payables.api";
import { BillingStatusTag, type BillingStatus } from "../../components/BillingStatusTag";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { FinanceChargeLine } from "../../types/finance.types";
import type { AgingBucket, PayableResponse, PayableRow, SupplierPayableAging } from "../../types/payable.types";
import { formatMoney } from "../../utils/formatMoney";

const agingOrder: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

type SettlementRow = {
  id: number;
  amount: number;
  status: string;
  settledAt: string;
  counterparty?: string | null;
  operator: string;
  note?: string | null;
  voidReason?: string | null;
  financeOrder?: { orderNo: string };
};

export default function Payables() {
  const [data, setData] = useState<PayableResponse | null>(null);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<PayableRow | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDate, setPaymentDate] = useState<string | undefined>();
  const [paymentNote, setPaymentNote] = useState("");
  const [searchText, setSearchText] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "outstanding" | "overdue" | "aging90">("all");
  const [statusFilter, setStatusFilter] = useState<BillingStatus | "all">("all");
  const [dateRange, setDateRange] = useState<[string, string] | null>(null);
  const [filterResetKey, setFilterResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [exporting, setExporting] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [chargeLines, setChargeLines] = useState<Record<string, FinanceChargeLine[]>>({});
  const [loadingChargeOrder, setLoadingChargeOrder] = useState<string | null>(null);
  const { selectedMonth } = useSelectedMonth();

  const loadData = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [payableRes, settlementRes] = await Promise.all([
        getPayables(selectedMonth),
        getPaymentRecords(selectedMonth)
      ]);
      setData(payableRes.data);
      setSettlements(settlementRes.data.rows ?? []);
      setChargeLines({});
    } catch {
      setLoadError("供应商应付账单加载失败，请检查后端服务或登录状态后重试。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const rows = data?.rows ?? [];
  const filteredRows = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const matchedKeyword = !keyword || [
        row.orderNo,
        row.customerOrderNo,
        row.supplierName,
        row.businessType,
        row.salespersonName
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
      const matchedFilter =
        quickFilter === "all" ||
        (quickFilter === "outstanding" && row.outstandingPayable > 0) ||
        (quickFilter === "overdue" && row.overdue) ||
        (quickFilter === "aging90" && row.agingBucket === "90+");
      const matchedStatus = statusFilter === "all" || row.billingStatus === statusFilter;
      const orderDate = String(row.orderDate).slice(0, 10);
      const matchedDate = !dateRange || (orderDate >= dateRange[0] && orderDate <= dateRange[1]);
      return matchedKeyword && matchedFilter && matchedStatus && matchedDate;
    });
  }, [dateRange, quickFilter, rows, searchText, statusFilter]);
  const topOverdueSupplier = data?.supplierAging.find((item) => item.overdueOutstanding > 0);
  const supplierColumns: ColumnsType<SupplierPayableAging> = [
    { title: "供应商", dataIndex: "supplierName" },
    { title: "票数", dataIndex: "orderCount", width: 80, align: "right" },
    { title: "应付", dataIndex: "payable", align: "right", render: formatMoney },
    { title: "已付款", dataIndex: "paid", align: "right", render: formatMoney },
    { title: "未付款", dataIndex: "outstanding", align: "right", render: formatMoney },
    { title: "待退款/冲销", dataIndex: "refundAmount", align: "right", render: (value) => Number(value) > 0 ? <Tag color="orange">{formatMoney(value)}</Tag> : "-" },
    { title: "逾期未付款", dataIndex: "overdueOutstanding", align: "right", render: formatMoney },
    { title: "最大账龄", dataIndex: "maxAgingDays", width: 100, align: "right", render: (value) => `${value}天` }
  ];

  const detailColumns: ColumnsType<PayableRow> = [
    { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 150, render: (value) => value || "-" },
    { title: "供应商", dataIndex: "supplierName", width: 160, render: (value) => value || "未指定供应商" },
    { title: "日期", dataIndex: "orderDate", width: 110, render: (value) => String(value).slice(0, 10) },
    { title: "业务类型", dataIndex: "businessType", width: 150 },
    { title: "销售代表", dataIndex: "salespersonName", width: 100 },
    { title: "应付金额", dataIndex: "adjustedPayable", align: "right", render: formatMoney },
    { title: "已登记付款", dataIndex: "registeredPaymentAmount", align: "right", render: formatMoney },
    { title: "已付款", dataIndex: "paidAmount", align: "right", render: formatMoney },
    {
      title: "剩余未付款/待冲销",
      width: 160,
      align: "right",
      render: (_, row) => row.refundablePaymentAmount > 0
        ? <Tag color="orange">待冲销 {formatMoney(row.refundablePaymentAmount)}</Tag>
        : formatMoney(row.outstandingPayable)
    },
    {
      title: "结算进度",
      dataIndex: "settlementRate",
      width: 150,
      render: (value, row) => <Progress percent={Math.round(Number(value) * 100)} size="small" status={row.billingStatus === "refund_due" ? "exception" : undefined} />
    },
    { title: "账龄", dataIndex: "agingDays", width: 90, align: "right", render: (value) => `${value}天` },
    { title: "账龄段", dataIndex: "agingBucket", width: 100, render: (value) => <Tag color={value === "90+" ? "red" : value === "61-90" ? "orange" : "blue"}>{value}</Tag> },
    { title: "风险", dataIndex: "overdue", width: 100, render: (value) => value ? <Tag color="red">逾期</Tag> : <Tag color="green">正常</Tag> },
    { title: "结算状态", dataIndex: "billingStatus", width: 120, render: (value) => <BillingStatusTag status={value} /> },
    {
      title: "操作",
      fixed: "right",
      width: 110,
      render: (_, row) => (
        <Button
          size="small"
          disabled={row.outstandingPayable <= 0}
          onClick={() => {
            setSelectedRow(row);
            setPaymentAmount(row.outstandingPayable);
            setPaymentDate(undefined);
            setPaymentNote("");
          }}
        >
          登记付款
        </Button>
      )
    }
  ];

  const resetFilters = () => {
    setSearchText("");
    setQuickFilter("all");
    setStatusFilter("all");
    setDateRange(null);
    setFilterResetKey((value) => value + 1);
  };

  const downloadBills = async () => {
    setExporting(true);
    try {
      await exportPayables(selectedMonth);
      message.success("供应商应付账单已导出");
    } catch {
      message.error("账单导出失败，请检查登录权限或后端服务");
    } finally {
      setExporting(false);
    }
  };

  const chargeColumns: ColumnsType<FinanceChargeLine> = [
    { title: "Excel行", dataIndex: "rowIndex", width: 80 },
    { title: "费用类型", dataIndex: "feeType", width: 120 },
    { title: "收付类型", dataIndex: "direction", width: 90 },
    { title: "对应用户", dataIndex: "customerName", width: 140, render: (value) => value || "-" },
    { title: "销售代表", dataIndex: "salespersonName", width: 100, render: (value) => value || "-" },
    { title: "客服代表", dataIndex: "customerServiceName", width: 100, render: (value) => value || "-" },
    { title: "供应商", dataIndex: "supplierName", width: 160, render: (value) => value || "-" },
    { title: "原始金额", dataIndex: "originalAmount", align: "right", render: formatMoney },
    { title: "本币费用", dataIndex: "localAmount", align: "right", render: formatMoney },
    { title: "原始符号金额", dataIndex: "signedAmount", align: "right", render: formatMoney },
    { title: "汇率", dataIndex: "exchangeRate", width: 90, render: (value) => value ?? "-" }
  ];

  const loadChargeLines = async (orderNo: string) => {
    if (chargeLines[orderNo]) return;
    setLoadingChargeOrder(orderNo);
    try {
      const res = await getChargeLines({ month: selectedMonth, orderNo, direction: "应付" });
      setChargeLines((current) => ({ ...current, [orderNo]: res.data.rows ?? [] }));
    } catch {
      message.error("费用明细加载失败，请确认后端服务可用");
    } finally {
      setLoadingChargeOrder(null);
    }
  };

  const submitPayment = async () => {
    if (!selectedRow) return;
    if (!paymentAmount || paymentAmount <= 0) {
      message.error("付款金额必须大于 0");
      return;
    }
    setSavingPayment(true);
    try {
      await recordPayment(selectedRow.id, {
        amount: paymentAmount,
        settledAt: paymentDate,
        operator: "财务",
        note: paymentNote
      });
      message.success("付款已登记，应付账龄已刷新");
      setSelectedRow(null);
      loadData();
    } catch {
      message.error("付款登记失败，请检查是否已锁账或后端服务是否可用");
    } finally {
      setSavingPayment(false);
    }
  };

  const submitVoidPayment = async (record: SettlementRow) => {
    try {
      await voidPayment(record.id, { operator: "财务", reason: "登记错误，财务作废" });
      message.success("付款记录已作废，应付账龄已刷新");
      loadData();
    } catch {
      message.error("付款作废失败，请检查是否已锁账或后端服务是否可用");
    }
  };

  const settlementColumns: ColumnsType<SettlementRow> = [
    { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], width: 150 },
    { title: "供应商", dataIndex: "counterparty", width: 160, render: (value) => value || "未指定供应商" },
    { title: "金额", dataIndex: "amount", align: "right", render: formatMoney },
    { title: "登记日期", dataIndex: "settledAt", width: 160, render: (value) => String(value).replace("T", " ").slice(0, 19) },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => value === "voided" ? <Tag color="red">已作废</Tag> : <Tag color="green">有效</Tag> },
    { title: "操作人", dataIndex: "operator", width: 100 },
    { title: "备注", dataIndex: "note", ellipsis: true, render: (value, row) => row.status === "voided" ? row.voidReason || value || "-" : value || "-" },
    {
      title: "操作",
      width: 100,
      render: (_, row) => (
        <Popconfirm title="确认作废该付款记录？" okText="确认作废" cancelText="取消" disabled={row.status === "voided"} onConfirm={() => submitVoidPayment(row)}>
          <Button danger size="small" disabled={row.status === "voided"}>作废</Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <>
      <PageHeader title="上游应付" description="按订单编号追踪供应商应付、付款状态和未付款金额。" />

      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void loadData()}>重试</Button>} style={{ marginBottom: 16 }} /> : null}

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="本页应付严格按导入 Excel 原始费用明细计算"
        description="上游应付仅统计物流类订单；公司注册、EAC 证书、店铺租赁等服务类应付已从本页排除。供应商汇总按 Excel 原始应付明细行归集，单票多供应商会拆分到各自供应商。"
      />

      <Alert
        type={data?.totals.overdueOutstanding ? "warning" : "success"}
        showIcon
        style={{ marginBottom: 16 }}
        message={data?.totals.overdueOutstanding ? "存在逾期未付款，需要安排付款计划" : "当前未发现逾期未付款"}
        description={data?.totals.overdueOutstanding
          ? `逾期未付款 ${formatMoney(data.totals.overdueOutstanding)}，涉及 ${data.totals.overdueOrderCount} 票。重点供应商：${topOverdueSupplier?.supplierName ?? "未指定供应商"}，逾期金额 ${formatMoney(topOverdueSupplier?.overdueOutstanding ?? 0)}。`
          : "所有未付款订单均在 30 天账龄内，可按供应商结算周期正常安排。"}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card><Statistic title="总应付" value={data?.totals.totalPayable ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="已付款" value={data?.totals.totalPaid ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="未付款" value={data?.totals.totalOutstanding ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="逾期未付款" value={data?.totals.overdueOutstanding ?? 0} precision={2} prefix="¥" suffix={`${data?.totals.overdueOrderCount ?? 0}票`} /></Card></Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {agingOrder.map((key) => (
          <Col xs={12} md={6} key={key}>
            <Card size="small">
              <Statistic title={`${key}天账龄`} value={data?.agingBuckets[key] ?? 0} precision={2} prefix="¥" />
            </Card>
          </Col>
        ))}
      </Row>

      <Card title="供应商应付账龄汇总" style={{ marginBottom: 16 }}>
        <Table
          rowKey="supplierName"
          size="small"
          dataSource={data?.supplierAging ?? []}
          columns={supplierColumns}
          loading={loading}
          pagination={{ pageSize: 6 }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card
        title={`应付订单明细（账龄截止：${data?.asOfDate ? String(data.asOfDate).slice(0, 10) : "-" }）`}
        extra={<Tag color="blue">当前筛选 {filteredRows.length} / {rows.length} 票</Tag>}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented
            value={quickFilter}
            onChange={(value) => setQuickFilter(value as typeof quickFilter)}
            options={[
              { label: "全部", value: "all" },
              { label: "未付款", value: "outstanding" },
              { label: "逾期", value: "overdue" },
              { label: "90天以上", value: "aging90" }
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 320 }}
            placeholder="搜索订单号、原始订单号、供应商、业务员"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select
            value={statusFilter}
            style={{ width: 140 }}
            onChange={setStatusFilter}
            options={[
              { label: "全部结算状态", value: "all" },
              { label: "待结算", value: "unsettled" },
              { label: "部分结算", value: "partial" },
              { label: "已结清", value: "settled" },
              { label: "待退款/冲销", value: "refund_due" }
            ]}
          />
          <DatePicker.RangePicker
            key={filterResetKey}
            onChange={(_, values) => setDateRange(values[0] && values[1] ? [values[0], values[1]] : null)}
          />
          <Button icon={<ReloadOutlined />} onClick={resetFilters}>重置</Button>
          <Button type="primary" icon={<DownloadOutlined />} loading={exporting} onClick={() => void downloadBills()}>导出账单</Button>
        </Space>
        <Table
          rowKey="id"
          dataSource={filteredRows}
          columns={detailColumns}
          loading={loading}
          expandable={{
            expandedRowRender: (row) => (
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                loading={loadingChargeOrder === row.orderNo}
                dataSource={chargeLines[row.orderNo] ?? []}
                columns={chargeColumns}
                scroll={{ x: 1200 }}
              />
            ),
            onExpand: (expanded, row) => {
              if (expanded) void loadChargeLines(row.orderNo);
            }
          }}
          scroll={{ x: 2050 }}
        />
      </Card>

      <Card title="付款登记记录" style={{ marginTop: 16 }}>
        <Table
          rowKey="id"
          size="small"
          dataSource={settlements}
          columns={settlementColumns}
          pagination={{ pageSize: 6 }}
          scroll={{ x: 1000 }}
        />
      </Card>

      <Modal
        open={Boolean(selectedRow)}
        title="登记供应商付款"
        okText="确认登记"
        cancelText="取消"
        confirmLoading={savingPayment}
        onOk={submitPayment}
        onCancel={() => setSelectedRow(null)}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>订单：<b>{selectedRow?.orderNo}</b> / 供应商：{selectedRow?.supplierName || "未指定供应商"}</div>
          <div>剩余未付款：<b>{formatMoney(selectedRow?.outstandingPayable ?? 0)}</b></div>
          <InputNumber
            style={{ width: "100%" }}
            min={0}
            precision={2}
            value={paymentAmount}
            onChange={(value) => setPaymentAmount(Number(value ?? 0))}
            placeholder="付款金额"
          />
          <DatePicker style={{ width: "100%" }} onChange={(_, value) => setPaymentDate(Array.isArray(value) ? value[0] : value)} />
          <Input.TextArea value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} placeholder="备注，例如银行回单号、付款账户" />
        </Space>
      </Modal>
    </>
  );
}
