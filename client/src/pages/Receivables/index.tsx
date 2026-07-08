import { Card, Table, Tag } from "antd";
import { useEffect, useState } from "react";
import { getReceivables } from "../../api/receivables.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import type { FinanceOrder } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";

export default function Receivables() {
  const [data, setData] = useState<FinanceOrder[]>([]);

  useEffect(() => {
    getReceivables().then((res) => setData(res.data));
  }, []);

  return (
    <>
      <PageHeader title="应收管理" description="按订单编号追踪客户应收、回款状态和未回款金额。" />
      <Card title="应收订单明细">
        <Table rowKey="id" dataSource={data} columns={[
          { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
          { title: "客户", dataIndex: "customerName" },
          { title: "业务类型", dataIndex: "businessType" },
          { title: "应收金额", dataIndex: "adjustedReceivable", render: formatMoney },
          { title: "已回款", dataIndex: "receivedAmount", render: formatMoney },
          { title: "未回款", render: (_, row) => formatMoney(row.adjustedReceivable - row.receivedAmount) },
          { title: "状态", dataIndex: "receivableStatus", render: (v) => <Tag>{v}</Tag> }
        ]} scroll={{ x: 1000 }} />
      </Card>
    </>
  );
}
