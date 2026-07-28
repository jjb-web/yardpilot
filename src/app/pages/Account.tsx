import { Building2, Mail, Phone, ShieldCheck, UserRound } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Account() {
  const { user, activeWorkspace, role, workspaceMembers } = useApp();

  const cardClass = "rounded-xl border border-gray-200 bg-white p-6";
  const labelClass =
    "text-xs font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-7">Account</h1>

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-full bg-green-700 text-white flex items-center justify-center text-xl font-bold">
            {user?.name?.charAt(0) || "Y"}
          </div>
          <div>
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-500">
              <UserRound size={15} /> <span className={labelClass}>Name</span>
            </div>
            <p className="font-semibold text-gray-900">{user?.name || "—"}</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-500">
              <Mail size={15} /> <span className={labelClass}>Email</span>
            </div>
            <p className="font-semibold text-gray-900 break-all">
              {user?.email || "—"}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-500">
              <Building2 size={15} /> <span className={labelClass}>Company</span>
            </div>
            <p className="font-semibold text-gray-900">
              {user?.company || activeWorkspace?.name || "—"}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center gap-2 mb-2 text-gray-500">
              <Phone size={15} /> <span className={labelClass}>Phone</span>
            </div>
            <p className="font-semibold text-gray-900">{user?.phone || "—"}</p>
          </div>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-green-700" />
          <h2 className="font-bold text-gray-900">Workspace access</h2>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className={labelClass}>Workspace</p>
            <p className="font-semibold text-gray-900 mt-1">
              {activeWorkspace?.name || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Role</p>
            <p className="font-semibold text-gray-900 mt-1 capitalize">
              {role || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Team size</p>
            <p className="font-semibold text-gray-900 mt-1">
              {workspaceMembers.length}
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-5">
          Estimates, contacts, properties, schedules, and team data are stored in
          the currently selected workspace.
        </p>
      </div>
    </div>
  );
}
