import { UploadOutlined } from "@ant-design/icons";
import { Alert, Button, Descriptions, Modal, Space, Table, Tag, Typography, Upload, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { UploadProps } from "antd";
import { useState } from "react";
import { importFinanceExcel, previewFinanceExcel } from "../api/finance.api";
import type { ImportPreviewResult, ImportResult } from "../types/finance.types";
import { formatMoney } from "../utils/formatMoney";
import { formatPercent } from "../utils/formatPercent";

type Props = {
  onImported?: (result: ImportResult) => void;
};

function money(value?: number | null) {
  return formatMoney(value).replace("CN¥", "¥");
}

const columns: ColumnsType<ImportPreviewResult["sampleOrders"][number]> = [
  { title: "单号", dataIndex: "orderNo" },
  { title: "原始订单号", dataIndex: "customerOrderNo", render: (value) => value || "-" },
  { title: "业务类型", dataIndex: "businessType" },
  { title: "销售代表", dataIndex: "salespersonName" },
  { title: "客服代表", dataIndex: "customerServiceName", render: (value) => value || "-" },
  { title: "应收", dataIndex: "receivable", align: "right", render: money },
  { title: "应付", dataIndex: "payable", align: "right", render: money },
  { title: "毛利", dataIndex: "grossProfit", align: "right", render: money },
  { title: "毛利率", dataIndex: "grossProfitRate", align: "right", render: formatPercent },
  {
    title: "状态",
    dataIndex: "needSupervisorConfirm",
    render: (value: boolean) => <Tag color={value ? "gold" : "green"}>{value ? "需复核" : "可入库"}</Tag>
  }
];

const fieldLabels: Record<string, string> = {
  orderNo: "系统单号",
  customerOrderNo: "原始订单号",
  customerName: "客户",
  service: "业务类型",
  supplier: "供应商",
  direction: "收付类型",
  feeType: "费用类型",
  amount: "原始金额",
  localAmount: "本币金额",
  salespersonName: "销售代表",
  remark: "备注",
  exchangeRate: "汇率",
  customerServiceName: "客服代表",
  orderDate: "下单时间",
  internalRemark: "内部备注",
  actualWeight: "实重",
  pieces: "件数",
  mainProductName: "主品名"
};

const mappingColumns: ColumnsType<{ field: string; sourceHeader: string }> = [
  {
    title: "系统字段",
    dataIndex: "field",
    width: 180,
    render: (value: string) => (
      <Space direction="vertical" size={0}>
        <b>{fieldLabels[value] ?? value}</b>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>{value}</Typography.Text>
      </Space>
    )
  },
  { title: "Excel 原始表头", dataIndex: "sourceHeader" },
  {
    title: "核对状态",
    width: 120,
    render: () => <Tag color="green">已识别</Tag>
  }
];

const qualityColumns: ColumnsType<NonNullable<ImportPreviewResult["qualityReport"]>["issues"][number]> = [
  {
    title: "级别",
    dataIndex: "level",
    width: 90,
    render: (value: string) => {
      if (value === "error") return <Tag color="red">阻断</Tag>;
      if (value === "warning") return <Tag color="gold">需复核</Tag>;
      return <Tag color="blue">提示</Tag>;
    }
  },
  { title: "校验项", dataIndex: "title", width: 170 },
  { title: "数量", dataIndex: "count", width: 80, align: "right" },
  {
    title: "涉及订单",
    dataIndex: "orderNos",
    width: 260,
    render: (values: string[]) => values?.length ? values.join("、") : "-"
  },
  { title: "处理建议", dataIndex: "message" }
];

function tags(values?: string[]) {
  if (!values?.length) return <Typography.Text type="secondary">无</Typography.Text>;
  return (
    <Space wrap size={[4, 4]}>
      {values.map((item) => <Tag key={item}>{item}</Tag>)}
    </Space>
  );
}

export function ImportButton({ onImported }: Props) {
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  const props: UploadProps = {
    accept: ".xlsx,.xls",
    maxCount: 1,
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      const uploadFile = file as File;
      setLoading(true);
      try {
        const response = await previewFinanceExcel(uploadFile);
        const result = response.data as ImportPreviewResult;
        if (result.audit?.missingRequiredFields?.length) {
          message.error(`缺少必填字段：${result.audit.missingRequiredFields.join("、")}`);
        }
        setPendingFile(uploadFile);
        setPreview(result);
        setPreviewOpen(true);
        message.success(`预检完成：识别 ${result.importedOrders} 票，${result.importedRows} 行明细`);
        onSuccess?.(result);
      } catch (error) {
        message.error("Excel 预检失败，请检查文件格式、表头和必填字段");
        onError?.(error as Error);
      } finally {
        setLoading(false);
      }
    }
  };

  const confirmImport = async () => {
    if (!pendingFile || !preview) return;
    if (preview.audit?.missingRequiredFields?.length) {
      message.error("字段映射存在缺失，不能写入数据库。请调整 Excel 表头后重新上传。");
      return;
    }
    setImporting(true);
    try {
      const response = await importFinanceExcel(pendingFile);
      const result = response.data as ImportResult;
      const mapped = result.audit?.fieldMapping.length ?? 0;
      message.success(`导入完成：${result.importedOrders} 票，自动映射 ${mapped} 个字段，批次 ${result.batchNo ?? "-"}`);
      setPreviewOpen(false);
      setPendingFile(null);
      setPreview(null);
      onImported?.(result);
    } catch {
      message.error("确认导入失败，请检查后端数据库连接和 Excel 数据");
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Upload {...props}>
        <Button type="primary" icon={<UploadOutlined />} loading={loading}>上传 Excel 导入</Button>
      </Upload>

      <Modal
        open={previewOpen}
        title="Excel 导入预检"
        okText="确认写入数据库"
        cancelText="取消"
        width={1040}
        confirmLoading={importing}
        onOk={confirmImport}
        onCancel={() => setPreviewOpen(false)}
      >
        {preview && (
          <Space direction="vertical" size={14} style={{ width: "100%" }}>
            <Alert
              type="warning"
              showIcon
              message="原始 Excel 明细将保留入库"
              description="确认后会保存每一行原始台账用于追溯，同时按月份重建订单、应收应付、毛利、风险和提成派生数据。请先核对月份、票数、物流/注册拆分和风险数量。"
            />
            <Descriptions size="small" bordered column={4}>
              <Descriptions.Item label="文件">{preview.fileName}</Descriptions.Item>
              <Descriptions.Item label="工作表">{preview.sheetName}</Descriptions.Item>
              <Descriptions.Item label="月份">{preview.month}</Descriptions.Item>
              <Descriptions.Item label="明细行">{preview.importedRows}</Descriptions.Item>
              <Descriptions.Item label="总票数">{preview.importedOrders}</Descriptions.Item>
              <Descriptions.Item label="物流票">{preview.logisticsOrders}</Descriptions.Item>
              <Descriptions.Item label="注册/服务票">{preview.serviceOrders}</Descriptions.Item>
              <Descriptions.Item label="需复核票">{preview.pendingSupervisorConfirmCount}</Descriptions.Item>
              <Descriptions.Item label="总应收">{money(preview.totalReceivable)}</Descriptions.Item>
              <Descriptions.Item label="总应付">{money(preview.totalPayable)}</Descriptions.Item>
              <Descriptions.Item label="调整后毛利">{money(preview.totalGrossProfit)}</Descriptions.Item>
              <Descriptions.Item label="毛利率">{formatPercent(preview.grossProfitRate)}</Descriptions.Item>
            </Descriptions>
            <Alert
              type={(preview.qualityReport?.blockingCount ?? 0) > 0 ? "error" : (preview.qualityReport?.warningCount ?? 0) > 0 ? "warning" : "success"}
              showIcon
              message={`导入质量校验：阻断 ${preview.qualityReport?.blockingCount ?? 0} 项，需复核 ${preview.qualityReport?.warningCount ?? 0} 项，提示 ${preview.qualityReport?.infoCount ?? 0} 项`}
              description={(preview.qualityReport?.blockingCount ?? 0) > 0
                ? "存在会影响营收或毛利准确性的硬错误，当前不允许写入数据库。"
                : "未发现阻断项；警告项写库后会进入风险复查或主管确认流程。"}
            />
            <Table
              rowKey="key"
              size="small"
              title={() => "导入质量校验明细"}
              pagination={false}
              columns={qualityColumns}
              dataSource={preview.qualityReport?.issues ?? []}
              locale={{ emptyText: "未发现导入质量问题" }}
            />
            <Alert
              type={preview.audit?.missingRequiredFields.length ? "error" : "success"}
              showIcon
              message={`自动映射字段 ${preview.audit?.fieldMapping.length ?? 0} 个`}
              description={preview.audit?.template.matchExact ? "表头与后台模板完全一致。" : "表头可解析，但与后台模板不完全一致，建议核对多余或缺失表头。"}
            />
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label="必填字段缺失">
                {preview.audit?.missingRequiredFields.length
                  ? <Tag color="red">{preview.audit.missingRequiredFields.join("、")}</Tag>
                  : <Tag color="green">无缺失，可写入数据库</Tag>}
              </Descriptions.Item>
              <Descriptions.Item label="模板缺少表头">
                {tags(preview.audit?.template.missingTemplateHeaders)}
              </Descriptions.Item>
              <Descriptions.Item label="Excel 额外表头">
                {tags(preview.audit?.template.extraHeaders)}
              </Descriptions.Item>
            </Descriptions>
            <Table
              rowKey="field"
              size="small"
              title={() => "字段映射确认：请核对系统字段是否对应正确的 Excel 原始表头"}
              pagination={false}
              columns={mappingColumns}
              dataSource={preview.audit?.fieldMapping ?? []}
              scroll={{ y: 260 }}
            />
            <Table
              rowKey="orderNo"
              size="small"
              pagination={false}
              columns={columns}
              dataSource={preview.sampleOrders}
            />
          </Space>
        )}
      </Modal>
    </>
  );
}
