import {
  CheckOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  UploadOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Upload,
  message
} from "antd";
import type { UploadFile } from "antd/es/upload/interface";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmManualLedgerEntry,
  createManualLedgerEntry,
  getLedgerAttachment,
  getManualLedgerEntries,
  getManualLedgerSummary,
  voidManualLedgerEntry
} from "../../api/manual-ledger.api";
import { MonthSelector } from "../../components/MonthSelector";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../contexts/AuthContext";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type {
  ManualLedgerDirection,
  ManualLedgerEntry,
  ManualLedgerSourceType,
  ManualLedgerStatus,
  ManualLedgerSummary
} from "../../types/manual-ledger.types";
import { formatMoney } from "../../utils/formatMoney";

type EntryFormValues = {
  month: string;
  transactionDate: string;
  sourceType: ManualLedgerSourceType;
  direction: ManualLedgerDirection;
  counterparty: string;
  originalAmount: number;
  currency: string;
  exchangeRate: number;
  businessType?: string;
  orderNo?: string;
  customerOrderNo?: string;
  salespersonName?: string;
  customerServiceName?: string;
  supplierName?: string;
  note?: string;
};

const directionLabels: Record<ManualLedgerDirection, string> = { receivable: "应收", payable: "应付", other: "其他" };
const statusLabels: Record<ManualLedgerStatus, string> = { draft: "待确认", confirmed: "已确认", voided: "已作废" };
const sourceLabels: Record<ManualLedgerSourceType, string> = { manual: "手工录入", image_statement: "图片流水" };

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate.response?.data?.message || candidate.message || fallback;
}

function localDate() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function statusTag(status: ManualLedgerStatus) {
  return <Tag color={status === "confirmed" ? "green" : status === "voided" ? "red" : "gold"}>{statusLabels[status]}</Tag>;
}

