import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router";
import {
  Archive,
  BellRing,
  CalendarDays,
  ChevronRight,
  FileText,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  PlusCircle,
  ReceiptText,
  BarChart3,
  Sun,
  User,
  Users,
  CreditCard,
  LockKeyhole,
  Store,
  MessageSquareText,
  WalletCards,
  Repeat2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { WorkspaceRole } from "../data/types";
import { useSubscription } from "../hooks/useSubscription";
import type { FeatureKey } from "../lib/subscription";
import { useNotificationCenter } from "../context/NotificationsContext";
import RouteAnalytics from "./RouteAnalytics";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: WorkspaceRole[];
  feature?: FeatureKey;
};

const nav: NavItem[] = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/contacts", icon: Users, label: "Contacts", roles: ["owner", "co_owner", "manager"] },
  { to: "/app/estimates", icon: FileText, label: "Estimates", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/projects/current", icon: FolderOpen, label: "Jobs", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/invoices", icon: ReceiptText, label: "Invoices", roles: ["owner", "co_owner", "manager"] },
  { to: "/app/marketplace", icon: Store, label: "Marketplace", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/schedule", icon: CalendarDays, label: "Schedule", roles: ["owner", "co_owner", "manager", "employee"], feature: "schedule" },
  { to: "/app/follow-ups", icon: BellRing, label: "Follow-ups", roles: ["owner", "co_owner", "manager", "employee"], feature: "followups" },
  { to: "/app/reports", icon: BarChart3, label: "Reports", roles: ["owner", "co_owner", "manager"], feature: "advanced_reports" },
  { to: "/app/projects/past", icon: Archive, label: "Past Jobs", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/team", icon: Users, label: "Team", roles: ["owner", "co_owner", "manager", "employee"], feature: "team" },
  { to: "/app/team-payments", icon: WalletCards, label: "Employee payments", roles: ["owner", "co_owner", "manager", "employee"], feature: "team" },
  { to: "/app/notifications", icon: BellRing, label: "Notifications", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/feedback", icon: MessageSquareText, label: "YardPilot feedback", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/account", icon: User, label: "Account", roles: ["owner", "co_owner", "manager", "employee"] },
  { to: "/app/billing", icon: CreditCard, label: "Plans & billing", roles: ["owner", "co_owner"] },
];

function initialDarkMode() {
  const saved = localStorage.getItem("yardpilot-theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function roleLabel(role: WorkspaceRole | null) {
  if (!role) return "Loading";
  if (role === "co_owner") return "Co-owner";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export default function AppLayout() {
  const {
    user,
    role,
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    workspaceLoading,
    switchWorkspace,
    switchAccountMode,
    logout,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const { hasFeature, loading: subscriptionLoading } = useSubscription();
  const { unreadCount } = useNotificationCenter();

  useEffect(() => {
    const routeLabel = nav.find((item) => location.pathname.startsWith(item.to))?.label;
    document.title = routeLabel === "Dashboard"
      ? "YardPilot"
      : routeLabel ? `${routeLabel} · YardPilot` : "YardPilot";
  }, [location.pathname]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(initialDarkMode);
  const mainScrollRef = useRef<HTMLElement | null>(null);

  const visibleNav = useMemo(
    () => nav.filter((item) => role && item.roles.includes(role)),
    [role]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("yardpilot-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  useEffect(() => {
    document.body.classList.add("yardpilot-app-open");
    return () => document.body.classList.remove("yardpilot-app-open");
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
    const activeElement = document.activeElement;
    if (
      activeElement instanceof HTMLElement &&
      ["INPUT", "TEXTAREA", "SELECT"].includes(activeElement.tagName)
    ) {
      activeElement.blur();
    }
    mainScrollRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [location.pathname]);

  if (!user) return <Navigate to="/login" replace />;

  if (!subscriptionLoading && (role === "manager" || role === "employee") && !hasFeature("team")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
          <LockKeyhole className="mx-auto" size={28} />
          <h1 className="mt-4 text-2xl font-bold">Workspace team access is paused</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">The workspace owner must restore YardPilot Pro before managers and employees can use this workspace. Existing records remain saved.</p>
          <button type="button" onClick={() => void handleLogout()} className="mt-6 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Sign out</button>
        </div>
      </div>
    );
  }

  async function handleLogout() {
    try {
      await logout();
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Could not sign out:", error);
    }
  }

  async function handleWorkspaceChange(workspaceId: string) {
    try {
      await switchWorkspace(workspaceId);
      navigate("/app/dashboard");
      setSidebarOpen(false);
    } catch (error) {
      console.error("Could not switch workspace:", error);
    }
  }

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5 px-1">
          <div className="w-9 h-9 rounded-lg border border-white/15 bg-[#353c38] flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/yardpilot-logo.png"
              alt="YardPilot logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p
              className="text-white font-bold text-sm"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              YardPilot
            </p>
            <p className="text-[#b7c5bc] text-xs truncate">
              {activeWorkspace?.name || user.company || "Workspace"}
            </p>
          </div>
        </div>

        {workspaces.length > 1 && (
          <select
            value={activeWorkspaceId ?? ""}
            onChange={(event) => void handleWorkspaceChange(event.target.value)}
            disabled={workspaceLoading}
            className="mt-4 w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none"
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id} className="text-gray-900">
                {workspace.name} · {workspace.kind === "workgroup" ? "Workgroup" : workspace.kind === "company" ? "Company" : "Personal"} · {roleLabel(workspace.role)}
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ to, icon: Icon, label, feature }) => {
          const active =
            location.pathname === to ||
            (to !== "/app/dashboard" && location.pathname.startsWith(to));

          const locked = Boolean(feature && !hasFeature(feature));
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-white/10 text-white"
                  : "text-[#c4cec8] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                size={17}
                className={active ? "text-[#b9c9bf]" : "text-[#829087]"}
              />
              {label}
              {to === "/app/notifications" && unreadCount > 0 && (
                <span className="ml-auto min-w-5 rounded-full bg-emerald-500 px-1.5 py-0.5 text-center text-[10px] font-bold text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
              {locked && <LockKeyhole size={13} className="ml-auto text-[#98a79e]" />}
              {active && !locked && (
                <ChevronRight size={14} className="ml-auto text-[#b9c9bf]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => setDarkMode((current) => !current)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[#c4cec8] hover:bg-white/5 hover:text-white transition-colors mb-2"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>

        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-[#71877a] flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              {user.name}
            </p>
            <p className="text-[#98a79e] text-xs truncate">
              {roleLabel(role)}
            </p>
          </div>
        </div>
        {user.availableModes?.includes("client") && (
          <button
            type="button"
            onClick={() => void switchAccountMode("client").then(() => navigate("/client/market"))}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#aebbb3] hover:bg-white/5 hover:text-white"
          >
            <Repeat2 size={15} /> Switch to client mode
          </button>
        )}
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-[#aebbb3] hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 px-3 text-[10px] text-[#8f9a94]">
          <Link to="/terms" className="hover:text-white">Terms</Link>
          <Link to="/privacy" className="hover:text-white">Privacy</Link>
          <Link to="/faq" className="hover:text-white">FAQ</Link>
          <Link to="/contact" className="hover:text-white">Contact</Link>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="app-shell flex h-[100dvh] min-h-0 bg-[#e8ebe9] overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <aside className="hidden md:flex flex-col w-60 bg-[#2b312e] shrink-0">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 bg-[#2b312e] flex flex-col min-h-0">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="text-white font-bold">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="text-white/60 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <Sidebar />
            </div>
          </div>
          <button
            type="button"
            aria-label="Close menu"
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        <header className="bg-[#303633] border-b border-[#414844] px-5 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-300 hover:text-white"
          >
            <Menu size={20} />
          </button>
          <div className="hidden md:block min-w-0">
            <p className="text-sm text-gray-300 truncate">
              Welcome back, {" "}
              <span className="font-semibold text-white">
                {user.name.split(" ")[0]}
              </span>
              {activeWorkspace && (
                <span className="text-gray-400"> · {activeWorkspace.name}</span>
              )}
            </p>
          </div>
          <Link
            to={role === "employee" ? "/app/marketplace" : "/app/estimate/new"}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#71877a] text-white text-sm font-semibold rounded-lg hover:bg-[#607568]"
          >
            <PlusCircle size={15} />
            {role === "employee" ? "Find work" : "New Estimate"}
          </Link>
        </header>

        <main ref={mainScrollRef} className="app-page-scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          <RouteAnalytics />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
