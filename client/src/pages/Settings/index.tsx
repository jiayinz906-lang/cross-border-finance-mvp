import { Card, Descriptions } from "antd";
import { PageHeader } from "../../components/PageHeader";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000/api";

export default function Settings() {
  return (
    <>
      <PageHeader
        title="参数规则"
        description="系统严格按原始表格标注汇率计算：1 为人民币，美金/美元/USD 按 6.85，其余标注数据按表格标注执行。"
      />
      <Card>
        <Descriptions column={1}>
          <Descriptions.Item label="前端访问地址">http://localhost:5173/</Descriptions.Item>
          <Descriptions.Item label="后端接口地址">{apiBaseUrl}</Descriptions.Item>
          <Descriptions.Item label="本地后端端口">4000</Descriptions.Item>
          <Descriptions.Item label="本地数据库">prisma/dev.db</Descriptions.Item>
          <Descriptions.Item label="线上后端接口">
            https://cross-border-finance-server.onrender.com/api
          </Descriptions.Item>
          <Descriptions.Item label="汇率规则">
            原表标注汇率；美金/美元/USD/汇率未出 = 6.85
          </Descriptions.Item>
        </Descriptions>
      </Card>
    </>
  );
}
