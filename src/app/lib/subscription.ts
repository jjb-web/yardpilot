export type FeatureKey =
  | "team"
  | "schedule"
  | "followups"
  | "online_payments"
  | "unlimited_estimates"
  | "unlimited_invoices"
  | "multi_job_estimates"
  | "advanced_reports"
  | "custom_branding";

export type BillingStatus = {
  workspaceId: string;
  planKey: "free" | "pro";
  subscriptionStatus: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePriceId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  promotionalAccessUntil: string | null;
  billingIssueCode: string;
  billingIssueMessage: string;
  features: Record<FeatureKey, boolean>;
  limits: {
    estimatesPerMonth: number | null;
    invoicesPerMonth: number | null;
  };
  usage: {
    estimatesThisMonth: number;
    invoicesThisMonth: number;
  };
};

export const PRO_FEATURES: FeatureKey[] = [
  "team",
  "schedule",
  "followups",
  "online_payments",
  "unlimited_estimates",
  "unlimited_invoices",
  "multi_job_estimates",
  "advanced_reports",
  "custom_branding",
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  team: "Team members",
  schedule: "Schedule",
  followups: "Follow-ups and reminders",
  online_payments: "Online invoice payments",
  unlimited_estimates: "Unlimited estimates",
  unlimited_invoices: "Unlimited invoices",
  multi_job_estimates: "Multiple jobs per estimate",
  advanced_reports: "Advanced job history and reports",
  custom_branding: "Custom branding and branded PDF removal",
};
