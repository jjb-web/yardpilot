import { useEffect, useState } from "react";
import {
  Building2,
  Mail,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useApp } from "../context/AppContext";

export default function Account() {
  const {
    user,
    authUserId,
    activeWorkspace,
    role,
    workspaceMembers,
    updateProfile,
    updateMyWorkspaceRate,
  } = useApp();

  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    city: "",
    state: "",
  });
  const [saving, setSaving] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);
  const [positionTitle, setPositionTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      company: user.company,
      phone: user.phone,
      city: user.city,
      state: user.state,
    });
  }, [user]);

  useEffect(() => {
    const membership = workspaceMembers.find(
      (member) => member.userId === authUserId
    );
    setPositionTitle(membership?.positionTitle ?? "");
    setHourlyRate(
      membership ? String(membership.hourlyRate || "") : ""
    );
  }, [workspaceMembers, authUserId, activeWorkspace?.id]);

  const cardClass = "rounded-xl border border-gray-200 bg-white p-5 sm:p-6";
  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/25";
  const labelClass =
    "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5";

  async function saveProfile() {
    setMessage("");
    setError("");
    if (!form.name.trim()) {
      setError("Enter your name before saving.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(form);
      setMessage("Profile updated.");
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Your profile could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveWorkspaceRate() {
    setMessage("");
    setError("");
    setRateSaving(true);
    try {
      await updateMyWorkspaceRate(
        positionTitle,
        Number(hourlyRate || 0)
      );
      setMessage("Workspace labor profile updated.");
    } catch (rateError) {
      setError(
        rateError instanceof Error
          ? rateError.message
          : "Your labor profile could not be updated."
      );
    } finally {
      setRateSaving(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Edit your personal profile. Your login email cannot be changed here.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-xl font-bold text-white">
            {user?.name?.charAt(0) || "Y"}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="truncate text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={14} /> Name
              </span>
            </label>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={14} /> Login Email
              </span>
            </label>
            <input
              value={user?.email ?? ""}
              readOnly
              className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Email is controlled by your authentication account and cannot be edited on this page.
            </p>
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} /> Phone
              </span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} /> Optional Business Label
              </span>
            </label>
            <input
              value={form.company}
              onChange={(event) =>
                setForm((current) => ({ ...current, company: event.target.value }))
              }
              placeholder="Solo contractor, business name, or blank"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-gray-400">
              This does not create or claim a company workspace.
            </p>
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} /> City
              </span>
            </label>
            <input
              value={form.city}
              onChange={(event) =>
                setForm((current) => ({ ...current, city: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>State / Region</label>
            <input
              value={form.state}
              onChange={(event) =>
                setForm((current) => ({ ...current, state: event.target.value }))
              }
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
          >
            <Save size={16} /> {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={18} className="text-slate-700" />
          <h2 className="font-bold text-gray-900">My labor profile</h2>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          This rate is internal and is used when you assign yourself hours on an estimate. It is stored separately for each workspace.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Position / Title</label>
            <input
              value={positionTitle}
              onChange={(event) => setPositionTitle(event.target.value)}
              placeholder="Owner, Crew Lead, Designer…"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Internal Hourly Rate</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(event) =>
                  setHourlyRate(event.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="0.00"
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void saveWorkspaceRate()}
            disabled={rateSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
          >
            <Save size={16} /> {rateSaving ? "Saving…" : "Save Labor Profile"}
          </button>
        </div>
      </div>

      <div className={cardClass}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-slate-700" />
          <h2 className="font-bold text-gray-900">Workspace access</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className={labelClass}>Workspace</p>
            <p className="mt-1 font-semibold text-gray-900">
              {activeWorkspace?.name || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Role</p>
            <p className="mt-1 font-semibold capitalize text-gray-900">
              {role === "co_owner" ? "Co-owner" : role || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Team size</p>
            <p className="mt-1 font-semibold text-gray-900">
              {workspaceMembers.length}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
