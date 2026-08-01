import { useEffect, useMemo, useState } from "react";
import {
  FileUp,
  Loader2,
  MapPin,
  Search,
  Send,
  UserRoundSearch,
  XCircle,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import type { MarketplaceOpening, WorkerProfile } from "../data/marketplace";

const PAGE_SIZE = 20;

const emptyWorkerProfile: WorkerProfile = {
  user_id: "",
  headline: "",
  bio: "",
  city: "",
  state: "",
  postal_code: "",
  years_experience: 0,
  skills: [],
  resume_path: null,
  available: true,
};

export default function MarketplaceHiring() {
  const { user, authUserId } = useApp();
  const [profile, setProfile] = useState<WorkerProfile>({
    ...emptyWorkerProfile,
    user_id: authUserId ?? "",
    city: user?.city ?? "",
    state: user?.state ?? "",
  });
  const [skillsText, setSkillsText] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [resumeFile, setResumeFile] = useState<File | null>(null);

  const [query, setQuery] = useState("");
  const [city, setCity] = useState(user?.city ?? "");
  const [state, setState] = useState(user?.state ?? "");
  const [employmentType, setEmploymentType] = useState("");
  const [openings, setOpenings] = useState<MarketplaceOpening[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);

  const [selectedOpening, setSelectedOpening] = useState<MarketplaceOpening | null>(null);
  const [coverNote, setCoverNote] = useState("");
  const [appliedOpeningIds, setAppliedOpeningIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadWorkerProfile() {
    if (!authUserId) return;
    const [{ data: profileRow, error: profileError }, { data: applications, error: applicationsError }] = await Promise.all([
      supabase.from("marketplace_worker_profiles").select("*").eq("user_id", authUserId).maybeSingle(),
      supabase.from("marketplace_job_applications").select("opening_id").eq("applicant_user_id", authUserId),
    ]);

    if (profileError || applicationsError) {
      setError(profileError?.message || applicationsError?.message || "Could not load your marketplace profile.");
      return;
    }
    if (profileRow) {
      const loaded = profileRow as WorkerProfile;
      setProfile(loaded);
      setSkillsText(Array.isArray(loaded.skills) ? loaded.skills.join(", ") : "");
      if (!city) setCity(loaded.city || "");
      if (!state) setState(loaded.state || "");
    }
    setAppliedOpeningIds(new Set((applications ?? []).map((row) => String(row.opening_id))));
  }

  async function searchOpenings(reset = true, overrides?: { city?: string; state?: string }) {
    const nextOffset = reset ? 0 : offset;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("search_marketplace_job_openings", {
      search_query: query.trim(),
      requested_city: (overrides?.city ?? city).trim(),
      requested_state: (overrides?.state ?? state).trim(),
      requested_employment_type: employmentType,
      page_size: PAGE_SIZE,
      page_offset: nextOffset,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const rows = (data ?? []) as MarketplaceOpening[];
    setOpenings((current) => (reset ? rows : [...current, ...rows]));
    setOffset(nextOffset + rows.length);
    const total = Number(rows[0]?.total_count ?? 0);
    setHasMore(nextOffset + rows.length < total);
  }

  useEffect(() => {
    void Promise.all([loadWorkerProfile(), searchOpenings(true)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  async function uploadResume() {
    if (!authUserId || !resumeFile) return profile.resume_path;
    const extension = resumeFile.name.split(".").pop()?.toLowerCase() || "pdf";
    const safeExtension = ["pdf", "doc", "docx"].includes(extension) ? extension : "pdf";
    const path = `${authUserId}/${crypto.randomUUID()}.${safeExtension}`;
    const { error: uploadError } = await supabase.storage
      .from("marketplace-resumes")
      .upload(path, resumeFile, { upsert: false });
    if (uploadError) throw new Error(uploadError.message);
    return path;
  }

  async function saveWorkerProfile() {
    if (!authUserId) return;
    setProfileBusy(true);
    setError("");
    setMessage("");
    try {
      const resumePath = await uploadResume();
      const nextProfile: WorkerProfile = {
        ...profile,
        user_id: authUserId,
        headline: profile.headline.trim(),
        bio: profile.bio.trim(),
        city: profile.city.trim(),
        state: profile.state.trim(),
        postal_code: profile.postal_code.trim(),
        years_experience: Math.max(0, Number(profile.years_experience || 0)),
        skills: skillsText.split(",").map((value) => value.trim()).filter(Boolean),
        resume_path: resumePath ?? null,
      };
      const { error: saveError } = await supabase
        .from("marketplace_worker_profiles")
        .upsert(nextProfile, { onConflict: "user_id" });
      if (saveError) throw new Error(saveError.message);
      setProfile(nextProfile);
      setResumeFile(null);
      setMessage("Your worker profile is ready for applications.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your worker profile.");
    } finally {
      setProfileBusy(false);
    }
  }

  async function apply() {
    if (!authUserId || !selectedOpening) return;
    if (!profile.headline.trim() || !profile.bio.trim()) {
      setError("Save a worker headline and profile before applying.");
      return;
    }
    setBusy("apply");
    setError("");
    const { error: insertError } = await supabase.from("marketplace_job_applications").insert({
      opening_id: selectedOpening.id,
      workspace_id: selectedOpening.workspace_id,
      applicant_user_id: authUserId,
      cover_note: coverNote.trim(),
      resume_path: profile.resume_path,
      profile_snapshot: {
        name: user?.name ?? "",
        email: user?.email ?? "",
        phone: user?.phone ?? "",
        headline: profile.headline,
        bio: profile.bio,
        city: profile.city,
        state: profile.state,
        postalCode: profile.postal_code,
        yearsExperience: profile.years_experience,
        skills: profile.skills,
      },
      status: "submitted",
    });
    setBusy("");
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setAppliedOpeningIds((current) => new Set([...current, selectedOpening.id]));
    setSelectedOpening(null);
    setCoverNote("");
    setMessage("Application submitted. The company can review your profile and resume.");
  }

  const profileComplete = useMemo(
    () => Boolean(profile.headline.trim() && profile.bio.trim()),
    [profile.headline, profile.bio],
  );

  function clearLocation() {
    setCity("");
    setState("");
    void searchOpenings(true, { city: "", state: "" });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white"><UserRoundSearch size={21} /> Find landscaping work</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Build a private worker profile, search local openings, and apply to companies or workgroups.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Your worker profile</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">This profile is attached to applications. It is not a public worker directory.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${profileComplete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"}`}>
            {profileComplete ? "Ready to apply" : "Complete profile"}
          </span>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Professional headline
            <input value={profile.headline} onChange={(event) => setProfile((current) => ({ ...current, headline: event.target.value }))} placeholder="Landscape laborer with irrigation and hardscape experience" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Profile summary
            <textarea value={profile.bio} onChange={(event) => setProfile((current) => ({ ...current, bio: event.target.value }))} rows={5} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">City
            <input value={profile.city} onChange={(event) => setProfile((current) => ({ ...current, city: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">State
            <input value={profile.state} onChange={(event) => setProfile((current) => ({ ...current, state: event.target.value }))} placeholder="OR" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Postal code
            <input value={profile.postal_code} onChange={(event) => setProfile((current) => ({ ...current, postal_code: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Years of experience
            <input type="number" min="0" value={profile.years_experience} onChange={(event) => setProfile((current) => ({ ...current, years_experience: Number(event.target.value) }))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Skills
            <input value={skillsText} onChange={(event) => setSkillsText(event.target.value)} placeholder="Mowing, chainsaw, irrigation, pavers" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Resume file
            <div className="mt-1 flex items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-600">
              <FileUp size={18} className="text-slate-500" />
              <input type="file" accept=".pdf,.doc,.docx" onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)} className="text-sm" />
            </div>
            {profile.resume_path && <span className="mt-1 block text-xs text-emerald-700 dark:text-emerald-300">A private resume is currently attached.</span>}
          </label>
        </div>
        <button type="button" onClick={() => void saveWorkerProfile()} disabled={profileBusy} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">
          {profileBusy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} Save worker profile
        </button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white">Local job openings</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Only 20 matching openings load at a time.</p>
          </div>
          {(city || state) && <button type="button" onClick={clearLocation} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"><XCircle size={16} /> Search all locations</button>}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Job title, company, or skill" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          <input value={state} onChange={(event) => setState(event.target.value)} placeholder="State" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          <select value={employmentType} onChange={(event) => setEmploymentType(event.target.value)} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm sm:col-span-2">
            <option value="">All employment types</option><option value="full_time">Full time</option><option value="part_time">Part time</option><option value="seasonal">Seasonal</option><option value="contract">Contract</option><option value="temporary">Temporary</option>
          </select>
          <button type="button" onClick={() => void searchOpenings(true)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2 dark:bg-emerald-700">{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search openings</button>
        </div>

        <div className="mt-5 space-y-4">
          {openings.map((opening) => (
            <article key={opening.id} className="rounded-xl border border-slate-200 p-5 dark:border-slate-700">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{opening.business_name}</p>
                  <h4 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{opening.title}</h4>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400"><MapPin size={15} /> {[opening.city, opening.state].filter(Boolean).join(", ") || "Location not listed"}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600 dark:text-slate-300">{opening.description}</p>
                  <p className="mt-3 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">{opening.employment_type.replaceAll("_", " ")} · {opening.compensation_type}</p>
                  {(opening.pay_min != null || opening.pay_max != null) && <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">${opening.pay_min ?? 0}–${opening.pay_max ?? "open"}</p>}
                </div>
                <button type="button" onClick={() => setSelectedOpening(opening)} disabled={appliedOpeningIds.has(opening.id)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500 dark:bg-emerald-700 dark:disabled:bg-slate-700">
                  {appliedOpeningIds.has(opening.id) ? "Applied" : "Apply"}
                </button>
              </div>
            </article>
          ))}
          {!loading && openings.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">No active openings matched this search. Clear the location filters to check every published company.</p>}
        </div>
        {hasMore && <button type="button" onClick={() => void searchOpenings(false)} disabled={loading} className="mt-5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Load 20 more</button>}
      </section>

      {selectedOpening && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Apply to {selectedOpening.title}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{selectedOpening.business_name}</p>
            {!profileComplete && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">Complete and save your worker profile before applying.</p>}
            <label className="mt-4 block text-sm font-medium text-slate-700 dark:text-slate-200">Cover note
              <textarea value={coverNote} onChange={(event) => setCoverNote(event.target.value)} rows={6} placeholder="Explain why you are a good fit." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setSelectedOpening(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200">Cancel</button>
              <button type="button" onClick={() => void apply()} disabled={!profileComplete || busy === "apply"} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">{busy === "apply" ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Submit application</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
