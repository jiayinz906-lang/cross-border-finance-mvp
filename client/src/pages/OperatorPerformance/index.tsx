import { Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getOperatorPerformanceAnalysis } from "../../api/analytics.api";
import { getFinanceDashboard } from "../../api/finance.api";
import type { DashboardData, FinanceOrder } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type MetricCard = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

type PerformanceCategory = "white" | "grey" | "company" | "eac" | "trademark";

type PerformanceRule = {
  key: PerformanceCategory;
  orderType: string;
  baseCount: number;
  rate: number;
  note: string;
};

type PerformanceRow = {
  id: string;
  operatorName: string;
  orderType: string;
  orderCount: number;
  baseCount: number;
  commissionOrderCount: number;
  rate: number;
  commissionAmount: number;
  note: string;
  rowSpan?: number;
};

type OperatorGroup = {
  operatorName: string;
  rows: PerformanceRow[];
  totalCommission: number;
  payablePerformance: number;
};

const rules: PerformanceRule[] = [
  {
    key: "white",
    orderType: "汽运白关、铁路白关",
    baseCount: 9,
    rate: 50,
    note: "其他客户1-10票发放50元/票；11-20票发放80元/票，20票以上也是80元/票；基础操作量不拿提成"
  },
  {
    key: "grey",
    orderType: "物流灰关",
    baseCount: 50,
    rate: 10,
    note: "5-70票：10元/票；71-100票：20元/票"
  },
  {
    key: "company",
    orderType: "公司注册",
    baseCount: 0,
    rate: 100,
    note: "基础绩效奖金：按照每笔工单完成，发放100元/票"
  },
  {
    key: "eac",
    orderType: "EAC注册",
    baseCount: 0,
    rate: 50,
    note: "基础绩效奖金：按照每笔工单完成，发放50元/票"
  },
  {
    key: "trademark",
    orderType: "商标注册",
    baseCount: 0,
    rate: 50,
    note: "基础绩效奖金：按照每笔工单完成，发放50元/票"
  }
];

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN楼", "楼").replace(/\s/g, "");
}

function classifyOrder(order: FinanceOrder): PerformanceCategory | null {
  const type = order.businessType ?? "";
  if (type.includes("白关") || type.includes("铁路")) return "white";
  if (type.includes("灰关")) return "grey";
  if (type.includes("公司")) return "company";
  if (type.includes("EAC") || type.includes("证书")) return "eac";
  if (type.includes("商标")) return "trademark";
  return null;
}

function performanceRate(rule: PerformanceRule, count: number) {
  if (rule.key === "white") {
    if (count >= 11) return 80;
    if (count >= 1) return 50;
    return 50;
  }
  if (rule.key === "grey") {
    if (count >= 71) return 20;
    if (count >= 51) return 10;
    return 10;
  }
  return rule.rate;
}

