import { useEffect, useState } from "react";
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  Navigate,
} from "react-router";
import {
  LayoutDashboard,
  FolderOpen,
  Archive,
  PlusCircle,
  User,
  Users,
  Menu,
  X,
  LogOut,
  ChevronRight,
  FileText,
  Moon,
  Sun,
} from "lucide-react";
import { useApp } from "../context/AppContext";

const nav = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/contacts", icon: Users, label: "Contacts" },
  { to: "/app/estimates", icon: FileText, label: "Estimates" },
  { to: "/app/estimate/new", icon: PlusCircle, label: "New Estimate" },
  { to: "/app/projects/current", icon: FolderOpen, label: "Current Jobs" },
  { to: "/app/projects/past", icon: Archive, label: "Past Projects" },
  { to: "/app/account", icon: User, label: "Account" },
];

function initialDarkMode() {
  const saved = localStorage.getItem("yardpilot-theme");
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function AppLayout() {
  const { user, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(initialDarkMode);

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

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-400 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            <img
              src="/yardpilot-logo.png"
              alt="YardPilotUSA logo"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <p className="text-white font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              YardPilotUSA
            </p>
            <p className="text-green-400 text-xs truncate max-w-[140px]">
              {user.company}
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => {
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
              {active && <ChevronRight size={14} className="ml-auto text-green-400" />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        <button
          type="button"
          onClick={() => setDarkMode((current) => !current)}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-green-200/70 hover:bg-white/5 hover:text-white transition-colors cursor-pointer mb-2"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          {darkMode ? "Light mode" : "Dark mode"}
        </button>

        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
            {user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-semibold truncate">{user.name}</p>
            <p className="text-green-400/60 text-xs truncate">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-green-200/60 hover:bg-white/5 hover:text-white transition-colors cursor-pointer"
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
      <aside className="hidden md:flex flex-col w-56 bg-green-950 shrink-0">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 bg-green-950 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="text-white font-bold">Menu</span>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="text-white/60 hover:text-white cursor-pointer"
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
            className="flex-1 bg-black/40 cursor-default"
            onClick={() => setSidebarOpen(false)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
          >
            <Menu size={20} />
          </button>
          <div className="hidden md:block">
            <p className="text-sm text-gray-500">
              Welcome back, <span className="font-semibold text-gray-900">{user.name.split(" ")[0]}</span>
            </p>
          </div>
          <Link
            to="/app/estimate/new"
            className="flex items-center gap-1.5 px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
          >
            <PlusCircle size={15} /> New Estimate
          </Link>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
