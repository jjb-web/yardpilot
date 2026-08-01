import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  FileBadge,
  CreditCard,
  LogOut,
  Menu,
  MessageSquareText,
  User,
  X,
} from "lucide-react";
import { Link, Navigate, Outlet, useLocation, useNavigate } from "react-router";
import { useApp } from "../context/AppContext";

const nav = [
  { to: "/client/market", label: "Landscaper Market", icon: BriefcaseBusiness },
  { to: "/client/requests", label: "My Bid Requests", icon: FileBadge },
  { to: "/client/payments", label: "Payments", icon: CreditCard },
  { to: "/client/feedback", label: "Feedback & review", icon: MessageSquareText },
  { to: "/client/account", label: "Account", icon: User },
];

export default function ClientLayout() {
  const { user, logout } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const item = nav.find((entry) => location.pathname.startsWith(entry.to));
    document.title = item ? `${item.label} · YardPilotUSA` : "YardPilotUSA";
  }, [location.pathname]);

  if (!user) return <Navigate to="/login" replace />;

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  const Sidebar = () => (
    <div className="flex h-full flex-col">
      <div className="border-b border-white/10 px-4 py-5">
        <Link to="/client/market" className="flex items-center gap-2.5 px-1">
          <div className="h-9 w-9 overflow-hidden rounded-lg border border-white/15 bg-[#353c38]">
            <img src="/yardpilot-logo.png" alt="YardPilotUSA" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">YardPilotUSA</p>
            <p className="text-xs text-[#b7c5bc]">Client marketplace</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map(({ to, label, icon: Icon }) => {
          const active = location.pathname === to || location.pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? "bg-white/10 text-white"
                  : "text-[#c4cec8] hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={17} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-3 py-4">
        <div className="mb-2 flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#71877a] text-xs font-bold text-white">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold text-white">{user.name}</p>
            <p className="text-xs text-[#98a79e]">Client</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[#aebbb3] hover:bg-white/5 hover:text-white"
        >
          <LogOut size={15} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden bg-[#e8ebe9]">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#2b312e] md:flex">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="flex w-72 flex-col bg-[#2b312e]">
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
              <span className="font-bold text-white">Menu</span>
              <button type="button" onClick={() => setSidebarOpen(false)} className="text-white/70">
                <X size={20} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto"><Sidebar /></div>
          </div>
          <button type="button" aria-label="Close menu" className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-[#414844] bg-[#303633] px-5 py-3.5 sm:px-6">
          <button type="button" onClick={() => setSidebarOpen(true)} className="text-gray-300 md:hidden">
            <Menu size={20} />
          </button>
          <p className="hidden truncate text-sm text-gray-300 md:block">
            Find qualified landscaping businesses near you.
          </p>
          <Link to="/client/requests" className="rounded-lg bg-[#71877a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#607568]">
            Post a project
          </Link>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
