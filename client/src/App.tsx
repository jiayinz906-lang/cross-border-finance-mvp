import { message } from "antd";
import { useEffect } from "react";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { MonthProvider } from "./contexts/MonthContext";
import SignaturePublic from "./pages/SignaturePublic";
import { routes } from "./router";

const router = createHashRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: "/signature/:token",
    element: <SignaturePublic />
  },
  ...routes
]);

export default function App() {
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      message.warning(detail?.message ?? "请先在参数规则页登录。");
    };
    window.addEventListener("xjd-api-auth-error", handler);
    return () => window.removeEventListener("xjd-api-auth-error", handler);
  }, []);

  return (
    <MonthProvider>
      <RouterProvider router={router} />
    </MonthProvider>
  );
}
