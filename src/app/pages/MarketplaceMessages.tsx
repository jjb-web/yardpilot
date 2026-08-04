import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Loader2, Send, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router";
import { useApp } from "../context/AppContext";
import { checkTextSafety } from "../lib/contentSafety";
import { supabase } from "../lib/supabase";

type WorkOrderDetail = {
  workOrderId: string;
  requestTitle: string;
  requestDescription: string;
  workStatus: string;
  workspaceId: string;
  clientUserId: string;
  clientName: string;
  businessName: string;
  businessHeadline: string;
  publicEmail: string;
  publicPhone: string;
  websiteUrl: string;
  verificationStatus: string;
  cancellationStatus: string;
  cancellationRequestedBy: string | null;
  cancellationReason: string;
  cancellationRequestedAt: string | null;
  cancellationResponseNotes: string;
};

type MessageRow = {
  id: string;
  work_order_id: string;
  sender_user_id: string;
  body: string;
  created_at: string;
};

function channelToken() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export default function MarketplaceMessages() {
  const { workOrderId } = useParams();
  const { authUserId, user } = useApp();
  const [detail, setDetail] = useState<WorkOrderDetail | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [body, setBody] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const clientMode = user?.accountType === "client";
  const backTo = clientMode ? "/client/payments" : "/app/marketplace?tab=bidding";

  const load = useCallback(async () => {
    if (!workOrderId) return;
    const [{ data: detailData, error: detailError }, { data: messageRows, error: messageError }] = await Promise.all([
      supabase.rpc("get_marketplace_work_order_detail", { requested_work_order_id: workOrderId }),
      supabase.from("marketplace_messages").select("id, work_order_id, sender_user_id, body, created_at").eq("work_order_id", workOrderId).order("created_at", { ascending: true }),
    ]);

    if (detailError || messageError) {
      setError(detailError?.message || messageError?.message || "Could not load this conversation.");
    } else {
      setDetail(detailData as WorkOrderDetail);
      setMessages((messageRows ?? []) as MessageRow[]);
      setError("");
    }
    setLoading(false);
  }, [workOrderId]);

  useEffect(() => {
    void load();
    if (!workOrderId) return;
    const channel = supabase
      .channel(`yardpilot-marketplace-messages-${workOrderId}-${channelToken()}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "marketplace_messages", filter: `work_order_id=eq.${workOrderId}` }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load, workOrderId]);

  const otherParty = useMemo(() => {
    if (!detail) return "Marketplace participant";
    return clientMode ? detail.businessName : detail.clientName || "Client";
  }, [clientMode, detail]);

  async function sendMessage() {
    const cleaned = body.trim();
    const safety = checkTextSafety(cleaned, "Message");
    if (!cleaned) return;
    if (!safety.safe) { setError(safety.message); return; }
    if (!workOrderId) return;

    setSending(true);
    setError("");
    const { error: sendError } = await supabase.rpc("send_marketplace_message", {
      requested_work_order_id: workOrderId,
      requested_body: cleaned,
    });
    setSending(false);
    if (sendError) { setError(sendError.message); return; }
    setBody("");
    await load();
  }


  async function requestCancellation() {
    if (!workOrderId) return;
    const reason = cancelReason.trim();
    const safety = checkTextSafety(reason, "Cancellation reason");
    if (!safety.safe) { setError(safety.message); return; }
    if (reason.length < 5) { setError("Enter a cancellation reason."); return; }
    setActionBusy(true); setError(""); setNotice("");
    const { data, error: actionError } = await supabase.rpc("request_marketplace_cancellation", { requested_work_order_id: workOrderId, requested_reason: reason });
    setActionBusy(false);
    if (actionError) { setError(actionError.message); return; }
    const cancelled = Boolean((data as { cancelled?: boolean } | null)?.cancelled);
    setNotice(cancelled ? "The project selection was cancelled before final estimate acceptance." : "Cancellation requested. The other party must respond because the project had already advanced.");
    setCancelReason("");
    await load();
  }

  async function respondCancellation(approve: boolean) {
    if (!workOrderId) return;
    setActionBusy(true); setError(""); setNotice("");
    const { error: actionError } = await supabase.rpc("respond_marketplace_cancellation", { requested_work_order_id: workOrderId, requested_approve: approve, requested_notes: "" });
    setActionBusy(false);
    if (actionError) { setError(actionError.message); return; }
    setNotice(approve ? "Cancellation approved." : "Cancellation declined.");
    await load();
  }

  if (loading) return <div className="p-8 text-sm text-slate-500">Loading conversation…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 sm:p-7">
      <Link to={backTo} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300"><ArrowLeft size={16} /> Back</Link>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">{notice}</div>}

      {detail && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{detail.workStatus.replaceAll("_", " ")}</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{detail.requestTitle}</h1>
              <p className="mt-1 text-sm text-slate-500">Conversation with {otherParty}</p>
              {clientMode && detail.verificationStatus === "verified_active_registration" && <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><ShieldCheck size={14} /> Public registration verified</p>}
            </div>
            {clientMode && <Link to={`/client/market/${detail.workspaceId}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"><ExternalLink size={15} /> Company profile</Link>}
          </div>
          {detail.cancellationStatus !== "none" && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><strong>Cancellation:</strong> {detail.cancellationStatus}. {detail.cancellationReason}{detail.cancellationStatus === "requested" && detail.cancellationRequestedBy !== authUserId && <div className="mt-3 flex gap-2"><button type="button" onClick={() => void respondCancellation(true)} disabled={actionBusy} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Approve</button><button type="button" onClick={() => void respondCancellation(false)} disabled={actionBusy} className="rounded-lg border border-amber-400 px-3 py-2 text-xs font-semibold">Decline</button></div>}</div>}
          {detail.cancellationStatus === "none" && !["cancelled", "completed"].includes(detail.workStatus) && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700"><label className="text-sm font-medium text-slate-700 dark:text-slate-200">Request cancellation<textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={2000} rows={2} placeholder="Explain why the project selection should be cancelled." className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label><button type="button" onClick={() => void requestCancellation()} disabled={actionBusy} className="mt-2 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-800 dark:text-red-300">Request cancellation</button></div>}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="max-h-[55vh] space-y-3 overflow-y-auto p-4 sm:p-5">
          {messages.map((message) => {
            const mine = message.sender_user_id === authUserId;
            return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${mine ? "bg-emerald-700 text-white" : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100"}`}><p className="whitespace-pre-wrap break-words">{message.body}</p><p className={`mt-1 text-[11px] ${mine ? "text-emerald-100" : "text-slate-400"}`}>{new Date(message.created_at).toLocaleString()}</p></div></div>;
          })}
          {messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No messages yet. Keep project-specific communication here so both parties have a clear record.</p>}
        </div>
        <div className="border-t border-slate-200 p-4 dark:border-slate-700">
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={3000} rows={3} placeholder="Write a project message…" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          <div className="mt-2 flex items-center justify-between gap-3"><p className="text-xs text-slate-400">No passwords, card information, SSNs, or private API keys.</p><button type="button" onClick={() => void sendMessage()} disabled={sending || !body.trim()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Send</button></div>
        </div>
      </section>
    </div>
  );
}
