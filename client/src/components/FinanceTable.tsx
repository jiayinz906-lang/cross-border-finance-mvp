import { Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { OrderNoPopup } from "./OrderNoPopup";
import type { FinanceOrder } from "../types/finance.types";
import { formatMoney } from "../utils/formatMoney";
import { formatPercent } from "../utils/formatPercent";

const columns: ColumnsType<FinanceOrder> = [
  { title: "订单编号", dataIndex: "orderNo", key: "orderNo", width: 150, fixed: "left", render: (_, row) => <OrderNoPopup order={row} /> },
  { title: "月份", dataIndex: "month", key: "month", width: 100 },
  { title: "客户", dataIndex: "customerName", key: "customerName", width: 150 },
  { title: "业务员", dataIndex: "salespersonName", key: "salespersonName", width: 100 },
  { title: "业务类型", dataIndex: "businessType", key: "businessType", width: 140 },
  {
    title: "业务属性",
    dataIndex: "isServiceBusiness",
    key: "isServiceBusiness",
    width: 110,
    render: (value) => value ? <Tag color="orange">服务类</Tag> : <Tag color="blue">物流</Tag>
  },
  { title: "应收", dataIndex: "adjustedReceivable", key: "adjustedReceivable", render: formatMoney },
  { title: "应付", dataIndex: "adjustedPayable", key: "adjustedPayable", render: formatMoney },
  { title: "毛利", dataIndex: "adjustedGrossProfit", key: "adjustedGrossProfit", render: formatMoney },
  { title: "毛利率", dataIndex: "adjustedGrossProfitRate", key: "adjustedGrossProfitRate", render: formatPercent },
  { title: "应收状态", dataIndex: "receivableStatus", key: "receivableStatus" },
  { title: "应付状态", dataIndex: "payableStatus", key: "payableStatus" },
  {
    title: "主管确认",
    dataIndex: "needSupervisorConfirm",
    key: "needSupervisorConfirm",
    render: (value) => value ? <Tag color="gold">待确认</Tag> : <Tag color="green">无需确认</Tag>
  },
  { title: "计算备注", dataIndex: "calculationNote", key: "calculationNote", width: 240 }
];

export function FinanceTable({ data }: { data: FinanceOrder[] }) {
  return (
    <Table
      rowKey="id"
      columns={columns}
      dataSource={data}
      scroll={{ x: 1500 }}
      pagination={{ pageSize: 20 }}
    />
  );
}
