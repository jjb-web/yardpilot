import { createBrowserRouter, Navigate } from "react-router";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import EstimateBuilder from "./pages/EstimateBuilder";
import Projects from "./pages/Projects";
import Account from "./pages/Account";

export const router = createBrowserRouter([
  { path: "/", Component: Landing },
  { path: "/login", Component: Login },
  {
    path: "/app",
    Component: AppLayout,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", Component: Dashboard },
      { path: "estimate/new", Component: EstimateBuilder },
      { path: "estimate/:id", Component: EstimateBuilder },
      { path: "projects/current", element: <Projects status="active" /> },
      { path: "projects/past", element: <Projects status="completed" /> },
      { path: "account", Component: Account },
    ],
  },
]);
