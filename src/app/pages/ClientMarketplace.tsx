import { useEffect, useState } from "react";
import { BriefcaseBusiness, Loader2, MapPin, Search, ShieldCheck, Users } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import type { MarketplaceBusiness } from "../data/marketplace";

const PAGE_SIZE = 20;

export default function ClientMarketplace() {
  const { user } = useApp();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState(user?.city ?? "");
  const [state, setState] = useState(user?.state ?? "");
  const [service, setService] = useState("");
  const [results, setResults] = useState<MarketplaceBusiness[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  async function search(reset = true) {
    const nextOffset = reset ? 0 : offset;
    setLoading(true);
    setError("");

    const { data, error: rpcError } = await supabase.rpc(
      "search_marketplace_businesses",
      {
        search_query: query.trim(),
        requested_city: city.trim(),
        requested_state: state.trim(),
        requested_service: service.trim(),
        page_size: PAGE_SIZE,
        page_offset: nextOffset,
      },
    );

    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    const rows = (data ?? []) as MarketplaceBusiness[];
    setResults((current) => (reset ? rows : [...current, ...rows]));
    setOffset(nextOffset + rows.length);
    const total = Number(rows[0]?.total_count ?? 0);
    setHasMore(nextOffset + rows.length < total);
  }

  useEffect(() => {
    void search(true);
    // Initial local search only. The user controls later searches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Landscaper Market</h1>
        <p className="mt-1 text-sm text-slate-500">
          Search published companies and workgroups near your project. Results are loaded in small pages instead of downloading every company on YardPilot.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Company, service, or keyword</label>
            <div className="relative">
              <Search className="absolute left-3 top-3 text-slate-400" size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Mulch, lawn care, irrigation…"
                className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">City</label>
            <input value={city} onChange={(event) => setCity(event.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">State</label>
            <input value={state} onChange={(event) => setState(event.target.value)} placeholder="OR" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-xs font-semibold text-slate-600">Specific service</label>
            <input value={service} onChange={(event) => setService(event.target.value)} placeholder="Optional service filter" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="button" onClick={() => void search(true)} disabled={loading} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
              Search
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!city.trim() && !state.trim() && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Add a city or state for local results. Leaving both blank still returns only one page at a time.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {results.map((business) => (
          <article key={business.workspace_id} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">{business.display_name}</h2>
                {business.headline && <p className="mt-1 text-sm text-slate-600">{business.headline}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {business.verification_status === "verified_active_registration" && <ShieldCheck size={20} className="text-emerald-600" aria-label="Business registration verified" />}
                <BriefcaseBusiness size={20} className="text-slate-500" />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {business.accepting_client_work && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">Accepting projects</span>}
              {business.hiring && <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-800"><Users size={12} className="mr-1 inline" />Hiring</span>}
              {business.verification_status === "verified_active_registration" && <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-semibold text-emerald-800">Registration verified</span>}
            </div>

            {(business.city || business.state) && (
              <p className="mt-3 flex items-center gap-1.5 text-sm text-slate-500">
                <MapPin size={15} /> {[business.city, business.state].filter(Boolean).join(", ")} · up to {business.service_radius_miles} miles
              </p>
            )}

            {business.description && <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{business.description}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {business.services.slice(0, 6).map((item) => (
                <span key={item} className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600">{item}</span>
              ))}
            </div>

            <Link to={`/client/market/${business.workspace_id}`} className="mt-5 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
              Review company
            </Link>
          </article>
        ))}
      </div>

      {!loading && results.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No published businesses matched this search. Try a broader city, state, or service.
        </div>
      )}

      {hasMore && (
        <div className="text-center">
          <button type="button" onClick={() => void search(false)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
            {loading ? "Loading…" : "Load 20 more"}
          </button>
        </div>
      )}
    </div>
  );
}
