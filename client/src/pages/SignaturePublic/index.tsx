import { Button, Card, Result, Space, Typography, message } from "antd";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { signDocumentByToken } from "../../api/workflow.api";

export default function SignaturePublic() {
  const { token } = useParams();
  const [loading, setLoading] = useState(false);
  const [signed, setSigned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    if (!token) {
      setError("签名链接无效，请联系主管重新发送。");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await signDocumentByToken(token);
      setSigned(true);
      message.success("签名确认已提交");
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "签名失败，链接可能已过期或已使用。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="public-signature-page">
      <Card className="public-signature-card">
        {signed ? (
          <Result
            status="success"
            title="签名确认已完成"
            subTitle="该签名链接已自动失效，主管可在电子签名确认页查看状态。"
          />
        ) : (
          <Space direction="vertical" size={18} style={{ width: "100%" }}>
            <div>
              <Typography.Title level={3}>员工提成确认单电子签名</Typography.Title>
              <Typography.Paragraph type="secondary">
                请确认主管发送的个人提成确认单内容无误后，点击下方按钮完成电子签名。系统会记录签名时间、IP 和设备信息作为确认留痕。
              </Typography.Paragraph>
            </div>
            {error ? <Result status="warning" title={error} /> : null}
            <Button type="primary" size="large" loading={loading} block onClick={handleSign}>
              确认无误并电子签名
            </Button>
          </Space>
        )}
      </Card>
    </main>
  );
}
