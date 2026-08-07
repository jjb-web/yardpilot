import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, CreditCard, Loader2, PlusCircle, Send, XCircle } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import type { ClientJobBid, ClientJobRequest, MarketplaceBusiness } from "../data/marketplace";
import { useFeatureFlags } from "../hooks/useFeatureFlags";
import { checkTextSafety } from "../lib/contentSafety";
import { trackEvent } from "../lib/analytics";

type RequestForm = {
  title: string;
  description: string;
  serviceType: string;
  city: string;
  state: string;
  postalCode: string;
  budgetMin: string;
  budgetMax: string;
  desiredStart: string;
  bidDeadline: string;
};

export default function ClientRequests() {
  const { user, authUserId } = useApp();
  const [requests, setRequests] = useState<ClientJobRequest[]>([]);
  const [bids, setBids] = useState<ClientJobBid[]>([]);
  const [businesses, setBusinesses] = useState<Record<string, MarketplaceBusiness>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const { flags } = useFeatureFlags(["marketplace_bidding"]);
  const biddingEnabled = flags.marketplace_bidding;
  const [form, setForm] = useState<RequestForm>({
    title: "",
    description: "",
    serviceType: "",
    city: user?.city ?? "",
    state: user?.state ?? "",
    postalCode: "",
    budgetMin: "",
    budgetMax: "",
    desiredStart: "",
    bidDeadline: "",
  });

  async function load() {
    if (!authUserId) return;
    setLoading(true);
    setError("");

    const { data: requestRows, error: requestError } = await supabase
      .from("client_job_requests")
      .select("*")
      .eq("client_user_id", authUserId)
      .order("created_at", { ascending: false });

    if (requestError) {
      setError(requestError.message);
      setLoading(false);
      return;
    }

    const loadedRequests = (requestRows ?? []) as ClientJobRequest[];
    setRequests(loadedRequests);

    const ids = loadedRequests.map((request) => request.id);
    if (!ids.length) {
      setBids([]);
      setBusinesses({});
      setLoading(false);
      return;
    }

    const { data: bidRows, error: bidError } = await supabase
      .from("client_job_bids")
      .select("*")
      .in("request_id", ids)
      .order("created_at", { ascending: false });

    if (bidError) {
      setError(bidError.message);
      setLoading(false);
      return;
    }

    const loadedBids = (bidRows ?? []) as ClientJobBid[];
    setBids(loadedBids);

    const workspaceIds = [...new Set(loadedBids.map((bid) => bid.workspace_id))];
    if (workspaceIds.length) {
      const { data: profileRows } = await supabase
        .from("marketplace_business_profiles")
        .select("*")
        .in("workspace_id", workspaceIds);
      setBusinesses(
        Object.fromEntries(
          ((profileRows ?? []) as MarketplaceBusiness[]).map((profile) => [profile.workspace_id, profile]),
        ),
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authUserId]);

  const bidsByRequest = useMemo(() => {
    const grouped: Record<string, ClientJobBid[]> = {};
    for (const bid of bids) (grouped[bid.request_id] ??= []).push(bid);
    return grouped;
  }, [bids]);

  function setField(key: keyof RequestForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submitRequest() {
    if (!authUserId) return;
    if (!biddingEnabled) {
      setError("New marketplace bid requests are temporarily paused.");
      return;
    }
    if (!form.title.trim() || !form.description.trim()) {
      setError("Enter a project title and description.");
      return;
    }
    const safety = checkTextSafety(
      [form.title, form.description, form.serviceType, form.city, form.state].join(" "),
      "Project request",
    );
    if (!safety.safe) {
      setError(safety.message);
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    const { error: insertError } = await supabase.from("client_job_requests").insert({
      client_user_id: authUserId,
      client_name: user?.name ?? "",
      client_email: user?.email ?? "",
      client_phone: user?.phone ?? "",
      title: form.title.trim(),
      description: form.description.trim(),
      service_type: form.serviceType.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      postal_code: form.postalCode.trim(),
      budget_min: form.budgetMin ? Number(form.budgetMin) : null,
      budget_max: form.budgetMax ? Number(form.budgetMax) : null,
      desired_start: form.desiredStart || null,
      bid_deadline: form.bidDeadline ? new Date(form.bidDeadline).toISOString() : null,
      status: "open",
    });

    setSaving(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setForm((current) => ({ ...current, title: "", description: "", serviceType: "", budgetMin: "", budgetMax: "", desiredStart: "", bidDeadline: "" }));
    setShowForm(false);
    setMessage("Your project is now open for landscaping businesses to bid on.");
    trackEvent("marketplace_request_created", { has_budget: Boolean(form.budgetMin || form.budgetMax) });
    await load();
  }

  async function acceptBid(bidId: string) {
    setSaving(true);
    setError("");
    const { error: rpcError } = await supabase.rpc("accept_client_job_bid", {
      requested_bid_id: bidId,
    });
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMessage("Bid accepted. Review the selected company under Accepted projects, then continue through the YardPilotUSA estimate and invoice workflow.");
    trackEvent("marketplace_bid_accepted");
    await load();
  }

  async function closeRequest(requestId: string) {
    setSaving(true);
    const { error: updateError } = await supabase
      .from("client_job_requests")
      .update({ status: "closed" })
      .eq("id", requestId);
    setSaving(false);
    if (updateError) setError(updateError.message);
    else await load();
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Bid Requests</h1>
          <p className="mt-1 text-sm text-slate-500">Post landscaping work and compare offers from published companies and workgroups.</p>
        </div>
        <button type="button" onClick={() => setShowForm((current) => !current)} disabled={!biddingEnabled} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {showForm ? <XCircle size={16} /> : <PlusCircle size={16} />}
          {showForm ? "Close form" : "Post a project"}
        </button>
      </div>

      {!biddingEnabled && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">New bid requests are temporarily paused. Existing requests and accepted work remain visible.</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {requests.some((request) => request.status === "awarded") && (
        <Link to="/client/payments" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700">
          <CreditCard size={16} /> View accepted projects and invoices
        </Link>
      )}

      {showForm && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">New project request</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2 text-sm font-medium text-slate-700">Project title
              <input value={form.title} onChange={(event) => setField("title", event.target.value)} placeholder="Weekly lawn service" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="sm:col-span-2 text-sm font-medium text-slate-700">Description
              <textarea value={form.description} onChange={(event) => setField("description", event.target.value)} rows={5} placeholder="Describe the property, scope, access, and timing." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Service type
              <input value={form.serviceType} onChange={(event) => setField("serviceType", event.target.value)} placeholder="Lawn care" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Desired start
              <input type="date" value={form.desiredStart} onChange={(event) => setField("desiredStart", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">City
              <input value={form.city} onChange={(event) => setField("city", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">State
              <input value={form.state} onChange={(event) => setField("state", event.target.value)} placeholder="OR" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Postal code
              <input value={form.postalCode} onChange={(event) => setField("postalCode", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Bid deadline
              <input type="datetime-local" value={form.bidDeadline} onChange={(event) => setField("bidDeadline", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Budget minimum
              <input type="number" min="0" value={form.budgetMin} onChange={(event) => setField("budgetMin", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
            <label className="text-sm font-medium text-slate-700">Budget maximum
              <input type="number" min="0" value={form.budgetMax} onChange={(event) => setField("budgetMax", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
            </label>
          </div>
          <button type="button" onClick={() => void submitRequest()} disabled={saving} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Publish request
          </button>
        </section>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading requests…</p>
      ) : (
        <div className="space-y-5">
          {requests.map((request) => (
            <section key={request.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{request.title}</h2>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{request.status}</p>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">{request.description}</p>
                </div>
                {request.status === "open" && <button type="button" onClick={() => void closeRequest(request.id)} disabled={saving} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600">Close request</button>}
              </div>

              <div className="mt-4 grid gap-2 text-sm text-slate-500 sm:grid-cols-3">
                <p>{[request.city, request.state, request.postal_code].filter(Boolean).join(", ") || "Location not set"}</p>
                <p>{request.service_type || "General landscaping"}</p>
                <p>{request.budget_min != null || request.budget_max != null ? `$${request.budget_min ?? 0}–$${request.budget_max ?? "open"}` : "Budget open"}</p>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <h3 className="text-sm font-bold text-slate-900">Bids ({bidsByRequest[request.id]?.length ?? 0})</h3>
                <div className="mt-3 space-y-3">
                  {(bidsByRequest[request.id] ?? []).map((bid) => {
                    const business = businesses[bid.workspace_id];
                    return (
                      <article key={bid.id} className="rounded-xl border border-slate-200 p-4">
                        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                          <div>
                            {business ? <Link to={`/client/market/${business.workspace_id}`} className="font-bold text-emerald-700 hover:underline">{business.display_name}</Link> : <p className="font-bold text-slate-900">Landscaping business</p>}
                            <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{bid.status}</p>
                            <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{bid.message}</p>
                            {bid.amount != null && <p className="mt-2 text-sm font-semibold text-slate-900">Offer: ${Number(bid.amount).toLocaleString()}</p>}
                          </div>
                          {request.status === "open" && bid.status === "submitted" && (
                            <button type="button" onClick={() => void acceptBid(bid.id)} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                              <CheckCircle2 size={15} /> Accept bid
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                  {(bidsByRequest[request.id]?.length ?? 0) === 0 && <p className="text-sm text-slate-500">No bids yet.</p>}
                </div>
              </div>
            </section>
          ))}
          {requests.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">You have not posted a project request yet.</div>}
        </div>
      )}
    </div>
  );
}
