import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  ClipboardList,
  DollarSign,
  Megaphone,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import MarketplaceCompany from "./MarketplaceCompany";
import MarketplaceHiring from "./MarketplaceHiring";
import MarketplaceBidding from "./MarketplaceBidding";
import MarketplaceApplications from "./MarketplaceApplications";
import MarketplaceJobOpenings from "./MarketplaceJobOpenings";

type Tab = "company" | "hiring" | "openings" | "applications" | "bidding";

export default function Marketplace() {
  const { role } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const [tab, setTab] = useState<Tab>(canManage ? "company" : "hiring");

  const tabs = useMemo(
    () => [
      ...(canManage ? [{ id: "company" as const, label: "Company listing", icon: Building2 }] : []),
      { id: "hiring" as const, label: "Find landscaping work", icon: UserRoundSearch },
      ...(canManage ? [{ id: "openings" as const, label: "Publish openings", icon: Megaphone }] : []),
      ...(canManage ? [{ id: "applications" as const, label: "Applications", icon: Users }] : []),
      { id: "bidding" as const, label: "Client bidding market", icon: DollarSign },
    ],
    [canManage],
  );

  useEffect(() => {
    if (!canManage && (tab === "company" || tab === "openings" || tab === "applications")) {
      setTab("hiring");
    }
  }, [canManage, tab]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">YardPilot Marketplace</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Publish your business, recruit landscapers, find a team, and compete for client projects.
        </p>
      </div>

      <div className="flex gap-2 overflow-x-auto overscroll-x-contain rounded-xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === id
                ? "bg-slate-900 text-white dark:bg-emerald-700"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "company" && canManage && <MarketplaceCompany />}
      {tab === "hiring" && <MarketplaceHiring />}
      {tab === "openings" && canManage && <MarketplaceJobOpenings />}
      {tab === "applications" && canManage && <MarketplaceApplications />}
      {tab === "bidding" && <MarketplaceBidding />}

      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
        <div className="flex items-start gap-2">
          <ClipboardList size={17} className="mt-0.5 shrink-0" />
          <p>
            Company listings are what clients browse. Job openings are for employees looking for work. Client bid requests are projects that companies can compete for.
          </p>
        </div>
      </div>
    </div>
  );
}
