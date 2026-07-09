import { Button, Card, Col, DatePicker, Input, InputNumber, Modal, Row, Space, Statistic, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getReceivables, recordReceipt } from "../../api/receivables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { AgingBucket, CustomerReceivableAging, ReceivableResponse, ReceivableRow } from "../../types/receivable.types";
import { formatMoney } from "../../utils/formatMoney";

const agingOrder: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

export default function Receivables() {
  const [data, setData] = useState<ReceivableResponse | null>(null);
  const [selectedRow, setSelectedRow] = useState<ReceivableRow | null>(null);
  const [receiptAmount, setReceiptAmount] = useState<number>(0);
  const [receiptDate, setReceiptDate] = useState<string | undefined>();
  const [receiptNote, setReceiptNote] = useState("");
  const [savingReceipt, setSavingReceipt] = useState(false);
  const { selectedMonth } = useSelectedMonth();

  const loadData = () => {
    getReceivables(selectedMonth).then((res) => setData(res.data));
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const rows = data?.rows ?? [];
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

  return (
    <>
      <PageHeader title="应收管理" description="按订单编号追踪客户应收、回款状态和未回款金额。" />

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

      <Card title={`应收订单明细（账龄截止：${data?.asOfDate ? String(data.asOfDate).slice(0, 10) : "-" }）`}>
        <Table
          rowKey="id"
          dataSource={rows}
          columns={detailColumns}
          scroll={{ x: 1480 }}
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
