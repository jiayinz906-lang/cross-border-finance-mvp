import { Button, Card, Col, Descriptions, Form, Input, Modal, Row, Select, Space, Table, Tag, Timeline, Typography, message } from "antd";
import { useCallback, useEffect, useState } from "react";
import { commentBusinessCase, createBusinessCase, listBusinessCases, updateBusinessCase, type BusinessCase } from "../../api/business-case.api";
import { useSelectedMonth } from "../../contexts/MonthContext";
import { useAuth } from "../../contexts/AuthContext";

const typeOptions = [
  { value: "clearance", label: "清关业务" }, { value: "company_registration", label: "公司注册" },
  { value: "eac", label: "EAC 证书" }, { value: "other_service", label: "其他服务" }
];
const statusOptions = [
  { value: "draft", label: "草稿" }, { value: "processing", label: "办理中" },
  { value: "waiting_customer", label: "待客户资料" }, { value: "completed", label: "已完成" }, { value: "archived", label: "已归档" }
];
const label = (options: Array<{value:string;label:string}>, value: string) => options.find((item) => item.value === value)?.label ?? value;

export default function BusinessCases() {
  const { selectedMonth } = useSelectedMonth();
  const { user } = useAuth();
  const canWrite = Boolean(user?.auth.permissions.includes("confirmation:approve"));
  const [rows, setRows] = useState<BusinessCase[]>([]);
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [caseType, setCaseType] = useState<string>();
  const [editing, setEditing] = useState<BusinessCase | null>(null);
  const [detail, setDetail] = useState<BusinessCase | null>(null);
  const [form] = Form.useForm();
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows((await listBusinessCases({ month: selectedMonth, keyword, caseType })).data.rows); }
    catch (error: any) { message.error(error?.response?.data?.message ?? "业务档案加载失败"); }
    finally { setLoading(false); }
  }, [selectedMonth, keyword, caseType]);
  useEffect(() => { load(); }, [load]);

  const openEditor = (row?: BusinessCase) => {
    setEditing(row ?? ({} as BusinessCase));
    form.setFieldsValue(row ? { ...row } : { month: selectedMonth, caseType: "clearance", status: "draft" });
  };
  const save = async () => {
    const values = await form.validateFields();
    if (editing?.id) await updateBusinessCase(editing.id, values); else await createBusinessCase(values);
    message.success("业务档案已保存"); setEditing(null); form.resetFields(); await load();
  };

  return <div className="page-shell">
    <div className="page-heading"><div><h1>业务档案</h1><p>统一管理清关、公司注册、EAC 证书及服务业务进度；财务台账和提成核心功能保持独立。</p></div>{canWrite && <Button type="primary" onClick={() => openEditor()}>新增业务档案</Button>}</div>
    <Row gutter={12} style={{ marginBottom: 16 }}>
      {typeOptions.map((item) => <Col xs={12} md={6} key={item.value}><Card size="small"><Typography.Text type="secondary">{item.label}</Typography.Text><div style={{ fontSize: 24, fontWeight: 700 }}>{rows.filter((row) => row.caseType === item.value).length}</div></Card></Col>)}
    </Row>
    <Card>
      <Space wrap style={{ marginBottom: 16 }}><Input.Search allowClear placeholder="档案号、客户、标题、产品" value={keyword} onChange={(e) => setKeyword(e.target.value)} onSearch={load} style={{ width: 300 }} /><Select allowClear placeholder="业务类型" value={caseType} onChange={setCaseType} options={typeOptions} style={{ width: 160 }} /><Button onClick={load}>刷新</Button></Space>
      <Table rowKey="id" loading={loading} dataSource={rows} scroll={{ x: 1100 }} columns={[
        { title: "档案号", dataIndex: "caseNo", width: 180, fixed: "left" }, { title: "类型", dataIndex: "caseType", render: (v) => <Tag color="blue">{label(typeOptions, v)}</Tag> },
        { title: "标题", dataIndex: "title", width: 220 }, { title: "客户", dataIndex: "customerName" }, { title: "销售代表", dataIndex: "salespersonName", render: (v) => v || "-" },
        { title: "操作员", dataIndex: "customerServiceName", render: (v) => v || "-" }, { title: "状态", dataIndex: "status", render: (v) => <Tag color={v === "completed" ? "green" : "gold"}>{label(statusOptions, v)}</Tag> },
        { title: "更新时间", dataIndex: "updatedAt", render: (v) => String(v).replace("T", " ").slice(0, 19) },
        { title: "操作", fixed: "right", render: (_, row) => <Space><Button size="small" onClick={() => setDetail(row)}>详情</Button>{canWrite && <Button size="small" onClick={() => openEditor(row)}>编辑</Button>}</Space> }
      ]} />
    </Card>
    <Modal open={Boolean(editing)} title={editing?.id ? "编辑业务档案" : "新增业务档案"} onCancel={() => setEditing(null)} onOk={save} width={760} destroyOnClose>
      <Form form={form} layout="vertical"><Row gutter={12}>
        <Col span={8}><Form.Item name="month" label="月份" rules={[{required:true}]}><Input /></Form.Item></Col><Col span={8}><Form.Item name="caseType" label="业务类型" rules={[{required:true}]}><Select options={typeOptions}/></Form.Item></Col><Col span={8}><Form.Item name="status" label="状态"><Select options={statusOptions}/></Form.Item></Col>
        <Col span={12}><Form.Item name="title" label="业务标题" rules={[{required:true}]}><Input /></Form.Item></Col><Col span={12}><Form.Item name="customerName" label="客户名称" rules={[{required:true}]}><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="salespersonName" label="销售代表"><Input /></Form.Item></Col><Col span={8}><Form.Item name="customerServiceName" label="操作员"><Input /></Form.Item></Col><Col span={8}><Form.Item name="productName" label="产品/项目"><Input /></Form.Item></Col>
        <Col span={8}><Form.Item name="contactName" label="联系人"><Input /></Form.Item></Col><Col span={8}><Form.Item name="contactPhone" label="联系电话"><Input /></Form.Item></Col><Col span={8}><Form.Item name="taxNumber" label="税号/证书号"><Input /></Form.Item></Col>
        <Col span={24}><Form.Item name="address" label="注册地址/业务地址"><Input /></Form.Item></Col><Col span={24}><Form.Item name="attachmentUrls" label="附件链接（每行一个）"><Input.TextArea rows={2}/></Form.Item></Col><Col span={24}><Form.Item name="remark" label="备注"><Input.TextArea rows={3}/></Form.Item></Col>
      </Row></Form>
    </Modal>
    <Modal open={Boolean(detail)} title={detail?.title} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={820}>
      {detail && <><Descriptions bordered size="small" column={2}><Descriptions.Item label="档案号">{detail.caseNo}</Descriptions.Item><Descriptions.Item label="类型">{label(typeOptions, detail.caseType)}</Descriptions.Item><Descriptions.Item label="客户">{detail.customerName}</Descriptions.Item><Descriptions.Item label="状态">{label(statusOptions, detail.status)}</Descriptions.Item><Descriptions.Item label="销售/操作员">{detail.salespersonName || "-"} / {detail.customerServiceName || "-"}</Descriptions.Item><Descriptions.Item label="产品/项目">{detail.productName || "-"}</Descriptions.Item><Descriptions.Item label="备注" span={2}>{detail.remark || "-"}</Descriptions.Item></Descriptions><Typography.Title level={5} style={{marginTop:20}}>跟进记录</Typography.Title><Timeline items={(detail.comments ?? []).map((item) => ({ children: <><b>{item.createdBy}</b> · {String(item.createdAt).replace("T", " ").slice(0,19)}<div>{item.content}</div></> }))}/><Space.Compact style={{width:"100%"}}><Input value={comment} onChange={(e)=>setComment(e.target.value)} placeholder="填写业务跟进记录"/><Button type="primary" disabled={!comment.trim()} onClick={async()=>{await commentBusinessCase(detail.id, comment); setComment(""); const refreshed=(await listBusinessCases({month:selectedMonth})).data.rows.find((r)=>r.id===detail.id); setDetail(refreshed ?? null);}}>添加跟进</Button></Space.Compact></>}
    </Modal>
  </div>;
}
