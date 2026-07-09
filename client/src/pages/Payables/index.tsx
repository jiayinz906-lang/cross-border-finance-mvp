import { Card, Col, Row, Statistic, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getPayables } from "../../api/payables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { AgingBucket, PayableResponse, PayableRow, SupplierPayableAging } from "../../types/payable.types";
import { formatMoney } from "../../utils/formatMoney";

const agingOrder: AgingBucket[] = ["0-30", "31-60", "61-90", "90+"];

export default function Payables() {
  const [data, setData] = useState<PayableResponse | null>(null);
  const { selectedMonth } = useSelectedMonth();

  useEffect(() => {
    getPayables(selectedMonth).then((res) => setData(res.data));
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
    { title: "状态", dataIndex: "payableStatus", width: 110, render: (value) => <Tag>{value}</Tag> }
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
          scroll={{ x: 1350 }}
        />
      </Card>
    </>
  );
}