function buildRows(operatorName: string, orders: FinanceOrder[]) {
  const counts = new Map<PerformanceCategory, number>();

  for (const order of orders) {
    const category = classifyOrder(order);
    if (!category) continue;
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return rules.map((rule, index) => {
    const orderCount = counts.get(rule.key) ?? 0;
    const commissionOrderCount = orderCount - rule.baseCount;
    const rate = performanceRate(rule, orderCount);
    const validCount = Math.max(commissionOrderCount, 0);

    return {
      id: `${operatorName}-${rule.key}`,
      operatorName,
      orderType: rule.orderType,
      orderCount,
      baseCount: rule.baseCount,
      commissionOrderCount,
      rate,
      commissionAmount: validCount * rate,
      note: rule.note,
      rowSpan: index === 0 ? rules.length : 0
    };
  });
}

export default function OperatorPerformance() {
  const [operatorGroups, setOperatorGroups] = useState<OperatorGroup[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, dashboardRes] = await Promise.all([
        getOperatorPerformanceAnalysis("2026-06"),
        getFinanceDashboard("2026-06")
      ]);
      setOperatorGroups(ledgerRes.data.rows ?? []);
      setDashboard(dashboardRes.data);
    } catch {
      message.error("操作员绩效数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = dashboard?.summary;

  const metrics: MetricCard[] = useMemo(() => [
    {
      title: "总应收",
      value: toPlainMoney(summary?.totalReceivable),
      accent: "blue",
      tag: "优化后",
      note: "汇率缺失统一按 6.85 修正"
    },
    {
      title: "调整后毛利",
      value: toPlainMoney(summary?.totalGrossProfit),
      accent: "green",
      tag: formatPercent(summary?.grossProfitRate),
      note: "可用于经营分析口径"
    },
    {
      title: "物流提成",
      value: toPlainMoney(summary?.totalCommission),
      accent: "orange",
      tag: "15%",
      note: "统一按物流毛利计提"
    },
    {
      title: "高风险票",
      value: `${summary?.riskOrderCount ?? 0}票`,
      accent: "red",
      tag: "需复核",
      note: "汇率、负毛利、缺应付"
    },
    {
      title: "总票数",
      value: `${dashboard?.orderCount ?? 0}`,
      accent: "blue",
      tag: "Excel",
      note: "按运单口径去重"
    },
    {
      title: "调整后应付",
      value: toPlainMoney(summary?.totalPayable),
      accent: "green",
      tag: "含暂估",
      note: "清关/派送缺应付补齐"
    }
  ], [dashboard?.orderCount, summary]);

  const columns: ColumnsType<PerformanceRow> = [
    {
      title: "业务人员",
      dataIndex: "operatorName",
      align: "center",
      width: 130,
      render: (value, row) => ({
        children: <strong className="operator-name-cell">{value}</strong>,
        props: { rowSpan: row.rowSpan }
      })
    },
    { title: "订单类型", dataIndex: "orderType", width: 190 },
    { title: "票数", dataIndex: "orderCount", align: "right", width: 90 },
    { title: "基础票数", dataIndex: "baseCount", align: "right", width: 110 },
    { title: "提成票数", dataIndex: "commissionOrderCount", align: "right", width: 120 },
    { title: "提成比例", dataIndex: "rate", align: "right", width: 110 },
    { title: "提成金额", dataIndex: "commissionAmount", align: "right", width: 120 },
    { title: "备注", dataIndex: "note" }
  ];

  return (
    <div className="operator-board">
      <header className="profit-hero">
        <div>
          <h1>2026年6月跨境电商经营与提成测试台</h1>
          <p>基于 6月数据 Excel 汇总，统一汇率、倒推成本、物流提成和风险复核口径。</p>
        </div>
        <Space size={12} wrap>
          <div className="profit-source">数据源：<b>6月数据 Excel</b></div>
          <Button type="primary" className="profit-month-btn">2026年6月</Button>
          <Button className="profit-print-btn" onClick={() => window.print()}>打印 / 导出 PDF</Button>
          <Button onClick={loadData}>刷新</Button>
        </Space>
      </header>

      <section className="profit-metric-grid">
        {metrics.map((item) => (
          <Card key={item.title} className={`profit-metric-card profit-accent-${item.accent}`} loading={loading}>
            <span className="profit-metric-icon" />
            <span className="profit-metric-title">{item.title}</span>
            <strong>{item.value}</strong>
            <div className="profit-metric-note">
              <Tag bordered={false}>{item.tag}</Tag>
              <span>{item.note}</span>
            </div>
          </Card>
        ))}
      </section>

      <Card
        className="operator-performance-card"
        title="操作员绩效计算"
        extra={<Tag bordered={false} className="operator-policy-tag">操作员=客服代表，按图片绩效表口径生成</Tag>}
      >
        <div className="operator-rule-panel">
          <span className="operator-rule-title">操作员业务量绩效表规则</span>
          <div className="operator-rule-grid">
            <div>
              <strong>汽运白关、铁路白关</strong>
              <span>基础票数：9票</span>
              <span>提成票数 = 票数 - 基础票数</span>
              <span>1-10票：50元/票</span>
              <span>11-20票：80元/票</span>
              <span>20票以上：80元/票</span>
            </div>
            <div>
              <strong>物流灰关</strong>
              <span>基础票数：50票</span>
              <span>提成票数 = 票数 - 基础票数</span>
              <span>51-70票：10元/票</span>
              <span>71-100票：20元/票</span>
            </div>
            <div>
              <strong>公司注册</strong>
              <span>基础票数：0票</span>
              <span>按照每笔工单完成</span>
              <span>发放100元/票</span>
            </div>
            <div>
              <strong>EAC注册 / 商标注册</strong>
              <span>基础票数：0票</span>
              <span>按照每笔工单完成</span>
              <span>EAC注册：50元/票</span>
              <span>商标注册：50元/票</span>
            </div>
            <div>
              <strong>绩效金额</strong>
              <span>各订单类型提成金额汇总后按80%计入绩效金额</span>
              <span>有效数据当月薪资一起发放</span>
              <span>无提成显示当月无提成</span>
            </div>
          </div>
        </div>

        <div className="operator-table-stack">
          {operatorGroups.map((group) => (
            <div className="operator-performance-table-wrap" key={group.operatorName}>
              <div className="operator-table-title">世舟物流业务 2026年6月操作员业务量 绩效表</div>
              <Table
                rowKey="id"
                className="operator-performance-table"
                columns={columns}
                dataSource={group.rows}
                loading={loading}
                pagination={false}
                bordered
              />
              <div className="operator-total-row">
                <span>绩效金额</span>
                <strong>{group.payablePerformance}</strong>
                <em>随2026年6月薪资一起发放</em>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
