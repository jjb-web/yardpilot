import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import type { BillingStatus, FeatureKey } from "../lib/subscription";

const EMPTY_FEATURES = {
  team: false,
  schedule: false,
  followups: false,
  online_payments: false,
  unlimited_estimates: false,
  unlimited_invoices: false,
  multi_job_estimates: false,
  advanced_reports: false,
  custom_branding: false,
};

export function useSubscription() {
  const { activeWorkspaceId } = useApp();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!activeWorkspaceId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data, error: rpcError } = await supabase.rpc(
      "get_workspace_billing_status",
      { requested_workspace_id: activeWorkspaceId }
    );
    if (rpcError) {
      setError(rpcError.message);
      setStatus(null);
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      setStatus({
        workspaceId: activeWorkspaceId,
        planKey: row?.plan_key === "pro" ? "pro" : "free",
        subscriptionStatus: row?.subscription_status ?? "free",
        stripeCustomerId: row?.stripe_customer_id ?? null,
        stripeSubscriptionId: row?.stripe_subscription_id ?? null,
        stripePriceId: row?.stripe_price_id ?? null,
        currentPeriodEnd: row?.current_period_end ?? null,
        cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
        promotionalAccessUntil: row?.promotional_access_until ?? null,
        billingIssueCode: row?.billing_issue_code ?? "",
        billingIssueMessage: row?.billing_issue_message ?? "",
        features: { ...EMPTY_FEATURES, ...(row?.features ?? {}) },
        limits: {
          estimatesPerMonth: row?.limits?.estimates_per_month ?? 5,
          invoicesPerMonth: row?.limits?.invoices_per_month ?? 5,
        },
        usage: {
          estimatesThisMonth: Number(row?.usage?.estimates_this_month ?? 0),
          invoicesThisMonth: Number(row?.usage?.invoices_this_month ?? 0),
        },
      });
    }
    setLoading(false);
  }, [activeWorkspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasFeature = useCallback(
    (feature: FeatureKey) => Boolean(status?.features?.[feature]),
    [status]
  );

  return { status, loading, error, refresh, hasFeature };
}
