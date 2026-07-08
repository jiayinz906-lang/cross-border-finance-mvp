import { Card, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getRisks } from "../../api/risks.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";

type RiskRow = {
  id: number;
  riskType: string;
  riskLevel: string;
  riskReasons: string;
  suggestion: string;
  status: string;
  financeOrder?: {
    orderNo: string;
    customerOrderNo?: string | null;
    customerName: string;
    businessType: string;
  };
};

const riskTypeMap: Record<string, string> = {
  exchange_rate_missing: "汇率缺失",
  abnormal_high_profit: "异常高利润",
  low_profit: "低利润",
  cost_missing: "成本缺失",
  service_confirm: "服务类确认",
  finance_review: "财务复核"
};

const columns: ColumnsType<RiskRow> = [
  { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row.financeOrder ?? { orderNo: "" }} /> },
  { title: "客户", dataIndex: ["financeOrder", "customerName"], width: 150 },
  { title: "业务类型", dataIndex: ["financeOrder", "businessType"] },
  { title: "风险类型", dataIndex: "riskType", render: (v) => riskTypeMap[v] ?? v },
  { title: "等级", dataIndex: "riskLevel", render: (v) => <Tag color={v === "high" ? "red" : "orange"}>{v === "high" ? "高风险" : "中风险"}</Tag> },
  { title: "原因", dataIndex: "riskReasons", width: 260 },
  { title: "建议", dataIndex: "suggestion", width: 260 },
  { title: "状态", dataIndex: "status", render: (v) => v === "open" ? <Tag color="gold">待处理</Tag> : <Tag color="green">已处理</Tag> }
];

export default function Risks() {
  const [rows, setRows] = useState<RiskRow[]>([]);

  useEffect(() => {
    getRisks().then((res) => setRows(res.data.rows ?? []));
  }, []);

  return (
    <>
      <PageHeader
        title="风险复查"
        description="高风险、异常高利润、汇率缺失、成本缺失和服务类确认均保留订单编号。"
      />
      <Card title="异常提醒明细">
        <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1300 }} />
      </Card>
    </>
  );
}
