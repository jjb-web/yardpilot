import { useEffect, useMemo, useState } from "react";
import { DollarSign, FilePlus2, Loader2, MapPin, Search, Send } from "lucide-react";
import { Link } from "react-router";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import type { ClientJobBid, ClientJobRequest, MarketplaceWorkOrder } from "../data/marketplace";

const PAGE_SIZE = 20;

export default function MarketplaceBidding() {
  const { user, authUserId, activeWorkspace, activeWorkspaceId, role } = useApp();
  const canBid = role === "owner" || role === "co_owner" || role === "manager";
  const businessWorkspace = activeWorkspace?.kind === "company" || activeWorkspace?.kind === "workgroup";

  const [query, setQuery] = useState("");
  const [city, setCity] = useState(user?.city ?? "");
  const [state, setState] = useState(user?.state ?? "");
  const [service, setService] = useState("");
  const [requests, setRequests] = useState<ClientJobRequest[]>([]);
  const [ownBids, setOwnBids] = useState<ClientJobBid[]>([]);
  const [acceptedWork, setAcceptedWork] = useState<MarketplaceWorkOrder[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<ClientJobRequest | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [bidMessage, setBidMessage] = useState("");
  const [proposedStart, setProposedStart] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profileReady, setProfileReady] = useState(false);

  async function loadOwnBidState() {
    if (!activeWorkspaceId) {
      setOwnBids([]);
      setProfileReady(false);
      return;
    }
    const [{ data: bidRows }, { data: profile }, { data: workRows, error: workError }] = await Promise.all([
      supabase.from("client_job_bids").select("*").eq("workspace_id", activeWorkspaceId),
      supabase.from("marketplace_business_profiles").select("published, accepting_client_work").eq("workspace_id", activeWorkspaceId).maybeSingle(),
      supabase.rpc("get_workspace_marketplace_work_orders", { requested_workspace_id: activeWorkspaceId }),
    ]);
    setOwnBids((bidRows ?? []) as ClientJobBid[]);
    setAcceptedWork((workRows ?? []) as MarketplaceWorkOrder[]);
    if (workError) setError(workError.message);
    setProfileReady(Boolean(profile?.published && profile?.accepting_client_work));
  }

  async function search(reset = true) {
    const nextOffset = reset ? 0 : offset;
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc("search_client_job_requests", {
      search_query: query.trim(),
      requested_city: city.trim(),
      requested_state: state.trim(),
      requested_service: service.trim(),
      page_size: PAGE_SIZE,
      page_offset: nextOffset,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    const rows = (data ?? []) as ClientJobRequest[];
    setRequests((current) => (reset ? rows : [...current, ...rows]));
    setOffset(nextOffset + rows.length);
    const total = Number(rows[0]?.total_count ?? 0);
    setHasMore(nextOffset + rows.length < total);
  }

  useEffect(() => {
    void Promise.all([search(true), loadOwnBidState()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const bidByRequest = useMemo(
    () => Object.fromEntries(ownBids.map((bid) => [bid.request_id, bid])),
    [ownBids],
  );

  async function submitBid() {
    if (!selectedRequest || !activeWorkspaceId || !authUserId) return;
    if (!canBid || !businessWorkspace) {
      setError("Use a Company or Workgroup as an owner or manager to submit bids.");
      return;
    }
    if (!profileReady) {
      setError("Publish the active workspace and turn on Accepting client work before bidding.");
      return;
    }
    if (!bidMessage.trim()) {
      setError("Enter a proposal message.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("client_job_bids").upsert({
      request_id: selectedRequest.id,
      workspace_id: activeWorkspaceId,
      submitted_by: authUserId,
      amount: bidAmount ? Number(bidAmount) : null,
      message: bidMessage.trim(),
      proposed_start: proposedStart || null,
      status: "submitted",
    }, { onConflict: "request_id,workspace_id" });
    setBusy(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }
    setSelectedRequest(null);
    setBidAmount("");
    setBidMessage("");
    setProposedStart("");
    setMessage("Bid submitted to the client.");
    await loadOwnBidState();
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900"><DollarSign size={21} /> Bidding market</h2>
        <p className="mt-1 text-sm text-slate-500">Clients publish projects and local companies compete by submitting offers.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {canBid && businessWorkspace && !profileReady && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Before bidding, publish the active workspace under Company listing and enable Accepting client work.
        </div>
      )}

      {acceptedWork.length > 0 && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Accepted marketplace projects</h3>
          <p className="mt-1 text-sm text-slate-600">Create an estimate from the accepted request. After that, use the normal YardPilot job and invoice workflow.</p>
          <div className="mt-4 space-y-3">
            {acceptedWork.map((work) => (
              <article key={work.work_order_id} className="rounded-xl border border-emerald-200 bg-white p-4">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">{work.work_status.replaceAll("_", " ")}</p>
                    <h4 className="mt-1 font-bold text-slate-900">{work.request_title}</h4>
                    <p className="mt-1 text-sm text-slate-500">{[work.city, work.state, work.postal_code].filter(Boolean).join(", ") || "Location not listed"}</p>
                    <p className="mt-2 text-sm text-slate-600">Client: {work.client_name || "Client"}{work.client_email ? ` · ${work.client_email}` : ""}{work.client_phone ? ` · ${work.client_phone}` : ""}</p>
                    {work.bid_amount != null && <p className="mt-1 text-sm font-semibold text-slate-800">Accepted offer: ${Number(work.bid_amount).toLocaleString()}</p>}
                  </div>
                  <Link to={work.project_id ? `/app/estimates/${work.project_id}` : `/app/estimate/new?marketplaceRequest=${work.request_id}`} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">
                    <FilePlus2 size={16} /> {work.project_id ? "View estimate" : "Create estimate"}
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Project or keyword" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="City" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          <input value={state} onChange={(event) => setState(event.target.value)} placeholder="State" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          <div className="sm:col-span-2"><input value={service} onChange={(event) => setService(event.target.value)} placeholder="Service type" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></div>
          <button type="button" onClick={() => void search(true)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search client projects</button>
        </div>
      </section>

      <div className="space-y-4">
        {requests.map((request) => {
          const existingBid = bidByRequest[request.id];
          return (
            <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{request.service_type || "Landscaping project"}</p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{request.title}</h3>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin size={15} /> {[request.city, request.state, request.postal_code].filter(Boolean).join(", ") || "Location not listed"}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{request.description}</p>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
                    <span>{request.budget_min != null || request.budget_max != null ? `Budget $${request.budget_min ?? 0}–$${request.budget_max ?? "open"}` : "Budget open"}</span>
                    {request.desired_start && <span>Desired start {new Date(`${request.desired_start}T00:00:00`).toLocaleDateString()}</span>}
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedRequest(request)} disabled={!canBid || !businessWorkspace} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-200 disabled:text-slate-500">
                  {existingBid ? "Update bid" : "Submit bid"}
                </button>
              </div>
              {existingBid && <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><strong>Your bid:</strong> {existingBid.status}{existingBid.amount != null ? ` · $${Number(existingBid.amount).toLocaleString()}` : ""}</p>}
            </article>
          );
        })}
        {!loading && requests.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No client projects matched this search.</div>}
      </div>

      {hasMore && <button type="button" onClick={() => void search(false)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">Load 20 more</button>}

      {selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Bid on {selectedRequest.title}</h3>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">Offer amount
                <input type="number" min="0" value={bidAmount} onChange={(event) => setBidAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="text-sm font-medium text-slate-700">Proposed start
                <input type="date" value={proposedStart} onChange={(event) => setProposedStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="sm:col-span-2 text-sm font-medium text-slate-700">Proposal
                <textarea value={bidMessage} onChange={(event) => setBidMessage(event.target.value)} rows={6} placeholder="Explain your plan, availability, scope assumptions, and what is included." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={() => setSelectedRequest(null)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={() => void submitBid()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Submit bid</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
