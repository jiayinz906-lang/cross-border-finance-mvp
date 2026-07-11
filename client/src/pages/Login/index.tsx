import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Form, Input, Typography } from "antd";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";

export default function Login() {
  const { login, token, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const from = (location.state as { from?: string } | null)?.from || "/dashboard";

  if (ready && token) return <Navigate to={from} replace />;

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true);
    setError("");
    try {
      await login(values.username.trim(), values.password);
      navigate(from, { replace: true });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message ?? requestError?.response?.data?.detail ?? "登录失败，请检查账号和密码。  ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page">
      <Card className="login-card">
        <div className="login-brand">
          <span className="login-brand-mark">XJD</span>
          <div>
            <Typography.Title level={2}>XJD Finance</Typography.Title>
            <Typography.Text>跨境物流财务管理</Typography.Text>
          </div>
        </div>
        <Typography.Paragraph className="login-intro">登录后可导入台账、核对利润、处理应收应付并完成确认签名。</Typography.Paragraph>
        {error ? <Alert type="error" showIcon message={error} closable onClose={() => setError("")} /> : null}
        <Form layout="vertical" size="large" onFinish={submit} requiredMark={false}>
          <Form.Item label="账号" name="username" rules={[{ required: true, message: "请输入账号" }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" placeholder="请输入账号" />
          </Form.Item>
          <Form.Item label="密码" name="password" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" placeholder="请输入密码" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block loading={loading}>登录</Button>
        </Form>
      </Card>
    </main>
  );
}
