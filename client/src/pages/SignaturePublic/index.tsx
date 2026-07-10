import { Alert, Button, Card, Checkbox, Descriptions, Input, Result, Space, Table, Tag, Typography, message } from "antd";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getPublicSignatureDocument, signDocumentByToken, type PublicSignatureDocument } from "../../api/workflow.api";
import { formatMoney } from "../../utils/formatMoney";
import { formatPercent } from "../../utils/formatPercent";

function money(value: unknown) {
  return formatMoney(typeof value === "number" ? value : Number(value ?? 0)).replace("CN¥", "¥").replace(/\s/g, "");
}

function dateTime(value?: string) {
  return value ? value.replace("T", " ").slice(0, 19) : "-";
}

export default function SignaturePublic() {
  const { token } = useParams();
  const [document, setDocument] = useState<PublicSignatureDocument | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState(false);
  const [signedName, setSignedName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDocument = useCallback(async () => {
    if (!token) {
      setError("签名链接无效，请联系主管重新发送。");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await getPublicSignatureDocument(token);
      setDocument(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.response?.data?.message ?? "签名链接无效、已过期或已使用。");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadDocument();
  }, [loadDocument]);

  const summary = document?.payload.summary ?? {};
  const details = document?.payload.details ?? [];
  const canSign = Boolean(document && accepted && signedName.trim() === document.document.ownerName && !signing);
  const detailColumns = useMemo(() => [
    { title: "运单号", dataIndex: "orderNo", width: 130 },
    { title: "原始订单号", dataIndex: "originalOrderNo", width: 140, render: (value: unknown) => value || "-" },
    { title: "业务类型", dataIndex: "businessType", width: 120 },
    { title: "毛利", dataIndex: "grossProfit", align: "right" as const, width: 120, render: money },
    { title: "提成比例", dataIndex: "commissionRate", align: "right" as const, width: 110, render: (value: unknown) => formatPercent(typeof value === "number" ? value : null) },
    { title: "提成金额", dataIndex: "commissionAmount", align: "right" as const, width: 120, render: money }
  ], []);

  const handleSign = async () => {
    if (!token || !canSign) return;
    setSigning(true);
    try {
      await signDocumentByToken(token, signedName.trim());
      setSigned(true);
      message.success("电子签名确认已提交");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? err?.response?.data?.message ?? "签名失败，链接可能已过期或已使用。");
    } finally {
      setSigning(false);
    }
  };

  return (
    <main className="public-signature-page">
      <Card className="public-signature-card" loading={loading}>
        {signed ? (
          <Result status="success" title="电子签名已完成" subTitle="本次签名已留痕，签名链接已自动失效。" />
        ) : error && !document ? (
          <Result status="warning" title="无法打开确认单" subTitle={error} extra={<Button onClick={loadDocument}>重新读取</Button>} />
        ) : document ? (
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <div className="public-signature-heading">
              <Tag color="blue">个人确认单 V{document.document.version}</Tag>
              <Typography.Title level={2}>{document.payload.title}</Typography.Title>
              <Typography.Text type="secondary">确认单编号：{document.payload.documentCode}　生成时间：{dateTime(document.payload.generatedAt)}</Typography.Text>
            </div>

            <Alert type="info" showIcon message={`请 ${document.document.ownerName} 核对以下确认单`} description={`链接有效期至 ${dateTime(document.document.expiresAt)}。签名后链接将立即失效。`} />

            <Descriptions className="public-signature-summary" bordered size="small" column={{ xs: 1, sm: 2, md: 3 }}>
              <Descriptions.Item label="确认人">{document.document.ownerName}</Descriptions.Item>
              <Descriptions.Item label="确认月份">{document.document.month}</Descriptions.Item>
              <Descriptions.Item label="订单数量">{document.document.orderCount}</Descriptions.Item>
              <Descriptions.Item label="确认毛利">{money(summary.grossProfit)}</Descriptions.Item>
              <Descriptions.Item label="提成比例">{formatPercent(typeof summary.commissionRate === "number" ? summary.commissionRate : null)}</Descriptions.Item>
              <Descriptions.Item label="最终确认提成">{money(summary.finalCommission ?? document.document.commissionAmount)}</Descriptions.Item>
            </Descriptions>

            <div className="public-signature-details">
              <Typography.Title level={4}>订单明细</Typography.Title>
              <Table rowKey={(row) => String(row.orderNo ?? row.originalOrderNo ?? Math.random())} columns={detailColumns} dataSource={details} pagination={false} size="small" scroll={{ x: 720 }} />
            </div>

            <div className="public-signature-statement">
              <Typography.Title level={4}>确认声明</Typography.Title>
              <Typography.Paragraph>{document.payload.statement}</Typography.Paragraph>
              <Checkbox checked={accepted} onChange={(event) => setAccepted(event.target.checked)}>我已阅读并确认以上订单、毛利及提成金额。</Checkbox>
              <Input value={signedName} onChange={(event) => setSignedName(event.target.value)} placeholder={`请输入确认人姓名：${document.document.ownerName}`} maxLength={60} />
              {signedName && signedName.trim() !== document.document.ownerName ? <Typography.Text type="danger">签名姓名需与确认人“{document.document.ownerName}”一致。</Typography.Text> : null}
            </div>

            {error ? <Alert type="error" showIcon message={error} /> : null}
            <Button type="primary" size="large" loading={signing} disabled={!canSign} block onClick={handleSign}>确认无误并电子签名</Button>
          </Space>
        ) : null}
      </Card>
    </main>
  );
}
