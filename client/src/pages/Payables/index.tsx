import { Button, Card, Col, DatePicker, Input, InputNumber, Modal, Popconfirm, Row, Space, Statistic, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getPayables, getPaymentRecords, recordPayment, voidPayment } from "../../api/payables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
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
  const [savingPayment, setSavingPayment] = useState(false);
  const { selectedMonth } = useSelectedMonth();

  const loadData = () => {
    Promise.all([
      getPayables(selectedMonth),
      getPaymentRecords(selectedMonth)
    ]).then(([payableRes, settlementRes]) => {
      setData(payableRes.data);
      setSettlements(settlementRes.data.rows ?? []);
    });
  };

  useEffect(() => {
    loadData();
  }, [selectedMonth]);

  const rows = data?.rows ?? [];
  const supplierColumns: ColumnsType<SupplierPayableAging> = [
    { title: "供应商", dataIndex: "supplierName" },
    { title: "票数", dataIndex: "orderCount", width: 80, align: "right" },
    { title: "应付", dataIndex: "payable", align: "right", render: formatMoney },
    { title: "已付款", dataIndex: "paid", align: "right", render: formatMoney },
    { title: "未付款", dataIndex: "outstanding", align: "right", render: formatMoney },
    { title: "逾期未付款", dataIndex: "overdueOutstanding", align: "right", render: formatMoney },
    { title: "最大账龄", dataIndex: "maxAgingDays", width: 100, align: "right", render: (value) => `${value}天` }
  ];

  const detailColumns: ColumnsType<PayableRow> = [
    { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 150, render: (value) => value || "-" },
    { title: "供应商", dataIndex: "supplierName", width: 160, render: (value) => value || "未指定供应商" },
    { title: "业务类型", dataIndex: "businessType", width: 150 },
    { title: "应付金额", dataIndex: "adjustedPayable", align: "right", render: formatMoney },
    { title: "已付款", dataIndex: "paidAmount", align: "right", render: formatMoney },
    { title: "未付款", dataIndex: "outstandingPayable", align: "right", render: formatMoney },
    { title: "账龄", dataIndex: "agingDays", width: 90, align: "right", render: (value) => `${value}天` },
    { title: "账龄段", dataIndex: "agingBucket", width: 100, render: (value) => <Tag color={value === "90+" ? "red" : value === "61-90" ? "orange" : "blue"}>{value}</Tag> },
    { title: "风险", dataIndex: "overdue", width: 100, render: (value) => value ? <Tag color="red">逾期</Tag> : <Tag color="green">正常</Tag> },
    { title: "状态", dataIndex: "payableStatus", width: 110, render: (value) => <Tag>{value}</Tag> },
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
          pagination={{ pageSize: 6 }}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card title={`应付订单明细（账龄截止：${data?.asOfDate ? String(data.asOfDate).slice(0, 10) : "-" }）`}>
        <Table
          rowKey="id"
          dataSource={rows}
          columns={detailColumns}
          scroll={{ x: 1480 }}
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
