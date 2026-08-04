import { useEffect, useState } from "react";
import { Check, Copy, CreditCard, Gift, KeyRound, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";
import { useSubscription } from "../hooks/useSubscription";
import { FEATURE_LABELS, PRO_FEATURES } from "../lib/subscription";
import { trackEvent } from "../lib/analytics";

async function functionError(error: unknown) {
  if (error instanceof Error) return error.message;
  return "The billing request failed.";
}

type GeneratedGift = {
  code: string;
  redeemUrl: string;
  accessDays: number;
  expiresAt: string;
};

export default function Billing() {
  const { activeWorkspaceId, authUserId, role } = useApp();
  const { status, loading, error, refresh } = useSubscription();
  const [busy, setBusy] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [actionError, setActionError] = useState("");
  const [platformAdmin, setPlatformAdmin] = useState(false);
  const [giftLabel, setGiftLabel] = useState("");
  const [generatedGift, setGeneratedGift] = useState<GeneratedGift | null>(null);
  const canManage = role === "owner" || role === "co_owner";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const incoming = params.get("code") || sessionStorage.getItem("yardpilot-promo-code");
    if (incoming) {
      setCode(incoming.toUpperCase());
      sessionStorage.removeItem("yardpilot-promo-code");
      window.history.replaceState({}, "", "/app/billing#redeem");
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function checkAdmin() {
      if (!authUserId) return;
      const { data } = await supabase
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", authUserId)
        .maybeSingle();
      if (active) setPlatformAdmin(Boolean(data));
    }
    void checkAdmin();
    return () => { active = false; };
  }, [authUserId]);

  async function invoke(name: string, body: Record<string, unknown>) {
    const { data, error: fnError } = await supabase.functions.invoke(name, { body });
    if (fnError) throw fnError;
    return data;
  }

  async function startCheckout(interval: "month" | "year") {
    if (!activeWorkspaceId) return;
    setBusy(interval);
    setActionError("");
    try {
      const data = await invoke("create-subscription-checkout", {
        workspaceId: activeWorkspaceId,
        interval,
      });
      trackEvent("subscription_checkout_started", { interval });
      window.location.assign(data.url);
    } catch (requestError) {
      setActionError(await functionError(requestError));
      setBusy("");
    }
  }

  async function openPortal() {
    if (!activeWorkspaceId) return;
    setBusy("portal");
    setActionError("");
    try {
      const data = await invoke("create-billing-portal", { workspaceId: activeWorkspaceId });
      window.location.assign(data.url);
    } catch (requestError) {
      setActionError(await functionError(requestError));
      setBusy("");
    }
  }

  async function redeem() {
    if (!activeWorkspaceId || !code.trim()) return;
    setBusy("redeem");
    setActionError("");
    setMessage("");
    try {
      const data = await invoke("redeem-access-code", {
        workspaceId: activeWorkspaceId,
        code: code.trim(),
      });
      setMessage(data.message ?? "Promotional access applied.");
      trackEvent("promotional_access_redeemed");
      setCode("");
      await refresh();
    } catch (requestError) {
      setActionError(await functionError(requestError));
    } finally {
      setBusy("");
    }
  }

  async function generateGiftCode() {
    setBusy("gift");
    setActionError("");
    setMessage("");
    setGeneratedGift(null);
    try {
      const data = await invoke("generate-gift-code", {
        label: giftLabel.trim() || "Individual client",
        accessDays: 30,
        redeemWithinDays: 30,
      });
      setGeneratedGift(data as GeneratedGift);
      setGiftLabel("");
      setMessage("Unique one-use gift code generated. Copy it now; the complete code is not stored in plaintext.");
    } catch (requestError) {
      setActionError(await functionError(requestError));
    } finally {
      setBusy("");
    }
  }

  async function copyGift(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Copied to clipboard.");
  }

  if (loading) return <div className="p-8 text-sm text-gray-500">Loading billing…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="text-2xl font-bold">Plans and billing</h1>
        <p className="mt-1 text-sm text-gray-500">Subscriptions apply to the entire workspace.</p>
      </div>

      {(error || actionError) && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error || actionError}</div>}
      {message && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{message}</div>}
      {status?.billingIssueMessage && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-bold">Billing action may be required</p>
          <p className="mt-1">{status.billingIssueMessage}</p>
          {canManage && status.stripeCustomerId && <button type="button" onClick={() => void openPortal()} className="mt-3 font-semibold underline">Open billing portal</button>}
        </div>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-500">Free</p>
          <p className="mt-2 text-3xl font-bold">$0</p>
          <ul className="mt-5 space-y-2 text-sm text-slate-600">
            <li><Check className="mr-2 inline" size={15}/>Core contacts, jobs, and basic invoicing</li>
            <li><Check className="mr-2 inline" size={15}/>5 estimates per month</li>
            <li><Check className="mr-2 inline" size={15}/>5 invoices per month</li>
            <li><Check className="mr-2 inline" size={15}/>One workspace owner</li>
          </ul>
        </section>

        <section className="rounded-2xl border-2 border-slate-900 bg-white p-6 dark:border-emerald-600 dark:bg-slate-900">
          <p className="text-sm font-semibold text-slate-500">Pro</p>
          <p className="mt-2 text-3xl font-bold">Monthly or annual</p>
          <ul className="mt-5 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {PRO_FEATURES.map((feature) => <li key={feature}><Check className="mr-2 inline" size={15}/>{FEATURE_LABELS[feature]}</li>)}
          </ul>
          {canManage && status?.planKey !== "pro" && (
            <div className="mt-6 flex flex-wrap gap-3">
              <button onClick={() => void startCheckout("month")} disabled={Boolean(busy)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                {busy === "month" ? <Loader2 className="animate-spin" size={16}/> : "Choose monthly"}
              </button>
              <button onClick={() => void startCheckout("year")} disabled={Boolean(busy)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">
                {busy === "year" ? <Loader2 className="animate-spin" size={16}/> : "Choose annual"}
              </button>
            </div>
          )}
          {canManage && status?.stripeCustomerId && (
            <button onClick={() => void openPortal()} disabled={Boolean(busy)} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CreditCard size={16}/> Manage subscription
            </button>
          )}
        </section>
      </div>

      <section id="redeem" className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-3"><Gift size={20}/><h2 className="text-lg font-bold">Redeem promotional access</h2></div>
        <p className="mt-2 text-sm text-gray-500">Use a code from a YardPilot business card, QR campaign, event, or partner.</p>
        <div className="mt-4 flex max-w-xl flex-col gap-3 sm:flex-row">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Enter access code" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
          <button onClick={() => void redeem()} disabled={!canManage || !code.trim() || Boolean(busy)} className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy === "redeem" ? "Redeeming…" : "Redeem"}
          </button>
        </div>
        {!canManage && <p className="mt-2 text-xs text-amber-700">Only an owner or co-owner can change workspace billing.</p>}
      </section>

      {platformAdmin && (
        <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-6">
          <div className="flex items-center gap-3"><KeyRound size={20}/><h2 className="text-lg font-bold">Platform gift-code tools</h2></div>
          <p className="mt-2 text-sm text-gray-600">Generate a unique, one-use code that grants 30 days of Pro. The code must be redeemed within 30 days of creation.</p>
          <div className="mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row">
            <input value={giftLabel} onChange={(event) => setGiftLabel(event.target.value)} placeholder="Client name or campaign note" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm" />
            <button type="button" onClick={() => void generateGiftCode()} disabled={Boolean(busy)} className="rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy === "gift" ? "Generating…" : "Generate unique 30-day code"}
            </button>
          </div>
          {generatedGift && (
            <div className="mt-5 rounded-xl border border-violet-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Copy this now</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <code className="flex-1 rounded-lg bg-slate-950 px-3 py-2.5 text-sm font-bold text-white">{generatedGift.code}</code>
                <button type="button" onClick={() => void copyGift(generatedGift.code)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"><Copy size={15}/>Copy code</button>
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <input readOnly value={generatedGift.redeemUrl} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
                <button type="button" onClick={() => void copyGift(generatedGift.redeemUrl)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold"><Copy size={15}/>Copy link</button>
              </div>
              <p className="mt-3 text-xs text-slate-500">Grants {generatedGift.accessDays} days of Pro. Redemption expires {new Date(generatedGift.expiresAt).toLocaleDateString()}.</p>
            </div>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900 text-sm text-gray-600">
        <h2 className="font-bold text-gray-900">Current access</h2>
        <p className="mt-2">Plan: <strong>{status?.planKey === "pro" ? "Pro" : "Free"}</strong></p>
        <p>Status: <strong>{status?.subscriptionStatus ?? "free"}</strong></p>
        {status?.promotionalAccessUntil && <p>Promotional Pro access until: <strong>{new Date(status.promotionalAccessUntil).toLocaleDateString()}</strong></p>}
        {status?.currentPeriodEnd && <p>Current billing period ends: <strong>{new Date(status.currentPeriodEnd).toLocaleDateString()}</strong></p>}
      </section>
    </div>
  );
}
