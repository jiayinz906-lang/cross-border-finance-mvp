import LogoutOutlined from "@ant-design/icons/es/icons/LogoutOutlined";
import MenuOutlined from "@ant-design/icons/es/icons/MenuOutlined";
import UserOutlined from "@ant-design/icons/es/icons/UserOutlined";
import Button from "antd/es/button";
import Drawer from "antd/es/drawer";
import useBreakpoint from "antd/es/grid/hooks/useBreakpoint";
import Layout from "antd/es/layout";
import Menu from "antd/es/menu";
import type { MenuProps } from "antd/es/menu";
import Tag from "antd/es/tag";
import Typography from "antd/es/typography";
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedMonth } from "../contexts/MonthContext";

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
  { key: "/receivables", icon: <MenuMark />, label: "应收管理" },
  { key: "/payables", icon: <MenuMark />, label: "上游应付" },
  { key: "/settings", icon: <MenuMark />, label: "参数规则" }
];

function Brand() {
  const { selectedMonth } = useSelectedMonth();
  return (
    <div className="brand">
      <Typography.Title level={3}>XJD Finance</Typography.Title>
      <Typography.Text>跨境物流财务管理</Typography.Text>
      <Typography.Text>当前账期：{selectedMonth}</Typography.Text>
    </div>
  );
}

export function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();

  const handleNavigate: MenuProps["onClick"] = ({ key }) => {
    navigate(key);
    setDrawerOpen(false);
  };

  const account = (
    <div className="sider-account">
      <div><UserOutlined /><span>{user?.displayName || user?.username || "当前用户"}</span></div>
      <Tag bordered={false}>{user?.auth?.label || user?.role || "-"}</Tag>
      <Button
        type="text"
        icon={<LogoutOutlined />}
        onClick={() => {
          logout();
          navigate("/login", { replace: true });
        }}
      >退出登录</Button>
    </div>
  );

  const navigation = (
    <>
      <Brand />
      <Menu mode="inline" selectedKeys={[location.pathname]} items={menuItems} onClick={handleNavigate} />
      {account}
    </>
  );

  return (
    <Layout className="app-shell">
      {!isMobile ? <Sider width={202} className="app-sider">{navigation}</Sider> : null}
      <Layout>
        {isMobile ? (
          <header className="mobile-app-header">
            <Button type="text" icon={<MenuOutlined />} aria-label="打开导航" onClick={() => setDrawerOpen(true)} />
            <strong>XJD Finance</strong>
            <span>{user?.displayName || user?.username || ""}</span>
          </header>
        ) : null}
        <Content className="app-content"><Outlet /></Content>
      </Layout>
      <Drawer className="mobile-nav-drawer" placement="left" width={280} open={drawerOpen} onClose={() => setDrawerOpen(false)} closable>
        {navigation}
      </Drawer>
    </Layout>
  );
}
