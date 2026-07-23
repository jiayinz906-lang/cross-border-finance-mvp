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
import { pageLabelForRole, pagesForPermissions, type AppPageAccess } from "../config/access";

const { Sider, Content } = Layout;

function MenuMark() {
  return <span className="menu-mark" aria-hidden="true" />;
}

function Brand() {
  const { selectedMonth } = useSelectedMonth();
  return (
    <div className="brand">
      <Typography.Title level={3}>XJD 财务运营系统</Typography.Title>
      <Typography.Text>跨境物流与企业服务</Typography.Text>
      <Typography.Text>当前账期：{selectedMonth}</Typography.Text>
    </div>
  );
}

const menuGroups = [
  { key: "analysis", label: "经营分析", icon: <span className="menu-group-icon">经</span>, paths: ["/dashboard", "/profit-analysis", "/customer-profit"] },
  { key: "settlement", label: "月度结算", icon: <span className="menu-group-icon">结</span>, paths: ["/commission", "/operator-performance", "/service-confirm", "/signature-confirm"] },
  { key: "funds", label: "资金管理", icon: <span className="menu-group-icon">资</span>, paths: ["/receivables", "/payables", "/finance-operations"] },
  { key: "audit", label: "风险与审计", icon: <span className="menu-group-icon">审</span>, paths: ["/risks", "/raw-entry", "/finance-ledger", "/reports"] },
  { key: "system", label: "系统管理", icon: <span className="menu-group-icon">系</span>, paths: ["/settings", "/agent-rules"] }
];

function groupedMenuItems(pages: AppPageAccess[], role?: string): MenuProps["items"] {
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const grouped = menuGroups
    .map((group) => {
      const children = group.paths
        .map((path) => byPath.get(path))
        .filter(Boolean)
        .map((page) => ({
          key: page!.path,
          icon: <MenuMark />,
          label: pageLabelForRole(page!, role)
        }));
      return children.length ? { key: group.key, icon: group.icon, label: group.label, children } : null;
    })
    .filter(Boolean) as MenuProps["items"];
  const groupedPaths = new Set(menuGroups.flatMap((group) => group.paths));
  const remaining = pages
    .filter((page) => !groupedPaths.has(page.path))
    .map((page) => ({ key: page.path, icon: <MenuMark />, label: pageLabelForRole(page, role) }));
  return remaining.length ? [...(grouped ?? []), { key: "other", label: "其他", children: remaining }] : grouped;
}

export function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const screens = useBreakpoint();
  const isMobile = !screens.md;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAuth();
  const visiblePages = pagesForPermissions(user?.auth?.permissions, user?.role);
  const menuItems = groupedMenuItems(visiblePages, user?.role);
  const selectedKeys = visiblePages.some((page) => page.path === location.pathname) ? [location.pathname] : [];
  const openKeys = menuGroups.filter((group) => group.paths.includes(location.pathname)).map((group) => group.key);

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
      <Menu mode="inline" defaultOpenKeys={openKeys} selectedKeys={selectedKeys} items={menuItems} onClick={handleNavigate} />
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
