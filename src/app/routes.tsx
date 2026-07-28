import {
  createBrowserRouter,
  Navigate,
} from "react-router";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import EstimateBuilder from "./pages/EstimateBuilder";
import Projects from "./pages/Projects";
import Account from "./pages/Account";
import { useApp } from "./context/AppContext";

function ProtectedApp() {
  const { user, authLoading } = useApp();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">
          Loading YardPilot...
        </p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Landing,
  },
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/app",
    Component: ProtectedApp,
    children: [
      {
        index: true,
        element: (
          <Navigate
            to="/app/dashboard"
            replace
          />
        ),
      },
      {
        path: "dashboard",
        Component: Dashboard,
      },
      {
        path: "estimate/new",
        Component: EstimateBuilder,
      },
      {
        path: "estimate/:id",
        Component: EstimateBuilder,
      },
      {
        path: "projects/current",
        element: <Projects status="active" />,
      },
      {
        path: "projects/past",
        element: <Projects status="completed" />,
      },
      {
        path: "account",
        Component: Account,
      },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/" replace />,
  },
]);