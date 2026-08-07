import type { ReactNode } from "react";
import { Link } from "react-router";
import { LockKeyhole } from "lucide-react";
import { useSubscription } from "../hooks/useSubscription";
import { FEATURE_LABELS, type FeatureKey } from "../lib/subscription";

export default function FeatureGate({
  feature,
  children,
}: {
  feature: FeatureKey;
  children: ReactNode;
}) {
  const { loading, hasFeature } = useSubscription();
  if (loading) return <div className="p-8 text-sm text-gray-500">Checking plan…</div>;
  if (hasFeature(feature)) return <>{children}</>;

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
          <LockKeyhole size={21} />
        </div>
        <h1 className="mt-5 text-2xl font-bold">{FEATURE_LABELS[feature]} is a Pro feature</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Upgrade this workspace to YardPilotUSA Pro or redeem a promotional access code.
          Your existing data stays saved if Pro access expires.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/app/billing" className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
            View plans
          </Link>
          <Link to="/app/billing#redeem" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">
            Redeem code
          </Link>
        </div>
      </div>
    </div>
  );
}
