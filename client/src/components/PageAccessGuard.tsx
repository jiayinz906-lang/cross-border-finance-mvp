import { Button, Result } from "antd";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { firstAllowedPath, hasPermission, type PagePermission } from "../config/access";
import { useAuth } from "../contexts/AuthContext";

export function PageAccessGuard({ permission, children }: { permission: PagePermission; children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const permissions = user?.auth?.permissions;

  if (hasPermission(permissions, permission)) return children;

  return (
    <Result
      status="403"
      title="无权访问此页面"
      subTitle="当前账号的数据范围和工作职责不包含此页面。如需调整，请联系系统管理员修改账号角色。"
      extra={<Button type="primary" onClick={() => navigate(firstAllowedPath(permissions, user?.role), { replace: true })}>返回我的工作台</Button>}
    />
  );
}
