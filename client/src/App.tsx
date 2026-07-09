import { Navigate, RouterProvider, createHashRouter } from "react-router-dom";
import { MonthProvider } from "./contexts/MonthContext";
import { routes } from "./router";

const router = createHashRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  ...routes
]);

export default function App() {
  return (
    <MonthProvider>
      <RouterProvider router={router} />
    </MonthProvider>
  );
}
