import { useEffect, useState } from "react";
import { CheckCircle2, Download, Loader2, Users, XCircle } from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";

type Application = {
  id: string;
  opening_id: string;
  workspace_id: string;
  applicant_user_id: string;
  cover_note: string;
  resume_path: string | null;
  profile_snapshot: Record<string, unknown>;
  status: string;
  created_at: string;
};

type Opening = { id: string; title: string };

export default function MarketplaceApplications() {
  const { activeWorkspaceId, role } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const [applications, setApplications] = useState<Application[]>([]);
  const [openings, setOpenings] = useState<Record<string, Opening>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [positionTitle, setPositionTitle] = useState("Landscaper");
  const [hourlyRate, setHourlyRate] = useState("");

  async function load() {
    if (!activeWorkspaceId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: applicationRows, error: applicationError }, { data: openingRows, error: openingError }] = await Promise.all([
      supabase.from("marketplace_job_applications").select("*").eq("workspace_id", activeWorkspaceId).order("created_at", { ascending: false }),
      supabase.from("marketplace_job_openings").select("id, title").eq("workspace_id", activeWorkspaceId),
    ]);
    setLoading(false);
    if (applicationError || openingError) {
      setError(applicationError?.message || openingError?.message || "Could not load applications.");
      return;
    }
    setApplications((applicationRows ?? []) as Application[]);
    setOpenings(Object.fromEntries(((openingRows ?? []) as Opening[]).map((opening) => [opening.id, opening])));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId, role]);

  async function updateStatus(id: string, status: "reviewing" | "rejected") {
    setBusy(id);
    setError("");
    const { error: updateError } = await supabase.from("marketplace_job_applications").update({ status }).eq("id", id);
    setBusy("");
    if (updateError) setError(updateError.message);
    else await load();
  }

  async function approve(id: string) {
    setBusy(id);
    setError("");
    setMessage("");
    const { error: rpcError } = await supabase.rpc("approve_marketplace_application", {
      requested_application_id: id,
      requested_position_title: positionTitle.trim() || "Landscaper",
      requested_hourly_rate: hourlyRate ? Number(hourlyRate) : 0,
    });
    setBusy("");
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMessage("Applicant approved and added to the active workspace as an employee.");
    await load();
  }

  async function openResume(path: string) {
    setError("");
    const { data, error: signedError } = await supabase.storage.from("marketplace-resumes").createSignedUrl(path, 60);
    if (signedError || !data?.signedUrl) {
      setError(signedError?.message || "Could not open the resume.");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (!canManage) {
    return <div className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Only an owner, co-owner, or manager can review applicants.</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><Users size={21} /> Applications</h2>
        <p className="mt-1 text-sm text-slate-500">Approve an applicant to add them directly to the active workspace. Team access still requires YardPilotUSA Pro.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Position title when approved
            <input value={positionTitle} onChange={(event) => setPositionTitle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm font-medium text-slate-700">Hourly rate when approved
            <input type="number" min="0" value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
        </div>
      </section>

      {loading ? <p className="text-sm text-slate-500">Loading applications…</p> : (
        <div className="space-y-4">
          {applications.map((application) => {
            const snapshot = application.profile_snapshot ?? {};
            return (
              <article key={application.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{openings[application.opening_id]?.title || "Job opening"}</p>
                    <h3 className="mt-1 text-lg font-bold text-slate-900">{String(snapshot.name || "Applicant")}</h3>
                    <p className="mt-1 text-sm text-slate-500">{String(snapshot.headline || "")}</p>
                    <p className="mt-1 text-xs font-semibold uppercase text-slate-400">{application.status}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {application.resume_path && <button type="button" onClick={() => void openResume(application.resume_path!)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700"><Download size={14} /> Resume</button>}
                    {application.status !== "accepted" && application.status !== "rejected" && (
                      <>
                        <button type="button" onClick={() => void updateStatus(application.id, "reviewing")} disabled={busy === application.id} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Reviewing</button>
                        <button type="button" onClick={() => void updateStatus(application.id, "rejected")} disabled={busy === application.id} className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700"><XCircle size={14} /> Reject</button>
                        <button type="button" onClick={() => void approve(application.id)} disabled={busy === application.id} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy === application.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Approve</button>
                      </>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2">
                  <p><strong>Email:</strong> {String(snapshot.email || "Not provided")}</p>
                  <p><strong>Phone:</strong> {String(snapshot.phone || "Not provided")}</p>
                  <p><strong>Location:</strong> {[snapshot.city, snapshot.state].filter(Boolean).join(", ") || "Not provided"}</p>
                  <p><strong>Experience:</strong> {String(snapshot.yearsExperience ?? 0)} years</p>
                </div>
                {Array.isArray(snapshot.skills) && <p className="mt-3 text-sm text-slate-600"><strong>Skills:</strong> {snapshot.skills.join(", ")}</p>}
                {snapshot.bio && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{String(snapshot.bio)}</p>}
                {application.cover_note && <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700"><strong>Cover note:</strong><br />{application.cover_note}</div>}
              </article>
            );
          })}
          {applications.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No applications for the active workspace yet.</div>}
        </div>
      )}
    </div>
  );
}
