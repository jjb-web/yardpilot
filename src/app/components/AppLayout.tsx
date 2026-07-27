import { useState } from "react";
import { Link, Outlet, useLocation, useNavigate, Navigate } from "react-router";
import {
  LayoutDashboard, FolderOpen, Archive, PlusCircle, User, Leaf,
  Menu, X, LogOut, ChevronRight,
} from "lucide-react";
import { useApp } from "../context/AppContext";

const nav = [
  { to: "/app/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/app/estimate/new", icon: PlusCircle, label: "New Estimate" },
  { to: "/app/projects/current", icon: FolderOpen, label: "Current Jobs" },
  { to: "/app/projects/past", icon: Archive, label: "Past Projects" },
  { to: "/app/account", icon: User, label: "Account" },
];

export default function AppLayout() {
  const { user, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  function handleLogout() { logout(); navigate("/"); }

  const Sidebar = ({ mobile = false }: { mobile?: boolean }) => (
    <div className={`flex flex-col h-full ${mobile ? "" : ""}`}>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-green-400 rounded-lg flex items-center justify-center shrink-0">
            <Leaf size={16} className="text-green-950" />
          </div>
          <div>
            <p className="text-white font-bold text-sm" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>GreenEdge</p>
            <p className="text-green-400 text-xs truncate max-w-[140px]">{user.company}</p>
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to || (to !== "/app/dashboard" && location.pathname.startsWith(to));
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
              <Icon size={17} className={active ? "text-green-400" : "text-green-400/50"} />
              {label}
              {active && <ChevronRight size={14} className="ml-auto text-green-400" />}
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="px-3 py-4 border-t border-white/10">
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
          onClick={handleLogout}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-green-200/60 hover:bg-white/5 hover:text-white transition-colors"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-green-950 shrink-0">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-64 bg-green-950 flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="text-white font-bold" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Menu</span>
              <button onClick={() => setSidebarOpen(false)} className="text-white/60 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <Sidebar mobile />
            </div>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-6 py-3.5 flex items-center justify-between shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="md:hidden text-gray-500 hover:text-gray-800 transition-colors"
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

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
