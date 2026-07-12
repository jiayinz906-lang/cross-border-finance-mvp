import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { MonthProvider } from "./contexts/MonthContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { routes } from "./router";

const SignaturePublic = lazy(() => import("./pages/SignaturePublic"));
const Login = lazy(() => import("./pages/Login"));

function publicPage(element: ReactNode) {
  return <Suspense fallback={<div className="route-loading">正在加载页面...</div>}>{element}</Suspense>;
}

const router = createHashRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: "/signature/:token",
    element: publicPage(<SignaturePublic />)
  },
  { path: "/login", element: publicPage(<Login />) },
  { element: <ProtectedRoute />, children: routes },
  { path: "*", element: <Navigate to="/dashboard" replace /> }
]);

export default function App() {
  return (
    <AuthProvider>
      <MonthProvider>
        <RouterProvider router={router} />
      </MonthProvider>
    </AuthProvider>
  );
}
