import {
  AlertOutlined,
  BarChartOutlined,
  DashboardOutlined,
  FileTextOutlined,
  MoneyCollectOutlined,
  PayCircleOutlined,
  PercentageOutlined,
  ProfileOutlined,
  SettingOutlined,
  TeamOutlined
} from "@ant-design/icons";
import { Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Sider, Content } = Layout;

const menuItems: MenuProps["items"] = [
  { key: "/dashboard", icon: <DashboardOutlined />, label: "经营总览" },
  { key: "/finance-ledger", icon: <ProfileOutlined />, label: "订单台账" },
  { key: "/profit-analysis", icon: <BarChartOutlined />, label: "业务利润" },
  { key: "/commission", icon: <PercentageOutlined />, label: "物流提成" },
  { key: "/service-confirm", icon: <FileTextOutlined />, label: "注册确认" },
  { key: "/signature-confirm", icon: <TeamOutlined />, label: "电子签名确认" },
  { key: "/receivables", icon: <MoneyCollectOutlined />, label: "应收管理" },
  { key: "/payables", icon: <PayCircleOutlined />, label: "上游应付" },
  { key: "/risks", icon: <AlertOutlined />, label: "风险复查" },
  { key: "/reports", icon: <FileTextOutlined />, label: "月度报表" },
  { key: "/agent-rules", icon: <TeamOutlined />, label: "分析规则" },
  { key: "/settings", icon: <SettingOutlined />, label: "参数规则" }
];

export function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout className="app-shell">
      <Sider width={248} className="app-sider">
        <div className="brand">
          <Typography.Title level={3}>XJD Finance UI</Typography.Title>
          <Typography.Text>6月物流 / 注册业务</Typography.Text>
          <Typography.Text>Excel 导入经营分析台</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        <div className="sider-note">
          <strong>界面定位</strong>
          <span>用于财务和主管测试数据口径、提成确认、异常票复核，不替代最终财务凭证。</span>
        </div>
      </Sider>
      <Layout>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
