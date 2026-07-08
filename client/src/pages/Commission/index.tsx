import { Card, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getCommissions } from "../../api/commissions.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { formatMoney } from "../../utils/formatMoney";

type CommissionRow = {
  id: number;
  salespersonName: string;
  customerType: string;
  businessType: string;
  grossProfit: number;
  commissionRate: number;
  commissionAmount: number;
  confirmStatus: string;
  financeOrder?: {
    orderNo: string;
    customerOrderNo?: string | null;
    customerName: string;
  };
};

const columns: ColumnsType<CommissionRow> = [
  { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row.financeOrder ?? { orderNo: "" }} /> },
  { title: "客户", dataIndex: ["financeOrder", "customerName"], width: 150 },
  { title: "业务员", dataIndex: "salespersonName" },
  { title: "业务类型", dataIndex: "businessType" },
  { title: "毛利", dataIndex: "grossProfit", render: formatMoney },
  { title: "提成比例", dataIndex: "commissionRate", render: (v) => `${(v * 100).toFixed(0)}%` },
  { title: "提成金额", dataIndex: "commissionAmount", render: formatMoney },
  { title: "状态", dataIndex: "confirmStatus", render: (v) => v === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待确认</Tag> }
];

export default function Commission() {
  const [rows, setRows] = useState<CommissionRow[]>([]);

  useEffect(() => {
    getCommissions().then((res) => setRows(res.data.rows ?? []));
  }, []);

  return (
    <>
      <PageHeader
        title="物流提成"
        description="后端按业务员月度物流毛利区间计算提成，服务类业务不进入此表。"
      />
      <Card title="物流销售代表提成确认">
        <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1000 }} />
      </Card>
    </>
  );
}
