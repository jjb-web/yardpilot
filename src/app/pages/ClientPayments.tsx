import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, FileText, Loader2, Mail, MessageCircle, Phone, ShieldCheck, Star, XCircle } from "lucide-react";
import { Link } from "react-router";
import { useApp } from "../context/AppContext";
import { checkTextSafety } from "../lib/contentSafety";
import { trackEvent } from "../lib/analytics";
import { supabase } from "../lib/supabase";

type WorkOrder = {
  work_order_id: string;
  request_id: string;
  request_title: string;
  workspace_id: string;
  business_name: string;
  business_headline: string;
  public_email: string;
  public_phone: string;
  website_url: string;
  verification_status: string;
  verified_at: string | null;
  average_rating: number;
  review_count: number;
  bid_amount: number | null;
  work_status: string;
  cancellation_status: string;
  cancellation_requested_by: string | null;
  cancellation_reason: string;
  project_id: string | null;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_payment_status: string | null;
  invoice_share_token: string | null;
  invoice_share_enabled: boolean;
  invoice_paid_at: string | null;
  my_review_id: string | null;
  my_review_status: string | null;
  updated_at: string;
};

function money(value: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

export default function ClientPayments() {
  const { authUserId } = useApp();
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cancelReason, setCancelReason] = useState<Record<string, string>>({});
  const [reviewDraft, setReviewDraft] = useState<Record<string, { rating: number; title: string; body: string }>>({});

  async function load() {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("get_my_marketplace_work_orders");
    setLoading(false);
    if (rpcError) { setError(rpcError.message); return; }
    setRows((data ?? []) as WorkOrder[]);
    setError("");
  }

  useEffect(() => { void load(); }, []);

  async function requestCancellation(row: WorkOrder) {
    const reason = cancelReason[row.work_order_id]?.trim() ?? "";
    const safety = checkTextSafety(reason, "Cancellation reason");
    if (!safety.safe) { setError(safety.message); return; }
    if (reason.length < 5) { setError("Enter a cancellation reason."); return; }
    setBusyId(row.work_order_id); setError(""); setNotice("");
    const { data, error: rpcError } = await supabase.rpc("request_marketplace_cancellation", { requested_work_order_id: row.work_order_id, requested_reason: reason });
    setBusyId("");
    if (rpcError) { setError(rpcError.message); return; }
    const cancelled = Boolean((data as { cancelled?: boolean } | null)?.cancelled);
    setNotice(cancelled ? "The selection was cancelled because the final estimate had not been accepted." : "Cancellation was requested. The company must respond because the project had already advanced.");
    trackEvent("marketplace_cancellation_requested", { auto_cancelled: cancelled });
    await load();
  }

  async function respondCancellation(row: WorkOrder, approve: boolean) {
    setBusyId(row.work_order_id); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("respond_marketplace_cancellation", { requested_work_order_id: row.work_order_id, requested_approve: approve, requested_notes: "" });
    setBusyId("");
    if (rpcError) { setError(rpcError.message); return; }
    setNotice(approve ? "Cancellation approved." : "Cancellation declined. Continue messaging the company to resolve the project.");
    trackEvent("marketplace_cancellation_responded", { approved: approve });
    await load();
  }

  async function submitReview(row: WorkOrder) {
    const draft = reviewDraft[row.work_order_id] ?? { rating: 5, title: "", body: "" };
    const safety = checkTextSafety(`${draft.title} ${draft.body}`, "Review");
    if (!safety.safe) { setError(safety.message); return; }
    if (draft.body.trim().length < 10) { setError("Write at least 10 characters about the completed project."); return; }
    setBusyId(row.work_order_id); setError(""); setNotice("");
    const { error: rpcError } = await supabase.rpc("submit_marketplace_review", { requested_work_order_id: row.work_order_id, requested_rating: draft.rating, requested_title: draft.title.trim(), requested_body: draft.body.trim() });
    setBusyId("");
    if (rpcError) { setError(rpcError.message); return; }
    setNotice("Review submitted for moderation. It will be labeled as a verified YardPilot project if published.");
    trackEvent("marketplace_review_submitted", { rating: draft.rating });
    await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
      <div><h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-white"><CreditCard size={24} /> Accepted projects & payments</h1><p className="mt-1 text-sm text-slate-500">See the selected company, keep communication in YardPilot, review the estimate and invoice, and preserve cancellation history.</p></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}
      {loading ? <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" /> Loading projects…</p> : <div className="space-y-5">
        {rows.map((row) => {
          const paid = row.invoice_payment_status === "paid" || Boolean(row.invoice_paid_at);
          const invoiceReady = Boolean(row.invoice_share_enabled && row.invoice_share_token);
          const canReview = ["paid", "completed"].includes(row.work_status);
          const pendingFromCompany = row.cancellation_status === "requested" && row.cancellation_requested_by !== authUserId;
          const draft = reviewDraft[row.work_order_id] ?? { rating: 5, title: "", body: "" };
          return <article key={row.work_order_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{row.work_status.replaceAll("_", " ")}</p><h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{row.request_title}</h2><Link to={`/client/market/${row.workspace_id}`} className="mt-1 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300">{row.business_name} <ExternalLink size={14} /></Link>{row.business_headline && <p className="mt-1 text-sm text-slate-500">{row.business_headline}</p>}{row.verification_status === "verified_active_registration" && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck size={14} /> Active public registration verified</p>}{Number(row.review_count || 0) > 0 && <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500"><Star size={14} className="fill-amber-400 text-amber-400" /> {Number(row.average_rating).toFixed(1)} from {row.review_count} verified review{Number(row.review_count) === 1 ? "" : "s"}</p>}</div>{paid ? <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} /> Paid</span> : row.invoice_amount != null ? <p className="text-xl font-bold text-slate-900 dark:text-white">{money(row.invoice_amount)}</p> : row.bid_amount != null ? <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Accepted bid {money(row.bid_amount)}</p> : null}</div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">{row.public_phone && <a href={`tel:${row.public_phone}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"><Phone size={15} /> {row.public_phone}</a>}{row.public_email && <a href={`mailto:${row.public_email}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200"><Mail size={15} /> {row.public_email}</a>}<Link to={`/client/projects/${row.work_order_id}/messages`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"><MessageCircle size={15} /> YardPilot messages</Link></div>

            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-200">{row.invoice_id ? <><p><strong>Invoice:</strong> {row.invoice_number || "Created"}</p><p className="mt-1"><strong>Payment status:</strong> {row.invoice_payment_status || "unpaid"}</p></> : row.project_id ? <p>The company created the estimate/job. The invoice appears after it is created and shared.</p> : <p>The accepted company has not created the YardPilot estimate yet.</p>}</div>
            {invoiceReady && <a href={`/invoice/share/${row.invoice_share_token}`} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700"><FileText size={16} /> {paid ? "View paid invoice" : "Open and pay invoice"}</a>}

            {row.cancellation_status !== "none" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><p><strong>Cancellation:</strong> {row.cancellation_status}</p>{row.cancellation_reason && <p className="mt-1">{row.cancellation_reason}</p>}{pendingFromCompany && <div className="mt-3 flex gap-2"><button onClick={() => void respondCancellation(row,true)} disabled={busyId===row.work_order_id} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Approve cancellation</button><button onClick={() => void respondCancellation(row,false)} disabled={busyId===row.work_order_id} className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold">Decline</button></div>}</div>}

            {row.cancellation_status === "none" && !["cancelled","completed"].includes(row.work_status) && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Need to cancel this selection?<textarea value={cancelReason[row.work_order_id] ?? ""} onChange={event => setCancelReason(current => ({...current,[row.work_order_id]:event.target.value}))} maxLength={2000} rows={2} placeholder="Explain why. Before the final estimate is accepted, cancellation can be immediate; afterward the company must respond." className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><button onClick={() => void requestCancellation(row)} disabled={busyId===row.work_order_id} className="mt-2 inline-flex items-center gap-2 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300"><XCircle size={14} /> Request cancellation</button></div>}

            {canReview && <div className="mt-5 border-t border-slate-200 pt-4 dark:border-slate-700"><h3 className="font-bold text-slate-900 dark:text-white">Verified-project review</h3>{row.my_review_id && <p className="mt-1 text-sm text-slate-500">Current review status: {row.my_review_status}. Submitting again updates it and returns it to moderation.</p>}<div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Rating<select value={draft.rating} onChange={event => setReviewDraft(current => ({...current,[row.work_order_id]:{...draft,rating:Number(event.target.value)}}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950"><option value={5}>5 — Excellent</option><option value={4}>4 — Good</option><option value={3}>3 — Average</option><option value={2}>2 — Poor</option><option value={1}>1 — Very poor</option></select></label><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Title<input value={draft.title} onChange={event => setReviewDraft(current => ({...current,[row.work_order_id]:{...draft,title:event.target.value}}))} maxLength={160} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950" /></label><label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Review<textarea value={draft.body} onChange={event => setReviewDraft(current => ({...current,[row.work_order_id]:{...draft,body:event.target.value}}))} maxLength={3000} rows={4} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 dark:border-slate-600 dark:bg-slate-950" /></label></div><button onClick={() => void submitReview(row)} disabled={busyId===row.work_order_id} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Star size={15} /> Submit review</button></div>}
          </article>;
        })}
        {rows.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">No accepted marketplace projects yet.</div>}
      </div>}
    </div>
  );
}
