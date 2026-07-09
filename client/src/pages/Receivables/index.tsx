import { Card, Col, Row, Statistic, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getReceivables } from "../../api/receivables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { AgingBucket, CustomerReceivableAging, ReceivableResponse, ReceivableRow } from "../../types/receivable.types";
import { formatMoney } from "../../utils/formatMoney";

const agingOrder: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

export default function Receivables() {
  const [data, setData] = useState<ReceivableResponse | null>(null);
  const { selectedMonth } = useSelectedMonth();

  useEffect(() => {
    getReceivables(selectedMonth).then((res) => setData(res.data));
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
    { title: "状态", dataIndex: "receivableStatus", width: 110, render: (value) => <Tag>{value}</Tag> }
  ];

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
          scroll={{ x: 1350 }}
        />
      </Card>
    </>
  );
}
