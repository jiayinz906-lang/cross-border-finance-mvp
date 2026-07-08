import { Card, InputNumber, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getMonthlyReport } from "../../api/reports.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { formatMoney } from "../../utils/formatMoney";

type ServiceRecord = {
  id: number;
  serviceType: string;
  originalPrice: number;
  costAmount: number | null;
  grossProfit: number | null;
  suggestedCommissionMin: number | null;
  suggestedCommissionMax: number | null;
  confirmStatus: string;
  financeOrder?: {
    orderNo: string;
    customerOrderNo?: string | null;
    customerName: string;
  };
};

const columns: ColumnsType<ServiceRecord> = [
  { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row.financeOrder ?? { orderNo: "" }} /> },
  { title: "客户", dataIndex: ["financeOrder", "customerName"], width: 150 },
  { title: "服务", dataIndex: "serviceType" },
  { title: "成交单价", dataIndex: "originalPrice", render: formatMoney },
  { title: "成交利润", dataIndex: "grossProfit", render: formatMoney },
  {
    title: "提成区间",
    render: (_, row) => `${formatMoney(row.suggestedCommissionMin)} - ${formatMoney(row.suggestedCommissionMax)}`
  },
  {
    title: "确认提成",
    render: (_, row) => <InputNumber min={0} value={Math.round(row.suggestedCommissionMin ?? 0)} controls={false} />
  },
  { title: "状态", dataIndex: "confirmStatus", render: (v) => v === "confirmed" ? <Tag color="green">已确认</Tag> : <Tag color="gold">待主管确认</Tag> }
];

export default function ServiceConfirm() {
  const [rows, setRows] = useState<ServiceRecord[]>([]);

  useEffect(() => {
    getMonthlyReport().then((res) => setRows(res.data.serviceRecords ?? []));
  }, []);

  return (
    <>
      <PageHeader
        title="注册 / 证书 / 店铺服务主管确认"
        description="服务类业务单独确认价格和提成，不进入物流利润分析。"
      />
      <Card title="服务类订单确认">
        <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1100 }} />
      </Card>
    </>
  );
}
