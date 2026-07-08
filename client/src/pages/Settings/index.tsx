import { Card, Descriptions } from "antd";
import { PageHeader } from "../../components/PageHeader";

export default function Settings() {
  return (
    <>
      <PageHeader title="系统设置" description="第一阶段仅保留环境变量和云端部署配置说明。" />
      <Card>
        <Descriptions column={1}>
          <Descriptions.Item label="后端端口">PORT</Descriptions.Item>
          <Descriptions.Item label="前端 API 地址">VITE_API_BASE_URL</Descriptions.Item>
          <Descriptions.Item label="数据库地址">DATABASE_URL</Descriptions.Item>
          <Descriptions.Item label="汇率 API Key">EXCHANGE_RATE_API_KEY</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );
}
