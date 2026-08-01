import type { ReactNode } from "react";
import { createBrowserRouter, Navigate } from "react-router";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import FAQ from "./pages/FAQ";
import ContactSupport from "./pages/ContactSupport";
import AppLayout from "./components/AppLayout";
import Dashboard from "./pages/Dashboard";
import EstimateBuilder from "./pages/EstimateBuilder";
import Estimates from "./pages/Estimates";
import EstimateDetail from "./pages/EstimateDetail";
import PublicEstimate from "./pages/PublicEstimate";
import Projects from "./pages/Projects";
import Contacts from "./pages/Contacts";
import Account from "./pages/Account";
import Schedule from "./pages/Schedule";
import FollowUps from "./pages/FollowUps";
import Invoices from "./pages/Invoices";
import InvoiceDetail from "./pages/InvoiceDetail";
import PublicInvoice from "./pages/PublicInvoice";
import Team from "./pages/Team";
import JobDetail from "./pages/JobDetail";
import Billing from "./pages/Billing";
import RedeemAccess from "./pages/RedeemAccess";
import Reports from "./pages/Reports";
import FeatureGate from "./components/FeatureGate";
import { useApp } from "./context/AppContext";

function ProtectedApp() {
  const { user, authLoading, workspaceLoading } = useApp();

  if (authLoading || workspaceLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading YardPilot...</p>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function ManagerOnly({ children }: { children: ReactNode }) {
  const { role } = useApp();
  if (role === "employee") {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}

export const router = createBrowserRouter([
  { path: "/", Component: Landing },
  { path: "/login", Component: Login },
  { path: "/forgot-password", Component: ForgotPassword },
  { path: "/reset-password", Component: ResetPassword },
  { path: "/terms", Component: Terms },
  { path: "/privacy", Component: Privacy },
  { path: "/faq", Component: FAQ },
  { path: "/contact", Component: ContactSupport },
  { path: "/estimate/share/:token", Component: PublicEstimate },
  { path: "/invoice/share/:token", Component: PublicInvoice },
  { path: "/redeem/:code", Component: RedeemAccess },
  {
    path: "/app",
    Component: ProtectedApp,
    children: [
      { index: true, element: <Navigate to="/app/dashboard" replace /> },
      { path: "dashboard", Component: Dashboard },
      {
        path: "contacts",
        element: (
          <ManagerOnly>
            <Contacts />
          </ManagerOnly>
        ),
      },
      {
        path: "estimates",
        element: (
          <ManagerOnly>
            <Estimates />
          </ManagerOnly>
        ),
      },
      {
        path: "estimates/:id",
        element: (
          <ManagerOnly>
            <EstimateDetail />
          </ManagerOnly>
        ),
      },
      {
        path: "estimate/new",
        element: (
          <ManagerOnly>
            <EstimateBuilder />
          </ManagerOnly>
        ),
      },
      {
        path: "estimate/:id",
        element: (
          <ManagerOnly>
            <EstimateBuilder />
          </ManagerOnly>
        ),
      },
      { path: "jobs/:id", Component: JobDetail },
      { path: "projects/current", element: <Projects status="active" /> },
      {
        path: "projects/past",
        element: (
          <ManagerOnly>
            <Projects status="completed" />
          </ManagerOnly>
        ),
      },
      {
        path: "invoices",
        element: (
          <ManagerOnly>
            <Invoices />
          </ManagerOnly>
        ),
      },
      {
        path: "invoices/:id",
        element: (
          <ManagerOnly>
            <InvoiceDetail />
          </ManagerOnly>
        ),
      },
      { path: "schedule", element: <FeatureGate feature="schedule"><Schedule /></FeatureGate> },
      { path: "follow-ups", element: <FeatureGate feature="followups"><FollowUps /></FeatureGate> },
      { path: "team", element: <FeatureGate feature="team"><Team /></FeatureGate> },
      { path: "account", Component: Account },
      { path: "billing", Component: Billing },
      { path: "reports", element: <FeatureGate feature="advanced_reports"><Reports /></FeatureGate> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
