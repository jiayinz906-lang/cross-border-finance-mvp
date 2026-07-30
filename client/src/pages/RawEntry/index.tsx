import {
  CheckOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileImageOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Descriptions,
  Divider,
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
import type { ColumnsType } from "antd/es/table";
import type { UploadFile } from "antd/es/upload/interface";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  confirmManualDocument,
  createManualDocument,
  getLedgerAttachment,
  getManualDocuments,
  getManualLedgerSummary,
  voidManualDocument
} from "../../api/manual-ledger.api";
import { MonthSelector } from "../../components/MonthSelector";
import { PageHeader } from "../../components/PageHeader";
import { useAuth } from "../../contexts/AuthContext";
import { useSelectedMonth } from "../../contexts/MonthContext";
import type {
  ManualDocumentInput,
  ManualLedgerDirection,
  ManualLedgerDocument,
  ManualLedgerEntry,
  ManualLedgerStatus,
  ManualLedgerSummary
} from "../../types/manual-ledger.types";
import { formatMoney } from "../../utils/formatMoney";

const directionLabels: Record<ManualLedgerDirection, string> = { receivable: "应收", payable: "应付", other: "其他" };
const statusLabels: Record<ManualLedgerStatus, string> = { draft: "草稿", confirmed: "已入账", voided: "已作废" };
const feeTypes = ["运费", "派送费", "清关费", "操作费", "报关费", "赔付", "保险费", "改单费", "公司注册费用", "EAC证书注册费用", "店铺租赁", "其他费用"];
const businessTypes = ["汽运灰关", "铁路白关整柜", "汽运白关并车", "空运白关", "物流灰关", "公司注册", "EAC证书注册", "商标注册", "店铺租赁"];

function errorMessage(error: unknown, fallback: string) {
  const candidate = error as { response?: { data?: { message?: string } }; message?: string };
  return candidate.response?.data?.message || candidate.message || fallback;
}

function localDate() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function statusTag(status: ManualLedgerStatus) {
  return <Tag color={status === "confirmed" ? "green" : status === "voided" ? "red" : "gold"}>{statusLabels[status]}</Tag>;
}

const lineDefaults = { direction: "receivable" as const, feeType: "运费", originalAmount: 0, currency: "CNY", exchangeRate: 1 };

