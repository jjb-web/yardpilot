import { useEffect, useMemo, useState } from "react";
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
  Sun,
  User,
  Users,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { WorkspaceRole } from "../data/types";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: WorkspaceRole[];
};

const nav: NavItem[] = [
  {
    to: "/app/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    roles: ["owner", "partner", "employee"],
  },
  {
    to: "/app/contacts",
    icon: Users,
    label: "Contacts",
    roles: ["owner", "partner"],
  },
  {
    to: "/app/estimates",
    icon: FileText,
    label: "Estimates",
    roles: ["owner", "partner"],
  },
  {
    to: "/app/estimate/new",
    icon: PlusCircle,
    label: "New Estimate",
    roles: ["owner", "partner"],
  },
  {
    to: "/app/projects/current",
    icon: FolderOpen,
    label: "Jobs",
    roles: ["owner", "partner", "employee"],
  },
  {
    to: "/app/projects/past",
    icon: Archive,
    label: "Past Projects",
    roles: ["owner", "partner"],
  },
  {
    to: "/app/invoices",
    icon: ReceiptText,
    label: "Invoices",
    roles: ["owner", "partner"],
  },
  {
    to: "/app/schedule",
    icon: CalendarDays,
    label: "Schedule",
    roles: ["owner", "partner", "employee"],
  },
  {
    to: "/app/follow-ups",
    icon: BellRing,
    label: "Follow-ups",
    roles: ["owner", "partner", "employee"],
  },
  {
    to: "/app/team",
    icon: Users,
    label: "Team",
    roles: ["owner", "partner", "employee"],
  },
  {
    to: "/app/account",
    icon: User,
    label: "Account",
    roles: ["owner", "partner", "employee"],
  },
];

function initialDarkMode() {
  const saved = localStorage.getItem("yardpilot-theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function roleLabel(role: WorkspaceRole | null) {
  if (!role) return "Loading";
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
    logout,
  } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(initialDarkMode);

  const visibleNav = useMemo(
    () => nav.filter((item) => role && item.roles.includes(role)),
    [role]
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    localStorage.setItem("yardpilot-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  if (!user) return <Navigate to="/login" replace />;

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
          <div className="w-9 h-9 bg-green-400 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/yardpilot-logo.png"
              alt="YardPilotUSA logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div className="min-w-0">
            <p
              className="text-white font-bold text-sm"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              YardPilotUSA
            </p>
            <p className="text-green-400/80 text-xs truncate">
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
                {workspace.name} · {workspace.role}
              </option>
            ))}
          </select>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleNav.map(({ to, icon: Icon, label }) => {
          const active =
            location.pathname === to ||
            (to !== "/app/dashboard" && location.pathname.startsWith(to));

          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-green-500/20 text-white"
                  : "text-green-200/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon
                size={17}
                className={active ? "text-green-400" : "text-green-400/50"}
              />
              {label}
              {active && (
                <ChevronRight size={14} className="ml-auto text-green-400" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => setDarkMode((current) => !current)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-green-200/70 hover:bg-white/5 hover:text-white transition-colors mb-2"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>

        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">
              {user.name}
            </p>
            <p className="text-green-400/60 text-xs truncate">
              {roleLabel(role)}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-green-200/60 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div
      className="app-shell flex h-screen bg-gray-50 overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <aside className="hidden md:flex flex-col w-60 bg-green-950 shrink-0">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-72 bg-green-950 flex flex-col">
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
            <div className="flex-1 overflow-y-auto">
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-5 sm:px-6 py-3.5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-500 hover:text-gray-800"
          >
            <Menu size={20} />
          </button>
          <div className="hidden md:block min-w-0">
            <p className="text-sm text-gray-500 truncate">
              Welcome back, {" "}
              <span className="font-semibold text-gray-900">
                {user.name.split(" ")[0]}
              </span>
              {activeWorkspace && (
                <span className="text-gray-400"> · {activeWorkspace.name}</span>
              )}
            </p>
          </div>
          <Link
            to={role === "employee" ? "/app/team" : "/app/estimate/new"}
            className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800"
          >
            <PlusCircle size={15} />
            {role === "employee" ? "Propose Job" : "New Estimate"}
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
