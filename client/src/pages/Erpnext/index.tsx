import { ApiOutlined, ExportOutlined, ReloadOutlined } from "@ant-design/icons";
import Alert from "antd/es/alert";
import Button from "antd/es/button";
import Card from "antd/es/card";
import Col from "antd/es/col";
import Descriptions from "antd/es/descriptions";
import Empty from "antd/es/empty";
import Row from "antd/es/row";
import Space from "antd/es/space";
import Spin from "antd/es/spin";
import Statistic from "antd/es/statistic";
import Table from "antd/es/table";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { useCallback, useEffect, useState } from "react";
import { getErpnextOverview, getErpnextStatus, testErpnextConnection } from "../../api/erpnext.api";
import type { ErpnextInvoice, ErpnextOverview, ErpnextStatus } from "../../api/erpnext.api";
import { PageHeader } from "../../components/PageHeader";

function errorMessage(error: any) {
  return error?.response?.data?.message || error?.message || "ERPNext 请求失败，请检查后端配置和远程服务。";
}

function amount(value: number | undefined, currency?: string) {
  return `${currency || ""} ${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

const invoiceColumns = [
  { title: "单据号", dataIndex: "name", key: "name", width: 170 },
  { title: "日期", dataIndex: "posting_date", key: "posting_date", width: 110 },
  { title: "客户/供应商", key: "party", render: (_: unknown, row: ErpnextInvoice) => row.customer || row.supplier || "-", width: 190 },
  { title: "总额", key: "grand_total", align: "right" as const, render: (_: unknown, row: ErpnextInvoice) => amount(row.grand_total, row.currency), width: 140 },
  { title: "未结金额", key: "outstanding_amount", align: "right" as const, render: (_: unknown, row: ErpnextInvoice) => amount(row.outstanding_amount, row.currency), width: 140 },
  { title: "状态", dataIndex: "status", key: "status", render: (value: string) => <Tag>{value || "-"}</Tag>, width: 110 }
];

export default function ErpnextPage() {
  const [status, setStatus] = useState<ErpnextStatus>();
  const [overview, setOverview] = useState<ErpnextOverview>();
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const statusResponse = await getErpnextStatus();
      setStatus(statusResponse.data);
      if (statusResponse.data.configured) {
        const overviewResponse = await getErpnextOverview();
        setOverview(overviewResponse.data);
      } else {
        setOverview(undefined);
      }
    } catch (requestError) {
      setOverview(undefined);
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleTest = async () => {
    setTesting(true);
    setError("");
    try {
      await testErpnextConnection();
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setTesting(false);
    }
  };

  const openErpnext = () => {
    if (status?.baseUrl) window.open(status.baseUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <>
      <PageHeader
        title="ERPNext 集成"
        description="通过后端安全连接 ERPNext，集中查看客户、供应商及销售/采购发票；当前为只读模式。"
        extra={<Space wrap><Button icon={<ApiOutlined />} loading={testing} disabled={!status?.configured} onClick={handleTest}>测试连接</Button><Button icon={<ReloadOutlined />} loading={loading} onClick={load}>刷新</Button>{status?.baseUrl ? <Button type="primary" icon={<ExportOutlined />} onClick={openErpnext}>打开 ERPNext</Button> : null}</Space>}
      />

      {error ? <Alert style={{ marginBottom: 16 }} type="error" showIcon message="ERPNext 暂不可用" description={error} action={<Button onClick={load}>重试</Button>} /> : null}
      {!loading && status && !status.configured ? (
        <Alert
          type="warning"
          showIcon
          message="ERPNext 连接尚未配置"
          description="请在本地 .env 或 Render 环境变量中配置 ERPNEXT_BASE_URL、ERPNEXT_API_KEY、ERPNEXT_API_SECRET。密钥只保存在后端，不会发送到浏览器。"
        />
      ) : null}

      {loading ? <div className="page-state"><Spin tip="正在连接 ERPNext" /></div> : overview ? (
        <Space direction="vertical" size={16} style={{ width: "100%" }}>
          <Card size="small">
            <Descriptions column={{ xs: 1, md: 4 }}>
              <Descriptions.Item label="连接状态"><Tag color="success">已连接</Tag></Descriptions.Item>
              <Descriptions.Item label="ERPNext 用户">{overview.connection.remoteUser}</Descriptions.Item>
              <Descriptions.Item label="接入模式">后端 Token / 只读</Descriptions.Item>
              <Descriptions.Item label="更新时间">{new Date(overview.fetchedAt).toLocaleString("zh-CN")}</Descriptions.Item>
            </Descriptions>
          </Card>
          <Row gutter={[12, 12]}>
            <Col xs={12} lg={6}><Card><Statistic title="客户" value={overview.counts.customerCount} suffix="个" /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="供应商" value={overview.counts.supplierCount} suffix="个" /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="销售发票" value={overview.counts.salesInvoiceCount} suffix="张" /></Card></Col>
            <Col xs={12} lg={6}><Card><Statistic title="采购发票" value={overview.counts.purchaseInvoiceCount} suffix="张" /></Card></Col>
          </Row>
          <Card title="最近销售发票" extra={<Typography.Text type="secondary">数据来自 ERPNext，不写入 XJD 财务台账</Typography.Text>}>
            {overview.salesInvoices.length ? <Table rowKey="name" size="small" columns={invoiceColumns} dataSource={overview.salesInvoices} pagination={false} scroll={{ x: 860 }} /> : <Empty description="ERPNext 暂无销售发票" />}
          </Card>
          <Card title="最近采购发票" extra={<Typography.Text type="secondary">金额及币种保持 ERPNext 原始值</Typography.Text>}>
            {overview.purchaseInvoices.length ? <Table rowKey="name" size="small" columns={invoiceColumns} dataSource={overview.purchaseInvoices} pagination={false} scroll={{ x: 860 }} /> : <Empty description="ERPNext 暂无采购发票" />}
          </Card>
        </Space>
      ) : null}
    </>
  );
}
