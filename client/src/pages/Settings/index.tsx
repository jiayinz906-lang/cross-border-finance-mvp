import { Card, Descriptions } from "antd";
import { PageHeader } from "../../components/PageHeader";

export default function Settings() {
  return (
    <>
      <PageHeader
        title="参数规则"
        description="系统按原始表格标注汇率计算：1 为人民币，美金按 6.85，其余数字汇率按表格标注执行。"
      />
      <Card>
        <Descriptions column={1}>
          <Descriptions.Item label="后端端口">PORT</Descriptions.Item>
          <Descriptions.Item label="前端 API 地址">VITE_API_BASE_URL</Descriptions.Item>
          <Descriptions.Item label="数据库地址">DATABASE_URL</Descriptions.Item>
          <Descriptions.Item label="汇率规则">原表标注汇率；美金/美元/USD/汇率未出 = 6.85</Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );
}
