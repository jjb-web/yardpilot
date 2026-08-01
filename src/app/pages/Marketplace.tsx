import { useMemo, useState } from "react";
import { Building2, DollarSign, UserRoundSearch, Users } from "lucide-react";
import { useApp } from "../context/AppContext";
import MarketplaceCompany from "./MarketplaceCompany";
import MarketplaceHiring from "./MarketplaceHiring";
import MarketplaceBidding from "./MarketplaceBidding";
import MarketplaceApplications from "./MarketplaceApplications";

type Tab = "company" | "hiring" | "bidding" | "applications";

export default function Marketplace() {
  const { role } = useApp();
  const canManage = role === "owner" || role === "co_owner" || role === "manager";
  const [tab, setTab] = useState<Tab>(canManage ? "company" : "hiring");

  const tabs = useMemo(
    () => [
      ...(canManage ? [{ id: "company" as const, label: "Company listing", icon: Building2 }] : []),
      { id: "hiring" as const, label: "Hiring market", icon: UserRoundSearch },
      { id: "bidding" as const, label: "Bidding market", icon: DollarSign },
      ...(canManage ? [{ id: "applications" as const, label: "Applications", icon: Users }] : []),
    ],
    [canManage],
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">YardPilot Marketplace</h1>
        <p className="mt-1 text-sm text-slate-500">Publish your business, recruit landscapers, find a team, and compete for client projects.</p>
      </div>

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
              tab === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      {tab === "company" && canManage && <MarketplaceCompany />}
      {tab === "hiring" && <MarketplaceHiring />}
      {tab === "bidding" && <MarketplaceBidding />}
      {tab === "applications" && canManage && <MarketplaceApplications />}
    </div>
  );
}
