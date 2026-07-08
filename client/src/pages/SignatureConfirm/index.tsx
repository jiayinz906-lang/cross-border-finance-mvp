import { Button, Card, Progress, Table, Tag } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getCommissions } from "../../api/commissions.api";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { formatMoney } from "../../utils/formatMoney";

type SignatureRow = {
  id: number;
  salespersonName: string;
  businessType: string;
  commissionAmount: number;
  confirmStatus: string;
  financeOrder?: {
    orderNo: string;
    customerOrderNo?: string | null;
    customerName: string;
  };
};

const columns: ColumnsType<SignatureRow> = [
  { title: "订单编号", dataIndex: ["financeOrder", "orderNo"], fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row.financeOrder ?? { orderNo: "" }} /> },
  { title: "业务员", dataIndex: "salespersonName" },
  { title: "业务类型", dataIndex: "businessType" },
  { title: "客户", dataIndex: ["financeOrder", "customerName"] },
  { title: "最终提成金额", dataIndex: "commissionAmount", render: formatMoney },
  { title: "个人确认单", render: () => <Tag color="blue">已生成</Tag> },
  { title: "员工签名状态", dataIndex: "confirmStatus", render: (v) => v === "confirmed" ? <Tag color="green">已签名</Tag> : <Tag color="gold">待签名</Tag> },
  { title: "操作", render: () => <Button size="small">查看确认单</Button> }
];

export default function SignatureConfirm() {
  const [rows, setRows] = useState<SignatureRow[]>([]);

  useEffect(() => {
    getCommissions().then((res) => setRows(res.data.rows ?? []));
  }, []);

  const signed = rows.filter((row) => row.confirmStatus === "confirmed").length;
  const percent = rows.length ? Math.round((signed / rows.length) * 100) : 0;

  return (
    <>
      <PageHeader
        title="员工电子签名确认中心"
        description="主管生成个人提成确认单，员工在线签名后回传状态，最终由主管确认。"
        extra={<Button type="primary">批量生成确认单</Button>}
      />
      <Card title="签名进度">
        <Progress percent={percent} />
      </Card>
      <Card title="个人提成确认单" style={{ marginTop: 16 }}>
        <Table rowKey="id" dataSource={rows} columns={columns} scroll={{ x: 1200 }} />
      </Card>
    </>
  );
}
