import { Card, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { getPayables } from "../../api/payables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { FinanceOrder } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";

export default function Payables() {
  const [data, setData] = useState<FinanceOrder[]>([]);
  const { selectedMonth } = useSelectedMonth();

  useEffect(() => {
    getPayables(selectedMonth).then((res) => setData(res.data));
  }, [selectedMonth]);

  return (
    <>
      <PageHeader title="上游应付" description="按订单编号追踪供应商应付、付款状态和未付款金额。" />
      <Card title="应付订单明细">
        <Table
          rowKey="id"
          dataSource={data}
          columns={[
            { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
            { title: "供应商", dataIndex: "supplierName" },
            { title: "业务类型", dataIndex: "businessType" },
            { title: "应付金额", dataIndex: "adjustedPayable", render: formatMoney },
            { title: "已付款", dataIndex: "paidAmount", render: formatMoney },
            { title: "未付款", render: (_, row) => formatMoney(row.adjustedPayable - row.paidAmount) },
            { title: "状态", dataIndex: "payableStatus", render: (v) => <Tag>{v}</Tag> }
          ]}
          scroll={{ x: 1000 }}
        />
      </Card>
    </>
  );
}
