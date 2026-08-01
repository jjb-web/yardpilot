import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

export default function ClientAccount() {
  const { user, updateProfile } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", company: "", phone: "", city: "", state: "" });
  const [saving, setSaving] = useState(false);
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
    const { error: rpcError } = await supabase.rpc("set_my_account_type", {
      requested_account_type: "landscaper",
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    window.location.assign("/app/dashboard");
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Client account</h1>
        <p className="mt-1 text-sm text-slate-500">Your city and state are used as the default marketplace search area.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Full name
            <input value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Phone
            <input value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">City
            <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">State
            <input value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} placeholder="OR" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving && <Loader2 size={16} className="animate-spin" />} Save account
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900">Run or join a landscaping business</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Switching to a landscaper account opens the existing YardPilot business application, company workspaces, team invitations, hiring market, and bidding market.</p>
        <button type="button" onClick={() => void becomeLandscaper()} disabled={saving} className="mt-4 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
          Switch to landscaper account
        </button>
      </section>
    </div>
  );
}
