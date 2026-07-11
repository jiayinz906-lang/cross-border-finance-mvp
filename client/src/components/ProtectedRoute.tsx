import { Spin } from "antd";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSelectedMonth } from "../contexts/MonthContext";

export function ProtectedRoute() {
  const { token, ready } = useAuth();
  const month = useSelectedMonth();
  const location = useLocation();

  if (!ready || (Boolean(token) && !month.ready)) {
    return <div className="route-loading"><Spin size="large" tip="正在验证登录状态" /></div>;
  }
  if (!token) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  return <Outlet />;
}
