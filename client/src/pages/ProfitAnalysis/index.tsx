import { Button, Card, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getFinanceDashboard } from "../../api/finance.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { BusinessSummary, DashboardData } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

type ProfitMetric = {
  title: string;
  value: string;
  accent: "blue" | "green" | "orange" | "red";
  tag: string;
  note: string;
};

type ProfitSplit = {
  title: string;
  type: "total" | "logistics" | "service";
  orderCount: number;
  receivable: number;
  payable: number;
  grossProfit: number;
  grossProfitRate: number | null;
  note: string;
};

const serviceKeywords = ["注册", "证书", "店铺", "商标", "注销", "EAC"];

function isServiceType(type: string) {
  return serviceKeywords.some((keyword) => type.includes(keyword));
}

function commissionBasis(type: string) {
  return isServiceType(type) ? "主管确认提成" : "物流阶梯提成";
}

function toPlainMoney(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥").replace(/\s/g, "");
}

export default function ProfitAnalysis() {
  const { selectedMonth } = useSelectedMonth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showBusinessSummary, setShowBusinessSummary] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getFinanceDashboard(selectedMonth);
      setData(res.data);
    } catch {
      message.error("业务利润数据加载失败，请确认后端服务可用。");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = data?.summary;
  const businessRows = data?.businessSummary ?? [];
  const logisticsRows = businessRows.filter((item) => !isServiceType(item.businessType));
  const serviceRows = businessRows.filter((item) => isServiceType(item.businessType));

  function sumRows(rows: BusinessSummary[]) {
    const receivable = rows.reduce((sum, item) => sum + item.receivable, 0);
    const payable = rows.reduce((sum, item) => sum + item.payable, 0);
    const grossProfit = rows.reduce((sum, item) => sum + item.grossProfit, 0);
    return {
      orderCount: rows.reduce((sum, item) => sum + item.orderCount, 0),
      receivable,
      payable,
      grossProfit,
      grossProfitRate: receivable > 0 ? grossProfit / receivable : null
    };
  }

  const logisticsSplit = sumRows(logisticsRows);
  const serviceSplit = sumRows(serviceRows);

  const splits: ProfitSplit[] = [
    {
      title: "总业务",
      type: "total",
      orderCount: data?.orderCount ?? 0,
      receivable: summary?.totalReceivable ?? 0,
      payable: summary?.totalPayable ?? 0,
      grossProfit: summary?.totalGrossProfit ?? 0,
      grossProfitRate: summary?.grossProfitRate ?? null,
      note: "物流 + 注册/服务类合计"
    },
    {
      title: "物流业务",
      type: "logistics",
      ...logisticsSplit,
      note: "进入物流阶梯提成口径"
    },
    {
      title: "注册/服务类",
      type: "service",
      ...serviceSplit,
      note: "注册、证书、店铺租赁等主管确认"
    }
  ];

  const metrics: ProfitMetric[] = useMemo(() => [
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
      value: `${data?.orderCount ?? 0}`,
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
  ], [data?.orderCount, summary]);

  const columns: ColumnsType<BusinessSummary> = [
    {
      title: "分类",
      dataIndex: "businessType",
      width: 120,
      render: (type: string) => (
        <Tag bordered={false} color={isServiceType(type) ? "purple" : "blue"}>
          {isServiceType(type) ? "注册/服务" : "物流"}
        </Tag>
      )
    },
    { title: "业务类型", dataIndex: "businessType" },
    { title: "票数", dataIndex: "orderCount", width: 92 },
    { title: "修正后应收", dataIndex: "receivable", align: "right", render: toPlainMoney },
    { title: "调整后应付", dataIndex: "payable", align: "right", render: toPlainMoney },
    { title: "调整后毛利", dataIndex: "grossProfit", align: "right", render: toPlainMoney },
    { title: "毛利率", dataIndex: "grossProfitRate", align: "right", render: formatPercent },
    { title: "提成口径", dataIndex: "businessType", render: commissionBasis }
  ];

  return (
    <div className="profit-board">
      <header className="profit-hero">
        <div>
          <h1>{selectedMonth} 跨境物流财务管理</h1>
          <p>基于 6月数据 Excel 汇总，统一汇率、倒推成本、物流提成和风险复核口径。</p>
        </div>
        <Space size={12} wrap>
          <div className="profit-source">数据源：<b>6月数据 Excel</b></div>
          <Button type="primary" className="profit-month-btn">{selectedMonth}</Button>
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

      <section className="profit-split-grid">
        {splits.map((item) => (
          <Card key={item.title} className={`profit-split-card profit-split-${item.type}`} loading={loading}>
            <div className="profit-split-head">
              <div>
                <span>{item.title}</span>
                <strong>{item.orderCount}票</strong>
              </div>
              <Tag bordered={false}>{formatPercent(item.grossProfitRate)}</Tag>
            </div>
            <div className="profit-split-body">
              <div><span>应收</span><b>{toPlainMoney(item.receivable)}</b></div>
              <div><span>应付</span><b>{toPlainMoney(item.payable)}</b></div>
              <div><span>毛利</span><b>{toPlainMoney(item.grossProfit)}</b></div>
            </div>
            <p>{item.note}</p>
          </Card>
        ))}
      </section>

      <Card
        className="profit-summary-card"
        title="业务类型利润汇总（物流 / 注册分开）"
        extra={(
          <Button
            type="text"
            size="small"
            className="profit-link-btn"
            onClick={() => setShowBusinessSummary((value) => !value)}
          >
            {showBusinessSummary ? "隐藏业务类型汇总" : "展示业务类型汇总"}
          </Button>
        )}
      >
        {showBusinessSummary ? (
          <Table
            rowKey="businessType"
            loading={loading}
            columns={columns}
            dataSource={businessRows}
            pagination={false}
            scroll={{ x: 1120 }}
          />
        ) : (
          <div className="profit-hidden-summary">业务类型汇总已隐藏，可通过右上角按钮恢复展示。</div>
        )}
      </Card>
    </div>
  );
}
