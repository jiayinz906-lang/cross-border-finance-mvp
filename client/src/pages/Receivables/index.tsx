import { Alert, Button, Card, Col, DatePicker, Input, InputNumber, Modal, Popconfirm, Row, Segmented, Space, Statistic, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { getChargeLines } from "../../api/finance.api";
import { getReceivables, getReceiptRecords, recordReceipt, voidReceipt } from "../../api/receivables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { FinanceChargeLine } from "../../types/finance.types";
import type { AgingBucket, CustomerReceivableAging, ReceivableResponse, ReceivableRow } from "../../types/receivable.types";
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

export default function Receivables() {
  const [data, setData] = useState<ReceivableResponse | null>(null);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<ReceivableRow | null>(null);
  const [receiptAmount, setReceiptAmount] = useState<number>(0);
  const [receiptDate, setReceiptDate] = useState<string | undefined>();
  const [receiptNote, setReceiptNote] = useState("");
  const [searchText, setSearchText] = useState("");
  const [quickFilter, setQuickFilter] = useState<"all" | "outstanding" | "overdue" | "aging90">("all");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const [chargeLines, setChargeLines] = useState<Record<string, FinanceChargeLine[]>>({});
  const [loadingChargeOrder, setLoadingChargeOrder] = useState<string | null>(null);
  const { selectedMonth } = useSelectedMonth();

  const loadData = () => {
    Promise.all([
      getReceivables(selectedMonth),
      getReceiptRecords(selectedMonth)
    ]).then(([receivableRes, settlementRes]) => {
      setData(receivableRes.data);
      setSettlements(settlementRes.data.rows ?? []);
      setChargeLines({});
    });
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
        row.customerName,
        row.businessType,
        row.salespersonName
      ].some((value) => String(value ?? "").toLowerCase().includes(keyword));
      const matchedFilter =
        quickFilter === "all" ||
        (quickFilter === "outstanding" && row.outstandingReceivable > 0) ||
        (quickFilter === "overdue" && row.overdue) ||
        (quickFilter === "aging90" && row.agingBucket === "90+");
      return matchedKeyword && matchedFilter;
    });
  }, [quickFilter, rows, searchText]);
  const topOverdueCustomer = data?.customerAging.find((item) => item.overdueOutstanding > 0);
  const customerColumns: ColumnsType<CustomerReceivableAging> = [
    { title: "客户", dataIndex: "customerName" },
    { title: "票数", dataIndex: "orderCount", width: 80, align: "right" },
    { title: "应收", dataIndex: "receivable", align: "right", render: formatMoney },
    { title: "已回款", dataIndex: "received", align: "right", render: formatMoney },
    { title: "未回款", dataIndex: "outstanding", align: "right", render: formatMoney },
    { title: "逾期未回款", dataIndex: "overdueOutstanding", align: "right", render: formatMoney },
    { title: "最大账龄", dataIndex: "maxAgingDays", width: 100, align: "right", render: (value) => `${value}天` }
  ];

  const detailColumns: ColumnsType<ReceivableRow> = [
    { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 150, render: (value) => value || "-" },
    { title: "客户", dataIndex: "customerName", width: 160 },
    { title: "业务类型", dataIndex: "businessType", width: 150 },
    { title: "应收金额", dataIndex: "adjustedReceivable", align: "right", render: formatMoney },
    { title: "已回款", dataIndex: "receivedAmount", align: "right", render: formatMoney },
    { title: "未回款", dataIndex: "outstandingReceivable", align: "right", render: formatMoney },
    { title: "账龄", dataIndex: "agingDays", width: 90, align: "right", render: (value) => `${value}天` },
    { title: "账龄段", dataIndex: "agingBucket", width: 100, render: (value) => <Tag color={value === "90+" ? "red" : value === "61-90" ? "orange" : "blue"}>{value}</Tag> },
    { title: "风险", dataIndex: "overdue", width: 100, render: (value) => value ? <Tag color="red">逾期</Tag> : <Tag color="green">正常</Tag> },
    { title: "状态", dataIndex: "receivableStatus", width: 110, render: (value) => <Tag>{value}</Tag> },
    {
      title: "操作",
      fixed: "right",
      width: 110,
      render: (_, row) => (
        <Button
          size="small"
          disabled={row.outstandingReceivable <= 0}
          onClick={() => {
            setSelectedRow(row);
            setReceiptAmount(row.outstandingReceivable);
            setReceiptDate(undefined);
            setReceiptNote("");
          }}
        >
          登记回款
        </Button>
      )
    }
  ];

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
      const res = await getChargeLines({ month: selectedMonth, orderNo, direction: "应收" });
      setChargeLines((current) => ({ ...current, [orderNo]: res.data.rows ?? [] }));
    } catch {
      message.error("费用明细加载失败，请确认后端服务可用");
    } finally {
      setLoadingChargeOrder(null);
    }
  };

  const submitReceipt = async () => {
    if (!selectedRow) return;
    if (!receiptAmount || receiptAmount <= 0) {
      message.error("回款金额必须大于 0");
      return;
    }
    setSavingReceipt(true);
    try {
      await recordReceipt(selectedRow.id, {
        amount: receiptAmount,
        settledAt: receiptDate,
        operator: "财务",
        note: receiptNote
      });
      message.success("回款已登记，应收账龄已刷新");
      setSelectedRow(null);
      loadData();
    } catch {
      message.error("回款登记失败，请检查是否已锁账或后端服务是否可用");
    } finally {
      setSavingReceipt(false);
    }
  };

  const submitVoidReceipt = async (record: SettlementRow) => {
    try {
      await voidReceipt(record.id, { operator: "财务", reason: "登记错误，财务作废" });
      message.success("回款记录已作废，应收账龄已刷新");
      loadData();
    } catch {
      message.error("回款作废失败，请检查是否已锁账或后端服务是否可用");
    }
  };

  const settlementColumns: ColumnsType<SettlementRow> = [
    { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], width: 150 },
    { title: "客户", dataIndex: "counterparty", width: 160 },
    { title: "金额", dataIndex: "amount", align: "right", render: formatMoney },
    { title: "登记日期", dataIndex: "settledAt", width: 160, render: (value) => String(value).replace("T", " ").slice(0, 19) },
    { title: "状态", dataIndex: "status", width: 100, render: (value) => value === "voided" ? <Tag color="red">已作废</Tag> : <Tag color="green">有效</Tag> },
    { title: "操作人", dataIndex: "operator", width: 100 },
    { title: "备注", dataIndex: "note", ellipsis: true, render: (value, row) => row.status === "voided" ? row.voidReason || value || "-" : value || "-" },
    {
      title: "操作",
      width: 100,
      render: (_, row) => (
        <Popconfirm title="确认作废该回款记录？" okText="确认作废" cancelText="取消" disabled={row.status === "voided"} onConfirm={() => submitVoidReceipt(row)}>
          <Button danger size="small" disabled={row.status === "voided"}>作废</Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <>
      <PageHeader title="应收管理" description="按订单编号追踪客户应收、回款状态和未回款金额。" />

      <Alert
        type={data?.totals.overdueOutstanding ? "warning" : "success"}
        showIcon
        style={{ marginBottom: 16 }}
        message={data?.totals.overdueOutstanding ? "存在逾期未回款，需要优先跟进" : "当前未发现逾期未回款"}
        description={data?.totals.overdueOutstanding
          ? `逾期未回款 ${formatMoney(data.totals.overdueOutstanding)}，涉及 ${data.totals.overdueOrderCount} 票。重点客户：${topOverdueCustomer?.customerName ?? "待识别"}，逾期金额 ${formatMoney(topOverdueCustomer?.overdueOutstanding ?? 0)}。`
          : "所有未回款订单均在 30 天账龄内，后续按客户回款节奏持续跟踪。"}
      />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={6}><Card><Statistic title="总应收" value={data?.totals.totalReceivable ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="已回款" value={data?.totals.totalReceived ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="未回款" value={data?.totals.totalOutstanding ?? 0} precision={2} prefix="¥" /></Card></Col>
        <Col xs={24} md={6}><Card><Statistic title="逾期未回款" value={data?.totals.overdueOutstanding ?? 0} precision={2} prefix="¥" suffix={`${data?.totals.overdueOrderCount ?? 0}票`} /></Card></Col>
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

      <Card title="客户应收账龄汇总" style={{ marginBottom: 16 }}>
        <Table
          rowKey="customerName"
          size="small"
          dataSource={data?.customerAging ?? []}
          columns={customerColumns}
          pagination={{ pageSize: 6 }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card
        title={`应收订单明细（账龄截止：${data?.asOfDate ? String(data.asOfDate).slice(0, 10) : "-" }）`}
        extra={<Tag color="blue">当前筛选 {filteredRows.length} / {rows.length} 票</Tag>}
      >
        <Space wrap style={{ marginBottom: 12 }}>
          <Segmented
            value={quickFilter}
            onChange={(value) => setQuickFilter(value as typeof quickFilter)}
            options={[
              { label: "全部", value: "all" },
              { label: "未回款", value: "outstanding" },
              { label: "逾期", value: "overdue" },
              { label: "90天以上", value: "aging90" }
            ]}
          />
          <Input.Search
            allowClear
            style={{ width: 320 }}
            placeholder="搜索订单号、原始订单号、客户、业务员"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </Space>
        <Table
          rowKey="id"
          dataSource={filteredRows}
          columns={detailColumns}
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
          scroll={{ x: 1480 }}
        />
      </Card>

      <Card title="回款登记记录" style={{ marginTop: 16 }}>
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
        title="登记客户回款"
        okText="确认登记"
        cancelText="取消"
        confirmLoading={savingReceipt}
        onOk={submitReceipt}
        onCancel={() => setSelectedRow(null)}
      >
        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          <div>订单：<b>{selectedRow?.orderNo}</b> / 客户：{selectedRow?.customerName}</div>
          <div>剩余未回款：<b>{formatMoney(selectedRow?.outstandingReceivable ?? 0)}</b></div>
          <InputNumber
            style={{ width: "100%" }}
            min={0}
            precision={2}
            value={receiptAmount}
            onChange={(value) => setReceiptAmount(Number(value ?? 0))}
            placeholder="回款金额"
          />
          <DatePicker style={{ width: "100%" }} onChange={(_, value) => setReceiptDate(Array.isArray(value) ? value[0] : value)} />
          <Input.TextArea value={receiptNote} onChange={(event) => setReceiptNote(event.target.value)} placeholder="备注，例如银行回单号、付款账户" />
        </Space>
      </Modal>
    </>
  );
}