export default function RawEntry() {
  const { selectedMonth } = useSelectedMonth();
  const { user } = useAuth();
  const canWrite = Boolean(user?.auth?.permissions?.includes("finance:import"));
  const [form] = Form.useForm<ManualDocumentInput>();
  const [rows, setRows] = useState<ManualLedgerDocument[]>([]);
  const [summary, setSummary] = useState<ManualLedgerSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [detail, setDetail] = useState<ManualLedgerDocument | null>(null);
  const [voidTarget, setVoidTarget] = useState<ManualLedgerDocument | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

  const filters = useMemo(() => ({ month: selectedMonth, keyword: keyword.trim() || undefined, status: status || undefined, page, pageSize }), [keyword, page, pageSize, selectedMonth, status]);
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [listResponse, summaryResponse] = await Promise.all([getManualDocuments(filters), getManualLedgerSummary(selectedMonth)]);
      setRows(listResponse.data.rows);
      setTotal(listResponse.data.total);
      setSummary(summaryResponse.data);
    } catch (error) {
      setLoadError(errorMessage(error, "业务单据加载失败，请检查登录状态和后端服务。"));
    } finally {
      setLoading(false);
    }
  }, [filters, selectedMonth]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage(1); }, [selectedMonth]);

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({ month: selectedMonth, transactionDate: localDate(), lines: [{ ...lineDefaults }] } as ManualDocumentInput);
    setFileList([]);
    setCreateOpen(true);
  };

  const submitCreate = async (values: ManualDocumentInput) => {
    const files = fileList.flatMap((file) => file.originFileObj ? [file.originFileObj] : []);
    setSaving(true);
    try {
      await createManualDocument(values, files);
      message.success("业务单已保存为草稿，请核对后确认入账");
      setCreateOpen(false);
      setFileList([]);
      setPage(1);
      await load();
    } catch (error) {
      message.error(errorMessage(error, "业务单保存失败"));
    } finally {
      setSaving(false);
    }
  };

  const postDocument = async (row: ManualLedgerDocument) => {
    setSaving(true);
    try {
      await confirmManualDocument(row.documentNo);
      message.success(`${row.documentNo} 已确认入账，经营总览及各财务页面已重算`);
      await load();
    } catch (error) {
      message.error(errorMessage(error, "确认入账失败"));
    } finally {
      setSaving(false);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return message.error("请填写作废原因");
    setVoiding(true);
    try {
      await voidManualDocument(voidTarget.documentNo, voidReason.trim());
      message.success(`${voidTarget.documentNo} 已作废，月度财务数据已重新计算`);
      setVoidTarget(null);
      setVoidReason("");
      await load();
    } catch (error) {
      message.error(errorMessage(error, "业务单作废失败"));
    } finally {
      setVoiding(false);
    }
  };

  const downloadAttachment = async (entryId: number, attachmentId: number, fileName: string) => {
    try {
      const response = await getLedgerAttachment(entryId, attachmentId, true);
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(errorMessage(error, "凭证下载失败"));
    }
  };

  const columns: ColumnsType<ManualLedgerDocument> = [
    { title: "业务单号", dataIndex: "documentNo", fixed: "left", width: 190 },
    { title: "日期", dataIndex: "transactionDate", width: 110, render: (value) => String(value).slice(0, 10) },
    { title: "系统单号", dataIndex: "orderNo", width: 150 },
    { title: "原始订单号", dataIndex: "customerOrderNo", width: 140, render: (value) => value || "-" },
    { title: "用户", dataIndex: "customerName", width: 140, ellipsis: true },
    { title: "业务类型", dataIndex: "businessType", width: 140 },
    { title: "费用行", dataIndex: "lines", width: 80, align: "center", render: (lines: ManualLedgerEntry[]) => `${lines.length} 行` },
    { title: "应收", dataIndex: "receivable", width: 125, align: "right", render: formatMoney },
    { title: "应付", dataIndex: "payable", width: 125, align: "right", render: formatMoney },
    { title: "毛利", width: 125, align: "right", render: (_, row) => formatMoney(row.receivable - row.payable) },
    { title: "销售代表", dataIndex: "salespersonName", width: 100 },
    { title: "客服代表", dataIndex: "customerServiceName", width: 100 },
    { title: "凭证", width: 80, align: "center", render: (_, row) => row.attachments.length ? <Tag icon={<FileImageOutlined />} color="blue">{row.attachments.length}</Tag> : "-" },
    { title: "状态", dataIndex: "status", width: 90, render: statusTag },
    {
      title: "操作", fixed: "right", width: 230,
      render: (_, row) => <Space size={4} wrap>
        <Button size="small" icon={<EyeOutlined />} onClick={() => setDetail(row)}>查看</Button>
        <Popconfirm
          title="确认入账并刷新本月全部财务数据？"
          description="系统将以本月所有已确认手工业务单重建应收、应付、毛利、风险和提成。"
          okText="确认入账"
          cancelText="取消"
          disabled={!canWrite || row.status !== "draft"}
          onConfirm={() => void postDocument(row)}
        >
          <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!canWrite || row.status !== "draft"}>入账</Button>
        </Popconfirm>
        <Button size="small" danger icon={<StopOutlined />} disabled={!canWrite || row.status === "voided"} onClick={() => { setVoidTarget(row); setVoidReason(""); }}>作废</Button>
      </Space>
    }
  ];

  const detailLineColumns: ColumnsType<ManualLedgerEntry> = [
    { title: "收付", dataIndex: "direction", width: 70, render: (value) => directionLabels[value as ManualLedgerDirection] },
    { title: "费用类型", dataIndex: "feeType", width: 130 },
    { title: "供应商", dataIndex: "supplierName", width: 140, render: (value) => value || "-" },
    { title: "供应商服务", dataIndex: "supplierService", width: 120, render: (value) => value || "-" },
    { title: "原币金额", width: 120, align: "right", render: (_, row) => `${row.currency} ${Number(row.originalAmount).toFixed(2)}` },
    { title: "汇率", dataIndex: "exchangeRate", width: 80, align: "right" },
    { title: "本币费用", dataIndex: "localAmount", width: 120, align: "right", render: formatMoney },
    { title: "备注", dataIndex: "note", width: 160, render: (value) => value || "-" }
  ];

  return (
    <div className="raw-entry-page">
      <PageHeader
        title="业务数据录入"
        description="以 ERP 业务单替代 Excel 导入：先录订单头，再录应收/应付费用行，保存草稿后确认入账。"
        extra={<Button type="primary" icon={<PlusOutlined />} disabled={!canWrite} onClick={openCreate}>新增业务单</Button>}
      />

      <Alert
        type="info"
        showIcon
        message="手工业务单是系统主数据入口"
        description="确认入账后，系统将严格按录入金额、汇率和正负号生成原始台账，并自动重建经营总览、利润、提成、风险及应收应付；草稿不会影响财务报表。"
      />
      {!canWrite ? <Alert type="warning" showIcon message="当前账号只有查看权限；财务、主管或系统管理员可新增和确认业务单。" /> : null}
      {loadError ? <Alert type="error" showIcon message={loadError} action={<Button size="small" onClick={() => void load()}>重试</Button>} /> : null}

      <section className="raw-entry-summary" aria-label="业务单汇总">
        <div><Statistic title="业务单" value={summary?.totalRecords ?? 0} suffix="单" /></div>
        <div><Statistic title="费用明细" value={summary?.totalLines ?? 0} suffix="行" /></div>
        <div><Statistic title="应收" value={summary?.receivable ?? 0} formatter={(value) => formatMoney(Number(value))} /></div>
        <div><Statistic title="应付" value={summary?.payable ?? 0} formatter={(value) => formatMoney(Number(value))} /></div>
        <div><Statistic title="凭证" value={summary?.attachmentCount ?? 0} suffix="张" /></div>
        <div><Statistic title="待入账" value={summary?.draftRecords ?? 0} suffix="单" /></div>
      </section>

      <section className="raw-entry-workbench">
        <div className="raw-entry-filter-band">
          <MonthSelector />
          <Input allowClear prefix={<SearchOutlined />} placeholder="业务单号、订单号、用户、人员" value={keyword} onChange={(event) => setKeyword(event.target.value)} onPressEnter={() => { setPage(1); void load(); }} />
          <Select allowClear placeholder="单据状态" value={status || undefined} onChange={(value) => { setStatus(value || ""); setPage(1); }} options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))} />
          <Space><Button type="primary" icon={<SearchOutlined />} onClick={() => { setPage(1); void load(); }}>查询</Button><Button icon={<ReloadOutlined />} onClick={() => { setKeyword(""); setStatus(""); setPage(1); }}>重置</Button></Space>
        </div>
        <Table rowKey="documentNo" columns={columns} dataSource={rows} loading={loading} scroll={{ x: 1900 }} locale={{ emptyText: "当前账期还没有手工业务单" }} pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (value) => `共 ${value} 单`, onChange: (nextPage, nextPageSize) => { setPage(nextPageSize !== pageSize ? 1 : nextPage); setPageSize(nextPageSize); } }} />
      </section>

      <Modal title="新增业务单" open={createOpen} width={1240} onCancel={() => !saving && setCreateOpen(false)} footer={null} destroyOnClose className="erp-entry-modal">
        <Form form={form} layout="vertical" onFinish={(values) => void submitCreate(values)}>
          <div className="erp-form-section"><h3>一、订单基本信息</h3><div className="erp-header-grid">
            <Form.Item label="账期" name="month" rules={[{ required: true }]}><Input type="month" /></Form.Item>
            <Form.Item label="下单时间" name="transactionDate" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item label="系统单号" name="orderNo" rules={[{ required: true, message: "请输入系统单号" }]}><Input /></Form.Item>
            <Form.Item label="原始订单号" name="customerOrderNo"><Input /></Form.Item>
            <Form.Item label="用户" name="customerName" rules={[{ required: true, message: "请输入用户" }]}><Input /></Form.Item>
            <Form.Item label="服务/业务类型" name="businessType" rules={[{ required: true }]}><Select showSearch options={businessTypes.map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item label="销售代表" name="salespersonName" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="客服代表" name="customerServiceName" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item label="收费重(KG)" name="chargeWeight"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="供应商收费重(KG)" name="supplierChargeWeight"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="实重" name="actualWeight"><InputNumber min={0} precision={2} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="件数" name="pieces"><InputNumber min={0} precision={0} style={{ width: "100%" }} /></Form.Item>
            <Form.Item label="主品名" name="mainProductName"><Input /></Form.Item>
            <Form.Item label="内部备注" name="internalRemark" className="erp-grid-wide"><Input /></Form.Item>
          </div></div>

          <div className="erp-form-section"><div className="erp-section-title"><h3>二、费用明细</h3><span>一张业务单可同时录入多条应收和应付</span></div>
            <Form.List name="lines">
              {(fields, { add, remove }) => <>
                <div className="erp-fee-table">
                  <div className="erp-fee-head"><span>收付</span><span>费用类型</span><span>供应商</span><span>供应商服务</span><span>原币金额</span><span>单价</span><span>币种</span><span>汇率</span><span>本币费用</span><span>折合人民币</span><span>备注</span><span /></div>
                  {fields.map((field) => <div className="erp-fee-row" key={field.key}>
                    <Form.Item name={[field.name, "direction"]} rules={[{ required: true }]}><Select options={Object.entries(directionLabels).map(([value, label]) => ({ value, label }))} /></Form.Item>
                    <Form.Item name={[field.name, "feeType"]} rules={[{ required: true }]}><Select showSearch options={feeTypes.map((value) => ({ value, label: value }))} /></Form.Item>
                    <Form.Item name={[field.name, "supplierName"]}><Input /></Form.Item>
                    <Form.Item name={[field.name, "supplierService"]}><Input /></Form.Item>
                    <Form.Item name={[field.name, "originalAmount"]} rules={[{ required: true }]}><InputNumber precision={2} style={{ width: "100%" }} /></Form.Item>
                    <Form.Item name={[field.name, "unitPrice"]}><InputNumber precision={2} style={{ width: "100%" }} /></Form.Item>
                    <Form.Item name={[field.name, "currency"]} rules={[{ required: true }]}><Select options={["CNY", "USD", "EUR", "RUB", "GBP"].map((value) => ({ value, label: value }))} /></Form.Item>
                    <Form.Item name={[field.name, "exchangeRate"]} rules={[{ required: true }]}><InputNumber min={0.000001} precision={6} style={{ width: "100%" }} /></Form.Item>
                    <Form.Item name={[field.name, "localAmount"]}><InputNumber precision={2} style={{ width: "100%" }} placeholder="自动" /></Form.Item>
                    <Form.Item name={[field.name, "convertedAmount"]}><InputNumber precision={2} style={{ width: "100%" }} /></Form.Item>
                    <Form.Item name={[field.name, "note"]}><Input /></Form.Item>
                    <Button danger type="text" icon={<DeleteOutlined />} disabled={fields.length === 1} onClick={() => remove(field.name)} />
                  </div>)}
                </div>
                <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ ...lineDefaults })}>新增费用行</Button>
              </>}
            </Form.List>
          </div>

          <div className="erp-form-section"><h3>三、凭证与备注</h3>
            <Upload.Dragger accept=".jpg,.jpeg,.png,.webp" multiple maxCount={12} listType="picture" beforeUpload={(file) => {
              if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) { message.error(`${file.name} 不是支持的图片格式`); return Upload.LIST_IGNORE; }
              if (file.size > 10 * 1024 * 1024) { message.error(`${file.name} 超过 10MB`); return Upload.LIST_IGNORE; }
              return false;
            }} fileList={fileList} onChange={({ fileList: next }) => setFileList(next.slice(-12))}>
              <p className="ant-upload-drag-icon"><FileImageOutlined /></p><p className="ant-upload-text">上传合同、账单、付款截图或其他业务凭证</p><p className="ant-upload-hint">最多 12 张，支持 JPG、PNG、WebP，单张不超过 10MB</p>
            </Upload.Dragger>
            <Form.Item label="整单备注" name="note" style={{ marginTop: 16 }}><Input.TextArea rows={2} maxLength={500} showCount /></Form.Item>
          </div>
          <div className="raw-entry-modal-actions"><Button onClick={() => setCreateOpen(false)} disabled={saving}>取消</Button><Button type="primary" htmlType="submit" loading={saving}>保存草稿</Button></div>
        </Form>
      </Modal>

      <Modal title="业务单详情" open={Boolean(detail)} width={1120} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>}>
        {detail ? <>
          <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
            <Descriptions.Item label="业务单号">{detail.documentNo}</Descriptions.Item><Descriptions.Item label="状态">{statusTag(detail.status)}</Descriptions.Item><Descriptions.Item label="账期">{detail.month}</Descriptions.Item><Descriptions.Item label="业务日期">{detail.transactionDate.slice(0, 10)}</Descriptions.Item>
            <Descriptions.Item label="系统单号">{detail.orderNo}</Descriptions.Item><Descriptions.Item label="原始订单号">{detail.customerOrderNo || "-"}</Descriptions.Item><Descriptions.Item label="用户">{detail.customerName}</Descriptions.Item><Descriptions.Item label="业务类型">{detail.businessType}</Descriptions.Item>
            <Descriptions.Item label="销售代表">{detail.salespersonName}</Descriptions.Item><Descriptions.Item label="客服代表">{detail.customerServiceName}</Descriptions.Item><Descriptions.Item label="主品名">{detail.mainProductName || "-"}</Descriptions.Item><Descriptions.Item label="录入人">{detail.createdBy}</Descriptions.Item>
            <Descriptions.Item label="内部备注" span={4}>{detail.internalRemark || detail.note || "-"}</Descriptions.Item>
          </Descriptions>
          <Divider orientation="left">费用明细</Divider>
          <Table rowKey="id" size="small" pagination={false} columns={detailLineColumns} dataSource={detail.lines} scroll={{ x: 1050 }} />
          <Divider orientation="left">原始凭证</Divider>
          {detail.attachments.length ? <Space wrap>{detail.attachments.map((attachment) => <Button key={attachment.id} icon={<DownloadOutlined />} onClick={() => void downloadAttachment(attachment.entryId, attachment.id, attachment.fileName)}>{attachment.fileName}</Button>)}</Space> : "未上传凭证"}
        </> : null}
      </Modal>

      <Modal title="作废业务单" open={Boolean(voidTarget)} confirmLoading={voiding} okText="确认作废" okButtonProps={{ danger: true }} cancelText="取消" onOk={() => void submitVoid()} onCancel={() => !voiding && setVoidTarget(null)}>
        <Alert type="warning" showIcon message={voidTarget ? `将作废 ${voidTarget.documentNo}；若已入账，本月财务数据将自动重算。` : ""} style={{ marginBottom: 16 }} />
        <Input.TextArea value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="必填：说明作废原因" rows={4} maxLength={300} showCount />
      </Modal>
    </div>
  );
}