export default function RawEntry() {
  const { selectedMonth } = useSelectedMonth();
  const { user } = useAuth();
  const canWrite = Boolean(user?.auth?.permissions?.includes("finance:import"));
  const [form] = Form.useForm<EntryFormValues>();
  const sourceType = Form.useWatch("sourceType", form);
  const [rows, setRows] = useState<ManualLedgerEntry[]>([]);
  const [summary, setSummary] = useState<ManualLedgerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [direction, setDirection] = useState("");
  const [status, setStatus] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [detail, setDetail] = useState<ManualLedgerEntry | null>(null);
  const [voidTarget, setVoidTarget] = useState<ManualLedgerEntry | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [imageUrls, setImageUrls] = useState<Array<{ id: number; name: string; url: string }>>([]);
  const [imagesOpen, setImagesOpen] = useState(false);
  const [imagesLoading, setImagesLoading] = useState(false);

  const filters = useMemo(() => ({
    month: selectedMonth,
    keyword: keyword.trim() || undefined,
    direction: direction || undefined,
    status: status || undefined,
    sourceType: sourceFilter || undefined,
    page,
    pageSize
  }), [direction, keyword, page, pageSize, selectedMonth, sourceFilter, status]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [listResponse, summaryResponse] = await Promise.all([
        getManualLedgerEntries(filters),
        getManualLedgerSummary(selectedMonth)
      ]);
      setRows(listResponse.data.rows);
      setTotal(listResponse.data.total);
      setSummary(summaryResponse.data);
    } catch (error) {
      setLoadError(errorMessage(error, "原始流水加载失败，请检查登录状态和后端服务。"));
    } finally {
      setLoading(false);
    }
  }, [filters, selectedMonth]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [selectedMonth]);

  const openCreate = (nextSource: ManualLedgerSourceType) => {
    form.resetFields();
    form.setFieldsValue({
      month: selectedMonth,
      transactionDate: localDate(),
      sourceType: nextSource,
      direction: "receivable",
      currency: "CNY",
      exchangeRate: 1
    });
    setFileList([]);
    setCreateOpen(true);
  };

  const submitCreate = async (values: EntryFormValues) => {
    const files = fileList.flatMap((file) => file.originFileObj ? [file.originFileObj] : []);
    if (values.sourceType === "image_statement" && files.length === 0) {
      message.error("图片流水至少需要上传 1 张凭证图片");
      return;
    }
    setSaving(true);
    try {
      await createManualLedgerEntry(values as unknown as Record<string, unknown>, files);
      message.success("原始流水已保存为待确认记录");
      setCreateOpen(false);
      setFileList([]);
      setPage(1);
      await load();
    } catch (error) {
      message.error(errorMessage(error, "原始流水保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const confirmEntry = async (entry: ManualLedgerEntry) => {
    try {
      await confirmManualLedgerEntry(entry.id);
      message.success(`${entry.entryNo} 已确认`);
      await load();
    } catch (error) {
      message.error(errorMessage(error, "流水确认失败"));
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) {
      message.error("请填写作废原因");
      return;
    }
    setVoiding(true);
    try {
      await voidManualLedgerEntry(voidTarget.id, voidReason.trim());
      message.success(`${voidTarget.entryNo} 已作废`);
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (error) {
      message.error(errorMessage(error, "流水作废失败"));
    } finally {
      setVoiding(false);
    }
  };

  const closeImages = () => {
    imageUrls.forEach((item) => URL.revokeObjectURL(item.url));
    setImageUrls([]);
    setImagesOpen(false);
  };

  const previewImages = async (entry: ManualLedgerEntry) => {
    setImagesOpen(true);
    setImagesLoading(true);
    try {
      const images = await Promise.all(entry.attachments.map(async (attachment) => {
        const response = await getLedgerAttachment(entry.id, attachment.id);
        return { id: attachment.id, name: attachment.fileName, url: URL.createObjectURL(response.data) };
      }));
      setImageUrls(images);
    } catch (error) {
      message.error(errorMessage(error, "图片凭证加载失败"));
      closeImages();
    } finally {
      setImagesLoading(false);
    }
  };

  const downloadAttachment = async (entry: ManualLedgerEntry, attachmentId: number, fileName: string) => {
    try {
      const response = await getLedgerAttachment(entry.id, attachmentId, true);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(errorMessage(error, "图片下载失败"));
    }
  };

  const columns: ColumnsType<ManualLedgerEntry> = [
    { title: "流水编号", dataIndex: "entryNo", fixed: "left", width: 170 },
    { title: "日期", dataIndex: "transactionDate", width: 110, render: (value) => String(value).slice(0, 10) },
    { title: "来源", dataIndex: "sourceType", width: 110, render: (value: ManualLedgerSourceType) => <Tag color={value === "image_statement" ? "blue" : "default"}>{sourceLabels[value]}</Tag> },
    { title: "收付类型", dataIndex: "direction", width: 100, render: (value: ManualLedgerDirection) => directionLabels[value] },
    { title: "交易对方", dataIndex: "counterparty", width: 170, ellipsis: true },
    { title: "原币金额", dataIndex: "originalAmount", width: 120, align: "right", render: (value, row) => `${row.currency} ${Number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}` },
    { title: "汇率", dataIndex: "exchangeRate", width: 90, align: "right" },
    { title: "本币金额", dataIndex: "localAmount", width: 130, align: "right", render: formatMoney },
    { title: "业务类型", dataIndex: "businessType", width: 130, render: (value) => value || "-" },
    { title: "系统订单号", dataIndex: "orderNo", width: 150, render: (value) => value || "-" },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 150, render: (value) => value || "-" },
    { title: "销售代表", dataIndex: "salespersonName", width: 100, render: (value) => value || "-" },
    { title: "客服代表", dataIndex: "customerServiceName", width: 100, render: (value) => value || "-" },
    { title: "凭证", width: 90, align: "center", render: (_, row) => row.attachments.length ? <Button type="link" icon={<FileImageOutlined />} onClick={() => void previewImages(row)}>{row.attachments.length}</Button> : "-" },
    { title: "状态", dataIndex: "status", width: 100, render: statusTag },
    { title: "录入人", dataIndex: "createdBy", width: 100 },
    {
      title: "操作",
      fixed: "right",
      width: 210,
      render: (_, row) => (
        <Space size={4} wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(row)}>详情</Button>
          <Popconfirm title="确认后该流水将进入正式原始记录，是否继续？" okText="确认" cancelText="取消" disabled={!canWrite || row.status !== "draft"} onConfirm={() => void confirmEntry(row)}>
            <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!canWrite || row.status !== "draft"}>确认</Button>
          </Popconfirm>
          <Button size="small" danger icon={<StopOutlined />} disabled={!canWrite || row.status === "voided"} onClick={() => { setVoidTarget(row); setVoidReason(""); }}>作废</Button>
        </Space>
      )
    }
  ];

  return (
    <div className="raw-entry-page">
      <PageHeader
        title="原始数据录入"
        description="补录独立原始流水和图片凭证；不会改写已导入的 Excel 原始台账。"
        extra={(
          <Space wrap>
            <Button icon={<PlusOutlined />} disabled={!canWrite} onClick={() => openCreate("manual")}>新增流水</Button>
            <Button type="primary" icon={<UploadOutlined />} disabled={!canWrite} onClick={() => openCreate("image_statement")}>上传图片流水</Button>
          </Space>
        )}
      />

      {!canWrite ? <Alert type="info" showIcon message="当前账号只有查看权限；管理员、财务或主管可新增、确认和作废原始流水。" /> : null}
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : null}

      <section className="raw-entry-summary" aria-label="原始流水汇总">
        <div><Statistic title="有效流水" value={summary?.totalRecords ?? 0} suffix="笔" /></div>
        <div><Statistic title="应收流水" value={summary?.receivable ?? 0} formatter={(value) => formatMoney(Number(value))} /></div>
        <div><Statistic title="应付流水" value={summary?.payable ?? 0} formatter={(value) => formatMoney(Number(value))} /></div>
        <div><Statistic title="图片凭证" value={summary?.attachmentCount ?? 0} suffix="张" /></div>
        <div><Statistic title="待确认" value={summary?.draftRecords ?? 0} suffix="笔" /></div>
      </section>

      <section className="raw-entry-workbench">
        <div className="raw-entry-filter-band">
          <MonthSelector />
          <Input allowClear prefix={<SearchOutlined />} placeholder="流水号、交易对方、订单号、人员" value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => { setPage(1); void load(); }} />
          <Select allowClear placeholder="收付类型" value={direction || undefined} onChange={(value) => { setDirection(value || ""); setPage(1); }} options={Object.entries(directionLabels).map(([value, label]) => ({ value, label }))} />
          <Select allowClear placeholder="数据来源" value={sourceFilter || undefined} onChange={(value) => { setSourceFilter(value || ""); setPage(1); }} options={Object.entries(sourceLabels).map(([value, label]) => ({ value, label }))} />
          <Select allowClear placeholder="状态" value={status || undefined} onChange={(value) => { setStatus(value || ""); setPage(1); }} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
          <Space>
            <Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); void load(); }}>查询</Button>
            <Button icon={<ReloadOutlined />} onClick={() => { setKeyword(""); setDirection(""); setSourceFilter(""); setStatus(""); setPage(1); }}>重置</Button>
          </Space>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: 2050 }}
          locale={{ emptyText: "当前账期没有手工原始流水" }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (value) => `共 ${value} 笔`, onChange: (nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); } }}
        />
      </section>

      <Modal title={sourceType === "image_statement" ? "上传图片流水" : "新增原始流水"} open={createOpen} width={860} onCancel={() => !saving && setCreateOpen(false)} footer={null} destroyOnClose>
        <Form form={form} layout="vertical" onFinish={(values) => void submitCreate(values)} className="raw-entry-form">
          <Form.Item name="sourceType" hidden><Input /></Form.Item>
          <div className="raw-entry-form-grid">
            <Form.Item label="账期" name="month" rules={[{ required: true, message: "请选择账期" }]}><Input type="month" /></Form.Item>
            <Form.Item label="流水日期" name="transactionDate" rules={[{ required: true, message: "请选择流水日期" }]}><Input type="date" /></Form.Item>
            <Form.Item label="收付类型" name="direction" rules={[{ required: true, message: "请选择收付类型" }]}><Select options={Object.entries(directionLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
            <Form.Item label="交易对方" name="counterparty" rules={[{ required: true, message: "请输入交易对方" }]}><Input maxLength={120} /></Form.Item>
            <Form.Item label="原币金额（保留正负号）" name="originalAmount" rules={[{ required: true, message: "请输入金额" }]}><InputNumber precision={2} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="币种" name="currency" rules={[{ required: true }]}><Select options={["CNY", "USD", "EUR", "RUB", "GBP"].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item label="汇率" name="exchangeRate" rules={[{ required: true, message: "请输入汇率" }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="业务类型" name="businessType"><Input maxLength={80} /></Form.Item>
            <Form.Item label="系统订单号" name="orderNo"><Input maxLength={80} /></Form.Item>
            <Form.Item label="原始订单号" name="customerOrderNo"><Input maxLength={80} /></Form.Item>
            <Form.Item label="销售代表" name="salespersonName"><Input maxLength={60} /></Form.Item>
            <Form.Item label="客服代表" name="customerServiceName"><Input maxLength={60} /></Form.Item>
            <Form.Item label="供应商" name="supplierName"><Input maxLength={120} /></Form.Item>
          </div>
          {sourceType === "image_statement" ? (
            <Form.Item label="流水图片（最多 6 张，单张不超过 10MB）" required>
              <Upload.Dragger accept=".jpg,.jpeg,.png,.webp" multiple maxCount={6} beforeUpload={() => false} fileList={fileList} onChange={({ fileList: next }) => setFileList(next.slice(-6))}>
                <p className="ant-upload-drag-icon"><FileImageOutlined /></p>
                <p>点击或拖拽上传银行流水、付款截图或收款凭证</p>
              </Upload.Dragger>
            </Form.Item>
          ) : null}
          <Form.Item label="备注" name="note"><Input.TextArea rows={3} maxLength={500} showCount /></Form.Item>
          <div className="raw-entry-modal-actions"><Button onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button><Button type="primary" htmlType="submit" loading={saving}>保存为待确认</Button></div>
        </Form>
      </Modal>

      <Modal title="原始流水详情" open={Boolean(detail)} width={820} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>}>
        {detail ? (
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2 }}>
            <Descriptions.Item label="流水编号">{detail.entryNo}</Descriptions.Item><Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item>
            <Descriptions.Item label="账期">{detail.month}</Descriptions.Item><Descriptions.Item label="流水日期">{detail.transactionDate.slice(0, 10)}</Descriptions.Item>
            <Descriptions.Item label="来源">{sourceLabels[detail.sourceType]}</Descriptions.Item><Descriptions.Item label="收付类型">{directionLabels[detail.direction]}</Descriptions.Item>
            <Descriptions.Item label="交易对方">{detail.counterparty}</Descriptions.Item><Descriptions.Item label="本币金额">{formatMoney(detail.localAmount)}</Descriptions.Item>
            <Descriptions.Item label="原币金额">{detail.currency} {detail.originalAmount.toFixed(2)}</Descriptions.Item><Descriptions.Item label="汇率">{detail.exchangeRate}</Descriptions.Item>
            <Descriptions.Item label="系统订单号">{detail.orderNo || "-"}</Descriptions.Item><Descriptions.Item label="原始订单号">{detail.customerOrderNo || "-"}</Descriptions.Item>
            <Descriptions.Item label="销售代表">{detail.salespersonName || "-"}</Descriptions.Item><Descriptions.Item label="客服代表">{detail.customerServiceName || "-"}</Descriptions.Item>
            <Descriptions.Item label="供应商">{detail.supplierName || "-"}</Descriptions.Item><Descriptions.Item label="录入人">{detail.createdBy}</Descriptions.Item>
            <Descriptions.Item label="备注" span={2}>{detail.note || "-"}</Descriptions.Item>
            {detail.voidReason ? <Descriptions.Item label="作废原因" span={2}>{detail.voidReason}</Descriptions.Item> : null}
            <Descriptions.Item label="图片凭证" span={2}>{detail.attachments.length ? <Space wrap>{detail.attachments.map((attachment) => <Button key={attachment.id} size="small" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(detail, attachment.id, attachment.fileName)}>{attachment.fileName}</Button>)}</Space> : "-"}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>

      <Modal title="作废原始流水" open={Boolean(voidTarget)} confirmLoading={voiding} okText="确认作废" okButtonProps={{ danger: true }} cancelText="取消" onOk={() => void submitVoid()} onCancel={() => !voiding && setVoidTarget(null)}>
        <Alert type="warning" showIcon message={voidTarget ? `将作废 ${voidTarget.entryNo}` : ""} style={{ marginBottom: 16 }} />
        <Input.TextArea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="必填：说明作废原因" rows={4} maxLength={300} showCount />
      </Modal>

      <Modal title="图片流水凭证" open={imagesOpen} width={900} onCancel={closeImages} footer={<Button onClick={closeImages}>关闭</Button>}>
        {imagesLoading ? <div className="raw-entry-image-loading">正在读取凭证...</div> : <div className="raw-entry-image-grid">{imageUrls.map((image) => <figure key={image.id}><img src={image.url} alt={image.name} /><figcaption>{image.name}</figcaption></figure>)}</div>}
      </Modal>
    </div>
  );
}
