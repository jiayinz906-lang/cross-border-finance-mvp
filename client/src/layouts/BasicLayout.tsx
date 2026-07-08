import { Layout, Menu, Typography } from "antd";
import type { MenuProps } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";

const { Sider, Content } = Layout;

function MenuMark() {
  return <span className="menu-mark" aria-hidden="true" />;
}

const menuItems: MenuProps["items"] = [
  { key: "/dashboard", icon: <MenuMark />, label: "经营总览" },
  { key: "/profit-analysis", icon: <MenuMark />, label: "业务利润" },
  { key: "/commission", icon: <MenuMark />, label: "物流提成" },
  { key: "/service-confirm", icon: <MenuMark />, label: "注册确认" },
  { key: "/signature-confirm", icon: <MenuMark />, label: "电子签名确认" },
  { key: "/operator-performance", icon: <MenuMark />, label: "操作员绩效" },
  { key: "/customer-profit", icon: <MenuMark />, label: "客户利润分析" },
  { key: "/risks", icon: <MenuMark />, label: "风险复查" },
  { key: "/payables", icon: <MenuMark />, label: "上游应付" },
  { key: "/settings", icon: <MenuMark />, label: "参数规则" }
];

export function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Layout className="app-shell">
      <Sider width={202} className="app-sider">
        <div className="brand">
          <Typography.Title level={3}>XJD Finance UI</Typography.Title>
          <Typography.Text>6月物流 / 注册业务</Typography.Text>
          <Typography.Text>提成测试界面</Typography.Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
        <div className="sider-note">
          <strong>界面定位</strong>
          <span>用于财务和主管测试数据口径、提成确认、异常票据复核，不替代最终财务凭证。</span>
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
