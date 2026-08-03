import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { Building2, ClipboardList, DollarSign, Megaphone, UserRoundSearch, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import MarketplaceCompany from "./MarketplaceCompany";
import MarketplaceHiring from "./MarketplaceHiring";
import MarketplaceBidding from "./MarketplaceBidding";
import MarketplaceApplications from "./MarketplaceApplications";
import MarketplaceJobOpenings from "./MarketplaceJobOpenings";
import { useFeatureFlags } from "../hooks/useFeatureFlags";

type Tab = "company" | "hiring" | "openings" | "applications" | "bidding";
const VALID_TABS = new Set<Tab>(["company", "hiring", "openings", "applications", "bidding"]);

export default function Marketplace() {
  const { role, activeWorkspace } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const isBusinessWorkspace = activeWorkspace?.kind === "company" || activeWorkspace?.kind === "workgroup";
  const canManageMarketplace = canManage && isBusinessWorkspace;
  const canFindWork = role === "employee" || activeWorkspace?.kind === "personal";
  const requestedTab = searchParams.get("tab") as Tab | null;
  const { flags } = useFeatureFlags(["marketplace_bidding", "marketplace_hiring"]);

  const tabs = useMemo(() => [
    ...(canManageMarketplace ? [{ id: "company" as const, label: "Company listing", icon: Building2 }] : []),
    ...(canFindWork && flags.marketplace_hiring ? [{ id: "hiring" as const, label: "Find landscaping work", icon: UserRoundSearch }] : []),
    ...(canManageMarketplace && flags.marketplace_hiring ? [{ id: "openings" as const, label: "Publish openings", icon: Megaphone }] : []),
    ...(canManageMarketplace && flags.marketplace_hiring ? [{ id: "applications" as const, label: "Applications", icon: Users }] : []),
    ...(canManageMarketplace && flags.marketplace_bidding ? [{ id: "bidding" as const, label: "Client bidding market", icon: DollarSign }] : []),
  ], [canFindWork, canManageMarketplace, flags.marketplace_bidding, flags.marketplace_hiring]);

  const fallback = tabs[0]?.id ?? "hiring";
  const [tab, setTabState] = useState<Tab>(requestedTab && VALID_TABS.has(requestedTab) ? requestedTab : fallback);

  function setTab(next: Tab) {
    if (!tabs.some((item) => item.id === next)) return;
    setTabState(next);
    setSearchParams({ tab: next }, { replace: true });
  }

  useEffect(() => {
    const next = requestedTab && tabs.some((item) => item.id === requestedTab) ? requestedTab : fallback;
    if (next !== tab) setTabState(next);
    if (searchParams.get("tab") !== next) setSearchParams({ tab: next }, { replace: true });
  }, [fallback, requestedTab, searchParams, setSearchParams, tab, tabs]);

  if (!tabs.length) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-slate-600">Choose or create a workspace before opening the marketplace.</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">YardPilot Marketplace</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Publish a business, recruit landscapers, find a team, and compete for client projects.</p>
      </div>

      {(!flags.marketplace_bidding || !flags.marketplace_hiring) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          One or more marketplace sections are temporarily paused during beta hardening. Existing records remain available to authorized users.
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" onClick={() => setTab(id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${tab === id ? "bg-slate-900 text-white dark:bg-emerald-700" : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"}`}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "company" && canManageMarketplace && <MarketplaceCompany />}
      {tab === "hiring" && canFindWork && <MarketplaceHiring />}
      {tab === "openings" && canManageMarketplace && <MarketplaceJobOpenings />}
      {tab === "applications" && canManageMarketplace && <MarketplaceApplications />}
      {tab === "bidding" && canManageMarketplace && <MarketplaceBidding />}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <div className="flex items-start gap-2"><ClipboardList size={17} className="mt-0.5 shrink-0" /><p>Company listings are browsed by clients. Job openings are for workers looking for employment. Client bid requests are projects that published companies can compete for.</p></div>
      </div>
    </div>
  );
}
