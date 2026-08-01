import { useEffect, useState } from "react";
import {
  BriefcaseBusiness,
  Loader2,
  MapPin,
  PauseCircle,
  PlayCircle,
  PlusCircle,
  Save,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

type ManagedOpening = {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  employment_type: string;
  compensation_type: string;
  pay_min: number | null;
  pay_max: number | null;
  city: string;
  state: string;
  postal_code: string;
  active: boolean;
  expires_at: string | null;
  created_at: string;
};

const emptyForm = {
  title: "",
  description: "",
  employmentType: "full_time",
  compensationType: "hourly",
  payMin: "",
  payMax: "",
  city: "",
  state: "",
  postalCode: "",
  expiresAt: "",
};

export default function MarketplaceJobOpenings() {
  const { user, authUserId, activeWorkspace, activeWorkspaceId, role } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const businessWorkspace = activeWorkspace?.kind === "company" || activeWorkspace?.kind === "workgroup";

  const [openings, setOpenings] = useState<ManagedOpening[]>([]);
  const [listingPublished, setListingPublished] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm, city: user?.city ?? "", state: user?.state ?? "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!activeWorkspaceId || !canManage) {
      setOpenings([]);
      setListingPublished(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    const [{ data: openingRows, error: openingError }, { data: profile, error: profileError }] = await Promise.all([
      supabase
        .from("marketplace_job_openings")
        .select("*")
        .eq("workspace_id", activeWorkspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("marketplace_business_profiles")
        .select("published, city, state, postal_code")
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle(),
    ]);
    setLoading(false);

    if (openingError || profileError) {
      setError(openingError?.message || profileError?.message || "Could not load job openings.");
      return;
    }

    setOpenings((openingRows ?? []) as ManagedOpening[]);
    setListingPublished(Boolean(profile?.published));
    setForm((current) => ({
      ...current,
      city: current.city || profile?.city || user?.city || "",
      state: current.state || profile?.state || user?.state || "",
      postalCode: current.postalCode || profile?.postal_code || "",
    }));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, role]);

  async function createOpening() {
    if (!authUserId || !activeWorkspaceId) return;
    if (!canManage || !businessWorkspace) {
      setError("Switch to a Company or Workgroup as an owner or manager before publishing an opening.");
      return;
    }
    if (!listingPublished) {
      setError("Publish the active workspace under Company listing before publishing a job opening.");
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      setError("Enter a job title and description.");
      return;
    }

    setBusy("create");
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("marketplace_job_openings").insert({
      workspace_id: activeWorkspaceId,
      title: form.title.trim(),
      description: form.description.trim(),
      employment_type: form.employmentType,
      compensation_type: form.compensationType,
      pay_min: form.payMin ? Number(form.payMin) : null,
      pay_max: form.payMax ? Number(form.payMax) : null,
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postalCode.trim(),
      expires_at: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      active: true,
      created_by: authUserId,
    });
    setBusy("");

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm((current) => ({ ...emptyForm, city: current.city, state: current.state, postalCode: current.postalCode }));
    setShowForm(false);
    setMessage("Job opening published. It is now visible in the hiring market.");
    await load();
  }

  async function setOpeningActive(opening: ManagedOpening, active: boolean) {
    setBusy(opening.id);
    setError("");
    setMessage("");
    const { error: updateError } = await supabase
      .from("marketplace_job_openings")
      .update({ active })
      .eq("id", opening.id)
      .eq("workspace_id", activeWorkspaceId);
    setBusy("");

    if (updateError) {
      setError(updateError.message);
      return;
    }
    setMessage(active ? "Opening republished." : "Opening paused. Existing applications remain saved.");
    await load();
  }

  if (!canManage) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">Only an owner, co-owner, or manager can publish openings.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><BriefcaseBusiness size={21} /> Publish job openings</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create, pause, and republish employee openings for the active company or workgroup.</p>
        </div>
        <button type="button" onClick={() => setShowForm((current) => !current)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">
          <PlusCircle size={16} /> {showForm ? "Close form" : "New opening"}
        </button>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</div>}
      {!businessWorkspace && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Switch from a Personal workspace to a Company or Workgroup to publish openings.</div>}
      {businessWorkspace && !listingPublished && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Publish the active workspace in the Company listing tab first. Openings from unpublished companies are not shown publicly.</div>}

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="font-bold text-slate-900 dark:text-white">New job opening</h3>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Job title
              <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Description
              <textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Employment type
              <select value={form.employmentType} onChange={(event) => setForm((current) => ({ ...current, employmentType: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                <option value="full_time">Full time</option><option value="part_time">Part time</option><option value="seasonal">Seasonal</option><option value="contract">Contract</option><option value="temporary">Temporary</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Compensation type
              <select value={form.compensationType} onChange={(event) => setForm((current) => ({ ...current, compensationType: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5">
                <option value="hourly">Hourly</option><option value="salary">Salary</option><option value="project">Per project</option><option value="discuss">Discuss</option>
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Minimum pay
              <input type="number" min="0" value={form.payMin} onChange={(event) => setForm((current) => ({ ...current, payMin: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Maximum pay
              <input type="number" min="0" value={form.payMax} onChange={(event) => setForm((current) => ({ ...current, payMax: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">City
              <input value={form.city} onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">State
              <input value={form.state} onChange={(event) => setForm((current) => ({ ...current, state: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postal code
              <input value={form.postalCode} onChange={(event) => setForm((current) => ({ ...current, postalCode: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Application expiration
              <input type="datetime-local" value={form.expiresAt} onChange={(event) => setForm((current) => ({ ...current, expiresAt: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
          </div>
          <button type="button" onClick={() => void createOpening()} disabled={busy === "create" || !businessWorkspace || !listingPublished} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">
            {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Publish opening
          </button>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h3 className="font-bold text-slate-900 dark:text-white">Openings for {activeWorkspace?.name || "active workspace"}</h3>
        <div className="mt-4 space-y-4">
          {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading openings…</p>}
          {!loading && openings.map((opening) => (
            <article key={opening.id} className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-lg font-bold text-slate-900 dark:text-white">{opening.title}</h4>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${opening.active ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}>{opening.active ? "Published" : "Paused"}</span>
                  </div>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><MapPin size={15} /> {[opening.city, opening.state, opening.postal_code].filter(Boolean).join(", ") || "Location not listed"}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{opening.description}</p>
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{opening.employment_type.replaceAll("_", " ")} · {opening.compensation_type}</p>
                  {(opening.pay_min != null || opening.pay_max != null) && <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">${opening.pay_min ?? 0}–${opening.pay_max ?? "open"}</p>}
                </div>
                <button type="button" onClick={() => void setOpeningActive(opening, !opening.active)} disabled={busy === opening.id} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200">
                  {busy === opening.id ? <Loader2 size={16} className="animate-spin" /> : opening.active ? <PauseCircle size={16} /> : <PlayCircle size={16} />}
                  {opening.active ? "Pause" : "Republish"}
                </button>
              </div>
            </article>
          ))}
          {!loading && openings.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No openings have been published for this workspace.</div>}
        </div>
      </section>
    </div>
  );
}
