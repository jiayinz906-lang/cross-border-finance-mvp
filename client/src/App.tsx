import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { routes } from "./router";

const router = createHashRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  ...routes
]);

export default function App() {
  return <RouterProvider router={router} />;
}
