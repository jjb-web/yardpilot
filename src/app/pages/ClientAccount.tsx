import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";

export default function ClientAccount() {
  const { user, updateProfile, switchAccountMode, deleteAccount } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", company: "", phone: "", city: "", state: "" });
  const [saving, setSaving] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [accountDeleteError, setAccountDeleteError] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setForm({ name: user.name, company: user.company, phone: user.phone, city: user.city, state: user.state });
  }, [user]);

  async function save() {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await updateProfile(form);
      setMessage("Account details saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your account.");
    } finally {
      setSaving(false);
    }
  }

  async function becomeLandscaper() {
    setSaving(true);
    setError("");
    try {
      await switchAccountMode("landscaper");
      navigate("/app/dashboard");
    } catch (switchError) {
      setError(switchError instanceof Error ? switchError.message : "Could not enable landscaper mode.");
    } finally {
      setSaving(false);
    }
  }

  async function removeAccount() {
    const confirmed = window.confirm(
      "Permanently delete your YardPilotUSA account? Your personal and sole-owned workspace data will be deleted from Supabase. Shared company records are preserved. This cannot be undone."
    );
    if (!confirmed) return;

    const typed = window.prompt(
      'Type DELETE to permanently delete your account.'
    );
    if (typed !== "DELETE") return;

    setDeletingAccount(true);
    setAccountDeleteError("");
    setError("");
    setMessage("");

    try {
      await deleteAccount();
      window.location.replace("/");
    } catch (deleteFailure) {
      const message =
        deleteFailure instanceof Error
          ? deleteFailure.message
          : "The account could not be deleted.";
      setAccountDeleteError(message);
      setError(message);
    } finally {
      setDeletingAccount(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Client account</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Your city and state are used as the default marketplace search area.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Full name
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Phone
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">City
            <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">State
            <input value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} placeholder="OR" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-slate-200 dark:text-slate-950">
          {saving && <Loader2 size={16} className="animate-spin" />} Save account
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Run or join a landscaping business</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">One login can use both client and landscaper modes. Enabling landscaper mode opens a personal worker workspace, company workspaces, team invitations, the hiring market, and the bidding market without deleting your client profile.</p>
        <button type="button" onClick={() => void becomeLandscaper()} disabled={saving} className="mt-4 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
          Enable and switch to landscaper mode
        </button>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-6 shadow-sm dark:border-red-900 dark:bg-red-950/30">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-red-800 dark:text-red-200">
              <AlertTriangle size={18} />
              <h2 className="text-lg font-bold">Delete account</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-red-700 dark:text-red-300">
              Permanently deletes your login, client data, personal workspace, sole-owned workspaces, uploaded personal files, and other account-scoped Supabase records. Shared company records are transferred to the workspace owner or anonymized instead of being destroyed.
            </p>
            {accountDeleteError && (
              <p className="mt-3 rounded-lg border border-red-300 bg-white px-3 py-2 text-sm font-medium text-red-800 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200">
                {accountDeleteError}
              </p>
            )}
          </div>
          <button type="button" onClick={() => void removeAccount()} disabled={deletingAccount} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {deletingAccount ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {deletingAccount ? "Deleting…" : "Delete account"}
          </button>
        </div>
      </section>
    </div>
  );
}
