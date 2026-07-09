import { Alert, Button, Card, Descriptions, Popconfirm, Space, Table, Tag, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useState } from "react";
import { getImportBatches, rollbackImportBatch } from "../../api/finance.api";
import { PageHeader } from "../../components/PageHeader";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type { ImportBatch } from "../../types/finance.types";
import { formatMoney } from "../../utils/formatMoney";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

function statusTag(status: string) {
  if (status === "active") return <Tag color="green">当前生效</Tag>;
  if (status === "superseded") return <Tag color="blue">已被新批次替换</Tag>;
  if (status === "reverted") return <Tag color="red">已回滚</Tag>;
  return <Tag>{status}</Tag>;
}

function money(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥");
}

export default function Settings() {
  const { selectedMonth } = useSelectedMonth();
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [rollingBackId, setRollingBackId] = useState<number | null>(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getImportBatches(selectedMonth);
      setBatches(res.data.rows ?? []);
    } catch {
      message.error("导入批次加载失败，请确认后端服务可用");
    } finally {
      setLoading(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const rollback = async (id: number) => {
    setRollingBackId(id);
    try {
      await rollbackImportBatch(id);
      message.success("批次已回滚，当前月份汇总已重新计算");
      await loadBatches();
    } catch {
      message.error("批次回滚失败，请检查该批次是否已经回滚或不存在");
    } finally {
      setRollingBackId(null);
    }
  };

  const columns: ColumnsType<ImportBatch> = [
    { title: "批次号", dataIndex: "batchNo", width: 190 },
    { title: "月份", dataIndex: "month", width: 92 },
    { title: "文件", dataIndex: "fileName", ellipsis: true },
    { title: "工作表", dataIndex: "sheetName", width: 140 },
    { title: "状态", dataIndex: "status", width: 120, render: statusTag },
    { title: "明细行", dataIndex: "importedRows", width: 82, align: "right" },
    { title: "票数", dataIndex: "importedOrders", width: 76, align: "right" },
    { title: "物流/服务", width: 110, render: (_, row) => `${row.logisticsOrders}/${row.serviceOrders}` },
    { title: "总应收", dataIndex: "totalReceivable", width: 130, align: "right", render: money },
    { title: "总应付", dataIndex: "totalPayable", width: 130, align: "right", render: money },
    { title: "毛利", dataIndex: "totalGrossProfit", width: 130, align: "right", render: money },
    { title: "风险票", dataIndex: "riskOrderCount", width: 82, align: "right" },
    {
      title: "操作",
      width: 110,
      fixed: "right",
      render: (_, row) => (
        <Popconfirm
          title="确认回滚该导入批次？"
          description="回滚会删除该批次写入的订单、提成、风险和服务确认记录，并重新计算月度汇总。"
          okText="确认回滚"
          cancelText="取消"
          disabled={row.status !== "active"}
          onConfirm={() => rollback(row.id)}
        >
          <Button danger size="small" disabled={row.status !== "active"} loading={rollingBackId === row.id}>
            回滚
          </Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <>
      <PageHeader
        title="参数规则"
        description="系统严格按照原始表格标注汇率计算：1 为人民币，美金/美元/USD 按 6.85，其余标注数据按表格标注执行。"
      />

      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <Card title="运行地址与数据库">
          <Descriptions column={1}>
            <Descriptions.Item label="前端访问地址">http://localhost:5173/</Descriptions.Item>
            <Descriptions.Item label="后端接口地址">{apiBaseUrl}</Descriptions.Item>
            <Descriptions.Item label="本地后端端口">4000</Descriptions.Item>
            <Descriptions.Item label="本地数据库">prisma/dev.db</Descriptions.Item>
            <Descriptions.Item label="线上后端接口">https://cross-border-finance-server.onrender.com/api</Descriptions.Item>
            <Descriptions.Item label="汇率规则">原表标注汇率；美金/美元/USD/汇率未出 = 6.85</Descriptions.Item>
          </Descriptions>
        </Card>

        <Card
          title={`导入批次记录（${selectedMonth}）`}
          extra={<Button onClick={loadBatches} loading={loading}>刷新</Button>}
        >
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 12 }}
            message="Excel 导入已具备可追溯批次"
            description="每次确认写入都会生成批次号。当前仅允许回滚当前生效批次；回滚后会删除该批次订单和派生记录，并重新计算汇总。"
          />
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            columns={columns}
            dataSource={batches}
            pagination={{ pageSize: 6 }}
            scroll={{ x: 1500 }}
          />
        </Card>
      </Space>
    </>
  );
}
