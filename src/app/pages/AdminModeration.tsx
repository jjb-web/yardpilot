import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import { supabase } from "../lib/supabase";

type ReviewRow = { id: string; workspace_id: string; business_name: string; rating: number; title: string; body: string; status: string; created_at: string };
type SupportRow = { id: string; email: string; subject: string; message: string; source: string; status: string; delivery_status: string; created_at: string };
type FeedbackRow = { id: string; category: string; rating: number | null; title: string; message: string; allow_public: boolean; status: string; created_at: string };

export default function AdminModeration() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [support, setSupport] = useState<SupportRow[]>([]);
  const [feedback, setFeedback] = useState<FeedbackRow[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load() {
    setError("");
    const { data: admin, error: adminError } = await supabase.rpc("is_platform_admin");
    if (adminError) { setError(adminError.message); setAuthorized(false); return; }
    setAuthorized(Boolean(admin));
    if (!admin) return;

    const [
      { data: reviewRows, error: reviewError },
      { data: supportRows, error: supportError },
      { data: feedbackRows, error: feedbackError },
    ] = await Promise.all([
      supabase.rpc("admin_list_marketplace_reviews", { requested_status: "pending" }),
      supabase.rpc("admin_list_support_messages"),
      supabase.rpc("admin_list_feedback_submissions"),
    ]);
    if (reviewError || supportError || feedbackError) setError(reviewError?.message || supportError?.message || feedbackError?.message || "Could not load moderation data.");
    else {
      setReviews((reviewRows ?? []) as ReviewRow[]);
      setSupport((supportRows ?? []) as SupportRow[]);
      setFeedback((feedbackRows ?? []) as FeedbackRow[]);
    }
  }

  useEffect(() => { void load(); }, []);

  async function moderate(id: string, status: "published" | "rejected") {
    setBusyId(id);
    const { error: moderationError } = await supabase.rpc("admin_moderate_marketplace_review", { requested_review_id: id, requested_status: status, requested_notes: "" });
    setBusyId("");
    if (moderationError) setError(moderationError.message); else await load();
  }

  if (authorized === null) return <div className="p-8 text-sm text-slate-500">Checking administrator access…</div>;
  if (!authorized) return <div className="mx-auto max-w-2xl p-8"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900"><ShieldAlert size={24} /><h1 className="mt-3 text-xl font-bold">Platform administrator access required</h1><p className="mt-2 text-sm">This page is not a workspace-manager page. It is restricted to users listed in public.platform_admins.</p>{error && <p className="mt-3 text-sm text-red-700">{error}</p>}</div></div>;

  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
    <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">YardPilotUSA moderation</h1><p className="mt-1 text-sm text-slate-500">Review verified-project reviews and recent support submissions. Negative reviews should not be rejected merely because they are negative.</p></div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold text-slate-900 dark:text-white">Pending marketplace reviews ({reviews.length})</h2><div className="mt-4 space-y-3">{reviews.map(review => <article key={review.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex flex-col justify-between gap-3 sm:flex-row"><div><p className="font-bold text-slate-900 dark:text-white">{review.business_name} · {review.rating}/5</p><p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{review.title || "Review"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{review.body}</p><p className="mt-2 text-xs text-slate-400">{new Date(review.created_at).toLocaleString()}</p></div><div className="flex shrink-0 gap-2"><button onClick={() => void moderate(review.id,"published")} disabled={busyId===review.id} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">{busyId===review.id?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>} Publish</button><button onClick={() => void moderate(review.id,"rejected")} disabled={busyId===review.id} className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700"><XCircle size={14}/> Reject abuse</button></div></div></article>)}{reviews.length===0 && <p className="text-sm text-slate-500">No pending reviews.</p>}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold text-slate-900 dark:text-white">Recent YardPilotUSA feedback</h2><div className="mt-4 space-y-3">{feedback.map(row => <article key={row.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="font-bold capitalize text-slate-900 dark:text-white">{row.title || row.category}{row.rating ? ` · ${row.rating}/5` : ""}</p><p className="mt-1 text-xs text-slate-500">{row.category} · {row.status} · public permission {row.allow_public ? "yes" : "no"}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{row.message}</p></article>)}{feedback.length===0 && <p className="text-sm text-slate-500">No feedback submissions.</p>}</div></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"><h2 className="font-bold text-slate-900 dark:text-white">Recent support messages</h2><div className="mt-4 space-y-3">{support.map(row => <article key={row.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="font-bold text-slate-900 dark:text-white">{row.subject}</p><p className="mt-1 text-xs text-slate-500">{row.email} · {row.source} · email {row.delivery_status}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{row.message}</p></article>)}{support.length===0 && <p className="text-sm text-slate-500">No support messages.</p>}</div></section>
  </div>;
}
