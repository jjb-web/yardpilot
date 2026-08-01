import { useEffect, useState } from "react";
import { Building2, Loader2, MapPin, Save } from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

type FormState = {
  displayName: string;
  headline: string;
  description: string;
  services: string;
  city: string;
  state: string;
  postalCode: string;
  serviceRadiusMiles: string;
  published: boolean;
  acceptingClientWork: boolean;
  hiring: boolean;
  availabilityNote: string;
  websiteUrl: string;
  publicEmail: string;
  publicPhone: string;
};

export default function MarketplaceCompany() {
  const { activeWorkspace, activeWorkspaceId, authUserId, role } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const [form, setForm] = useState<FormState>({
    displayName: "",
    headline: "",
    description: "",
    services: "",
    city: "",
    state: "",
    postalCode: "",
    serviceRadiusMiles: "25",
    published: false,
    acceptingClientWork: false,
    hiring: false,
    availabilityNote: "",
    websiteUrl: "",
    publicEmail: "",
    publicPhone: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!activeWorkspaceId) return;
      setLoading(true);
      const { data, error: loadError } = await supabase
        .from("marketplace_business_profiles")
        .select("*")
        .eq("workspace_id", activeWorkspaceId)
        .maybeSingle();
      if (!active) return;
      if (loadError) setError(loadError.message);
      else if (data) {
        setForm({
          displayName: data.display_name ?? activeWorkspace?.name ?? "",
          headline: data.headline ?? "",
          description: data.description ?? "",
          services: Array.isArray(data.services) ? data.services.join(", ") : "",
          city: data.city ?? "",
          state: data.state ?? "",
          postalCode: data.postal_code ?? "",
          serviceRadiusMiles: String(data.service_radius_miles ?? 25),
          published: Boolean(data.published),
          acceptingClientWork: Boolean(data.accepting_client_work),
          hiring: Boolean(data.hiring),
          availabilityNote: data.availability_note ?? "",
          websiteUrl: data.website_url ?? "",
          publicEmail: data.public_email ?? "",
          publicPhone: data.public_phone ?? "",
        });
      } else {
        setForm((current) => ({ ...current, displayName: activeWorkspace?.name ?? "" }));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [activeWorkspaceId, activeWorkspace?.name]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!activeWorkspaceId || !authUserId) return;
    if (!canManage) {
      setError("Only an owner, co-owner, or manager can publish a workspace.");
      return;
    }
    if (activeWorkspace?.kind === "personal") {
      setError("Create a Company or Workgroup workspace from Team before publishing on the marketplace.");
      return;
    }
    if (!form.displayName.trim()) {
      setError("Enter a public business name.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    const payload = {
      workspace_id: activeWorkspaceId,
      display_name: form.displayName.trim(),
      headline: form.headline.trim(),
      description: form.description.trim(),
      services: form.services.split(",").map((value) => value.trim()).filter(Boolean),
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postalCode.trim(),
      service_radius_miles: Math.max(1, Number(form.serviceRadiusMiles || 25)),
      published: form.published,
      accepting_client_work: form.acceptingClientWork,
      hiring: form.hiring,
      availability_note: form.availabilityNote.trim(),
      website_url: form.websiteUrl.trim(),
      public_email: form.publicEmail.trim(),
      public_phone: form.publicPhone.trim(),
      created_by: authUserId,
    };
    const { error: saveError } = await supabase
      .from("marketplace_business_profiles")
      .upsert(payload, { onConflict: "workspace_id" });
    setSaving(false);
    if (saveError) setError(saveError.message);
    else setMessage(form.published ? "Your workspace is published in the marketplace." : "Marketplace profile saved as unpublished.");
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading marketplace profile…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Building2 size={21} /> Company listing</h2>
        <p className="mt-1 text-sm text-slate-500">Publish a Company or Workgroup so clients and potential employees can find it.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      {activeWorkspace?.kind === "personal" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Personal workspaces cannot be published. Create or switch to a Company or Workgroup workspace first.
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Public business name
            <input value={form.displayName} onChange={(event) => set("displayName", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Headline
            <input value={form.headline} onChange={(event) => set("headline", event.target.value)} placeholder="Residential lawn and landscape care" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700">Description
            <textarea value={form.description} onChange={(event) => set("description", event.target.value)} rows={6} placeholder="Describe the company, specialties, service standards, and experience." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700">Services
            <input value={form.services} onChange={(event) => set("services", event.target.value)} placeholder="Lawn care, mulch, cleanup, irrigation" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            <span className="mt-1 block text-xs text-slate-400">Separate services with commas.</span>
          </label>
          <label className="text-sm font-medium text-slate-700">City
            <input value={form.city} onChange={(event) => set("city", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">State
            <input value={form.state} onChange={(event) => set("state", event.target.value)} placeholder="OR" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Postal code
            <input value={form.postalCode} onChange={(event) => set("postalCode", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Service radius in miles
            <div className="relative mt-1"><MapPin className="absolute left-3 top-3 text-slate-400" size={16} /><input type="number" min="1" max="500" value={form.serviceRadiusMiles} onChange={(event) => set("serviceRadiusMiles", event.target.value)} className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3" /></div>
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700">Availability note
            <input value={form.availabilityNote} onChange={(event) => set("availabilityNote", event.target.value)} placeholder="Booking new projects two weeks out" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Public phone
            <input value={form.publicPhone} onChange={(event) => set("publicPhone", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Public email
            <input type="email" value={form.publicEmail} onChange={(event) => set("publicEmail", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700">Website
            <input type="url" value={form.websiteUrl} onChange={(event) => set("websiteUrl", event.target.value)} placeholder="https://" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.published} onChange={(event) => set("published", event.target.checked)} /> Published</label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.acceptingClientWork} onChange={(event) => set("acceptingClientWork", event.target.checked)} /> Accepting client work</label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700"><input type="checkbox" checked={form.hiring} onChange={(event) => set("hiring", event.target.checked)} /> Hiring</label>
        </div>

        <button type="button" onClick={() => void save()} disabled={!canManage || saving || activeWorkspace?.kind === "personal"} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save marketplace listing
        </button>
      </section>
    </div>
  );
}
