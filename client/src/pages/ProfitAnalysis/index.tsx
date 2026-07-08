import { Alert, Card, Col, Row, Space, Table } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { getProfitAnalysis } from "../../api/profit.api";
import { BarList, DonutChart } from "../../components/MiniCharts";
import { OrderNoPopup } from "../../components/OrderNoPopup";
import { PageHeader } from "../../components/PageHeader";
import { StatCard } from "../../components/StatCard";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type ProfitBucket = {
  name: string;
  orderCount: number;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
};

type ProfitRow = {
  id: number;
  orderNo: string;
  customerOrderNo?: string | null;
  customerName: string;
  salespersonName: string;
  businessType: string;
  adjustedReceivable: number;
  adjustedPayable: number;
  adjustedGrossProfit: number;
  adjustedGrossProfitRate: number | null;
  calculationNote?: string;
};

type ProfitAnalysisData = {
  note: string;
  totals: {
    orderCount: number;
    totalReceivable: number;
    totalPayable: number;
    totalGrossProfit: number;
    grossProfitRate: number | null;
  };
  byBusinessType: ProfitBucket[];
  bySalesperson: ProfitBucket[];
  byCustomer: ProfitBucket[];
  rows: ProfitRow[];
};

const bucketColumns: ColumnsType<ProfitBucket> = [
  { title: "维度", dataIndex: "name" },
  { title: "票数", dataIndex: "orderCount", width: 80 },
  { title: "应收", dataIndex: "receivable", render: formatMoney },
  { title: "应付", dataIndex: "payable", render: formatMoney },
  { title: "毛利", dataIndex: "grossProfit", render: formatMoney },
  { title: "毛利率", dataIndex: "grossProfitRate", render: formatPercent }
];

const rowColumns: ColumnsType<ProfitRow> = [
  { title: "订单编号", dataIndex: "orderNo", fixed: "left", width: 150, render: (_, row) => <OrderNoPopup order={row} /> },
  { title: "客户", dataIndex: "customerName" },
  { title: "业务员", dataIndex: "salespersonName" },
  { title: "物流业务类型", dataIndex: "businessType" },
  { title: "应收", dataIndex: "adjustedReceivable", render: formatMoney },
  { title: "应付", dataIndex: "adjustedPayable", render: formatMoney },
  { title: "毛利", dataIndex: "adjustedGrossProfit", render: formatMoney },
  { title: "毛利率", dataIndex: "adjustedGrossProfitRate", render: formatPercent }
];

export default function ProfitAnalysis() {
  const [data, setData] = useState<ProfitAnalysisData | null>(null);

  useEffect(() => {
    getProfitAnalysis().then((res) => setData(res.data));
  }, []);

  return (
    <Space direction="vertical" size={16} className="page-stack">
      <PageHeader
        title="业务利润分析"
        description="本页仅统计物流业务，注册、证书、店铺租赁等服务类业务不进入利润分析。"
      />
      <Alert type="info" showIcon message={data?.note ?? "利润分析仅包含物流业务。"} />
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}><StatCard title="物流票数" value={data?.totals.orderCount ?? 0} /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="物流应收" value={formatMoney(data?.totals.totalReceivable)} /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="物流毛利" value={formatMoney(data?.totals.totalGrossProfit)} /></Col>
        <Col xs={24} sm={12} lg={6}><StatCard title="物流毛利率" value={formatPercent(data?.totals.grossProfitRate)} /></Col>
      </Row>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="业务类型毛利占比">
            <DonutChart data={data?.byBusinessType ?? []} labelKey="name" valueKey="grossProfit" title="物流业务毛利" />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="业务员物流毛利排行">
            <BarList data={data?.bySalesperson ?? []} labelKey="name" valueKey="grossProfit" title="业务员毛利" />
          </Card>
        </Col>
      </Row>
      <Card title="业务类型利润汇总">
        <Table rowKey="name" dataSource={data?.byBusinessType ?? []} columns={bucketColumns} pagination={false} />
      </Card>
      <Card title="物流订单利润明细">
        <Table rowKey="id" dataSource={data?.rows ?? []} columns={rowColumns} scroll={{ x: 1200 }} />
      </Card>
    </Space>
  );
}
