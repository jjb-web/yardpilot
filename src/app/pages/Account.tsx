import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  CreditCard,
  ExternalLink,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { StripeConnectionStatus, Workspace } from "../data/types";


type StripeUiState =
  | "not_connected"
  | "setup"
  | "action_required"
  | "in_review"
  | "processing"
  | "ready";

function workspaceStripeStatus(
  workspace: Workspace | null
): StripeConnectionStatus {
  return {
    connected: Boolean(
      workspace?.stripeChargesEnabled && workspace?.stripePayoutsEnabled
    ),
    accountExists: Boolean(workspace?.stripeAccountId),
    onboardingComplete: Boolean(workspace?.stripeOnboardingComplete),
    chargesEnabled: Boolean(workspace?.stripeChargesEnabled),
    payoutsEnabled: Boolean(workspace?.stripePayoutsEnabled),
    currentlyDue: workspace?.stripeCurrentlyDue ?? [],
    eventuallyDue: workspace?.stripeEventuallyDue ?? [],
    pastDue: workspace?.stripePastDue ?? [],
    pendingVerification: workspace?.stripePendingVerification ?? [],
    disabledReason: workspace?.stripeDisabledReason ?? null,
    errors: workspace?.stripeRequirementErrors ?? [],
    futureCurrentlyDue: workspace?.stripeFutureCurrentlyDue ?? [],
    futureEventuallyDue: workspace?.stripeFutureEventuallyDue ?? [],
    futurePastDue: workspace?.stripeFuturePastDue ?? [],
    futurePendingVerification:
      workspace?.stripeFuturePendingVerification ?? [],
    futureDisabledReason: workspace?.stripeFutureDisabledReason ?? null,
    syncedAt: workspace?.stripeStatusSyncedAt ?? null,
  };
}

function humanizeRequirement(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("verification.document")) return "Identity document";
  if (normalized.endsWith("id_number")) return "Government ID number";
  if (normalized.includes("external_account")) return "Payout bank account";
  if (normalized.includes("tax_id")) return "Business tax ID";
  if (normalized.includes("business_profile.url")) return "Business website";
  if (normalized.includes("support_phone")) return "Customer support phone";
  if (normalized.includes("support_email")) return "Customer support email";
  if (normalized.includes("tos_acceptance")) return "Stripe terms acceptance";
  if (normalized.endsWith("email")) return "Email address verification";

  const finalPart = value.split(".").at(-1) || value;
  return finalPart
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stripeUiState(status: StripeConnectionStatus): StripeUiState {
  if (status.connected) return "ready";
  if (!status.accountExists) return "not_connected";

  const pending = new Set(status.pendingVerification);
  const actionable = [...status.currentlyDue, ...status.pastDue].filter(
    (item) => !pending.has(item)
  );

  if (status.errors.length > 0 || actionable.length > 0) {
    return "action_required";
  }
  if (status.pendingVerification.length > 0) return "in_review";
  if (!status.onboardingComplete || status.eventuallyDue.length > 0) {
    return "setup";
  }
  return "processing";
}

function stripeStateCopy(state: StripeUiState) {
  switch (state) {
    case "ready":
      return {
        title: "Stripe connected",
        description:
          "Card payments and payouts are enabled for this workspace.",
      };
    case "in_review":
      return {
        title: "Stripe verification in review",
        description:
          "Stripe is reviewing the information you submitted. No further action is required right now. Stripe will notify the account owner if anything else is needed.",
      };
    case "action_required":
      return {
        title: "Stripe needs more information",
        description:
          "Complete the outstanding Stripe requirements before online invoice payments can be enabled.",
      };
    case "processing":
      return {
        title: "Stripe is processing your account",
        description:
          "Your information was submitted, but payments or payouts are not enabled yet. Refresh the status or check Stripe for details.",
      };
    case "setup":
      return {
        title: "Stripe setup incomplete",
        description:
          "Finish the Stripe onboarding flow to provide the remaining business, identity, and payout information.",
      };
    default:
      return {
        title: "Stripe not connected",
        description:
          "Stripe securely collects business, identity, and bank information during onboarding.",
      };
  }
}

export default function Account() {
  const {
    user,
    authUserId,
    activeWorkspace,
    role,
    workspaceMembers,
    updateProfile,
    updateMyWorkspaceRate,
    startStripeOnboarding,
    refreshStripeConnection,
    disconnectStripe,
    deleteAccount,
  } = useApp();

  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    city: "",
    state: "",
  });
  const [saving, setSaving] = useState(false);
  const [rateSaving, setRateSaving] = useState(false);
  const [positionTitle, setPositionTitle] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeMessage, setStripeMessage] = useState("");
  const [stripeError, setStripeError] = useState("");
  const [liveStripeStatus, setLiveStripeStatus] =
    useState<StripeConnectionStatus | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      name: user.name,
      company: user.company,
      phone: user.phone,
      city: user.city,
      state: user.state,
    });
  }, [user]);

  useEffect(() => {
    const membership = workspaceMembers.find(
      (member) => member.userId === authUserId
    );
    setPositionTitle(membership?.positionTitle ?? "");
    setHourlyRate(
      membership ? String(membership.hourlyRate || "") : ""
    );
  }, [workspaceMembers, authUserId, activeWorkspace?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeState = params.get("stripe");
    if (!stripeState) return;

    let cancelled = false;

    async function handleStripeRedirect() {
      setStripeError("");
      setStripeLoading(true);

      try {
        if (stripeState === "refresh") {
          setStripeMessage("Refreshing your Stripe setup link…");
          const url = await startStripeOnboarding();
          if (!cancelled) window.location.replace(url);
          return;
        }

        const status = await refreshStripeConnection();
        if (cancelled) return;
        setLiveStripeStatus(status);

        setStripeMessage(
          params.get("connected") === "1"
            ? "Stripe is already connected for this workspace."
            : "Returned from Stripe. Payment settings were refreshed."
        );
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname
        );
      } catch (stripeRedirectError) {
        if (cancelled) return;
        setStripeError(
          stripeRedirectError instanceof Error
            ? stripeRedirectError.message
            : "Stripe setup could not be refreshed."
        );
      } finally {
        if (!cancelled) setStripeLoading(false);
      }
    }

    void handleStripeRedirect();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !activeWorkspace?.stripeAccountId ||
      (role !== "owner" && role !== "co_owner")
    ) {
      setLiveStripeStatus(null);
      return;
    }

    let cancelled = false;

    async function loadStripeStatus() {
      try {
        const status = await refreshStripeConnection();
        if (!cancelled) setLiveStripeStatus(status);
      } catch (statusError) {
        if (!cancelled) {
          console.error("Could not refresh Stripe status:", statusError);
        }
      }
    }

    void loadStripeStatus();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspace?.id, activeWorkspace?.stripeAccountId, role]);

  useEffect(() => {
    if (
      !activeWorkspace?.stripeAccountId ||
      (role !== "owner" && role !== "co_owner")
    ) {
      return;
    }

    let cancelled = false;
    let refreshing = false;

    async function pollStripeStatus() {
      if (document.visibilityState === "hidden" || refreshing) return;
      refreshing = true;
      try {
        const status = await refreshStripeConnection();
        if (!cancelled) setLiveStripeStatus(status);
      } catch (statusError) {
        if (!cancelled) {
          console.error("Could not poll Stripe status:", statusError);
        }
      } finally {
        refreshing = false;
      }
    }

    const timer = window.setInterval(() => {
      void pollStripeStatus();
    }, 30_000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void pollStripeStatus();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [activeWorkspace?.id, activeWorkspace?.stripeAccountId, role]);

  const stripeStatus =
    liveStripeStatus ?? workspaceStripeStatus(activeWorkspace);
  const stripeState = stripeUiState(stripeStatus);
  const stripeCopy = stripeStateCopy(stripeState);
  const stripeReady = stripeState === "ready";
  const actionableRequirements = [
    ...new Set([
      ...stripeStatus.currentlyDue,
      ...stripeStatus.pastDue,
    ]),
  ].filter((item) => !stripeStatus.pendingVerification.includes(item));

  const cardClass = "rounded-xl border border-gray-200 bg-white p-5 sm:p-6";
  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/25";
  const labelClass =
    "block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5";

  async function saveProfile() {
    setMessage("");
    setError("");
    if (!form.name.trim()) {
      setError("Enter your name before saving.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile(form);
      setMessage("Profile updated.");
    } catch (profileError) {
      setError(
        profileError instanceof Error
          ? profileError.message
          : "Your profile could not be updated."
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveWorkspaceRate() {
    setMessage("");
    setError("");
    setRateSaving(true);
    try {
      await updateMyWorkspaceRate(
        positionTitle,
        Number(hourlyRate || 0)
      );
      setMessage("Workspace labor profile updated.");
    } catch (rateError) {
      setError(
        rateError instanceof Error
          ? rateError.message
          : "Your labor profile could not be updated."
      );
    } finally {
      setRateSaving(false);
    }
  }

  async function connectStripe() {
    setStripeError("");
    setStripeMessage("Creating a secure Stripe setup link…");
    setStripeLoading(true);

    try {
      const url = await startStripeOnboarding();
      setStripeMessage("Redirecting to Stripe…");
      window.location.replace(url);
    } catch (stripeConnectError) {
      setStripeMessage("");
      setStripeError(
        stripeConnectError instanceof Error
          ? stripeConnectError.message
          : "Stripe onboarding could not be started."
      );
      setStripeLoading(false);
    }
  }

  async function refreshStripeStatus() {
    setStripeError("");
    setStripeMessage("Refreshing Stripe status…");
    setStripeLoading(true);

    try {
      const status = await refreshStripeConnection();
      setLiveStripeStatus(status);
      setStripeMessage(
        status.connected
          ? "Stripe is ready for online invoice payments."
          : status.pendingVerification.length > 0
            ? "Stripe is still reviewing the submitted information."
            : "Stripe status refreshed."
      );
    } catch (statusError) {
      setStripeMessage("");
      setStripeError(
        statusError instanceof Error
          ? statusError.message
          : "Stripe status could not be refreshed."
      );
    } finally {
      setStripeLoading(false);
    }
  }

  async function disconnectStripeFromWorkspace() {
    if (!activeWorkspace?.stripeAccountId) return;
    const confirmed = window.confirm(
      "Disconnect Stripe from this YardPilot workspace? Online invoice payment links will stop working. This does not close or delete the external Stripe account."
    );
    if (!confirmed) return;
    setStripeError("");
    setStripeMessage("Disconnecting Stripe…");
    setStripeLoading(true);
    try {
      await disconnectStripe();
      setLiveStripeStatus(null);
      setStripeMessage("Stripe was disconnected from this workspace. The external Stripe account remains open.");
    } catch (disconnectError) {
      setStripeMessage("");
      setStripeError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Stripe could not be disconnected."
      );
    } finally {
      setStripeLoading(false);
    }
  }

  async function removeAccount() {
    const first = window.confirm(
      "Delete your YardPilot account? This permanently removes your personal workspace and all data you own. Shared workspace memberships will also be removed."
    );
    if (!first) return;
    const typed = window.prompt('Type DELETE to permanently delete your account.');
    if (typed !== "DELETE") return;
    setDeletingAccount(true);
    setError("");
    try {
      await deleteAccount();
      window.location.assign("/");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The account could not be deleted."
      );
      setDeletingAccount(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Account</h1>
        <p className="mt-1 text-sm text-gray-500">
          Edit your personal profile. Your login email cannot be changed here.
        </p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-4 mb-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-xl font-bold text-white">
            {user?.name?.charAt(0) || "Y"}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="truncate text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <UserRound size={14} /> Name
              </span>
            </label>
            <input
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2">
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={14} /> Login Email
              </span>
            </label>
            <input
              value={user?.email ?? ""}
              readOnly
              className={`${inputClass} bg-gray-50 text-gray-500 cursor-not-allowed`}
            />
            <p className="mt-1.5 text-xs text-gray-400">
              Email is controlled by your authentication account and cannot be edited on this page.
            </p>
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Phone size={14} /> Phone
              </span>
            </label>
            <input
              type="tel"
              value={form.phone}
              onChange={(event) =>
                setForm((current) => ({ ...current, phone: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <Building2 size={14} /> Optional Business Label
              </span>
            </label>
            <input
              value={form.company}
              onChange={(event) =>
                setForm((current) => ({ ...current, company: event.target.value }))
              }
              placeholder="Solo contractor, business name, or blank"
              className={inputClass}
            />
            <p className="mt-1.5 text-xs text-gray-400">
              This does not create or claim a company workspace.
            </p>
          </div>

          <div>
            <label className={labelClass}>
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={14} /> City
              </span>
            </label>
            <input
              value={form.city}
              onChange={(event) =>
                setForm((current) => ({ ...current, city: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>State / Region</label>
            <input
              value={form.state}
              onChange={(event) =>
                setForm((current) => ({ ...current, state: event.target.value }))
              }
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
          >
            <Save size={16} /> {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-2 mb-1">
          <Building2 size={18} className="text-slate-700" />
          <h2 className="font-bold text-gray-900">My labor profile</h2>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          This hourly rate is used when you assign yourself hours on an estimate. It is stored separately for each workspace.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Position / Title</label>
            <input
              value={positionTitle}
              onChange={(event) => setPositionTitle(event.target.value)}
              placeholder="Owner, Crew Lead, Designer…"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Hourly Rate</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={hourlyRate}
                onChange={(event) =>
                  setHourlyRate(event.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="0.00"
                className={`${inputClass} pl-7`}
              />
            </div>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => void saveWorkspaceRate()}
            disabled={rateSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
          >
            <Save size={16} /> {rateSaving ? "Saving…" : "Save Labor Profile"}
          </button>
        </div>
      </div>

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-2 mb-1">
          <CreditCard size={18} className="text-slate-700" />
          <h2 className="font-bold text-gray-900">Invoice payments</h2>
        </div>
        <p className="mb-5 text-sm text-gray-500">
          Connect Stripe to place a secure Pay button on shared invoices. Only owners and co-owners can change the payout account.
        </p>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-2">
                {stripeState === "ready" ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
                ) : stripeState === "in_review" || stripeState === "processing" ? (
                  <Clock3 size={18} className="mt-0.5 shrink-0 text-blue-600" />
                ) : stripeState === "action_required" ? (
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
                ) : (
                  <CreditCard size={18} className="mt-0.5 shrink-0 text-slate-500" />
                )}
                <div>
                  <p className="font-semibold text-gray-900">
                    {stripeCopy.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">
                    {stripeCopy.description}
                  </p>
                </div>
              </div>

              {stripeState === "action_required" &&
                actionableRequirements.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-semibold text-amber-900">
                      Outstanding requirements
                    </p>
                    <ul className="mt-1.5 space-y-1 text-xs text-amber-800">
                      {actionableRequirements.slice(0, 5).map((requirement) => (
                        <li key={requirement}>• {humanizeRequirement(requirement)}</li>
                      ))}
                    </ul>
                  </div>
                )}

              {stripeState === "in_review" &&
                stripeStatus.pendingVerification.length > 0 && (
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-800">
                    In review: {stripeStatus.pendingVerification
                      .slice(0, 4)
                      .map(humanizeRequirement)
                      .join(", ")}.
                  </div>
                )}

              {stripeStatus.disabledReason && (
                <p className="mt-3 text-xs text-red-700">
                  Stripe status: {humanizeRequirement(stripeStatus.disabledReason)}
                </p>
              )}

              {stripeStatus.syncedAt && (
                <p className="mt-3 text-[11px] text-gray-400">
                  Last checked {new Date(stripeStatus.syncedAt).toLocaleString()}
                </p>
              )}
            </div>

            {(role === "owner" || role === "co_owner") && (
              <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[250px] sm:justify-end">
                {stripeState === "ready" && (
                  <a
                    href="https://dashboard.stripe.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
                  >
                    <ExternalLink size={15} /> Open Stripe Dashboard
                  </a>
                )}

                {(stripeState === "not_connected" ||
                  stripeState === "setup" ||
                  stripeState === "action_required") && (
                  <button
                    type="button"
                    onClick={() => void connectStripe()}
                    disabled={stripeLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                  >
                    <ExternalLink size={15} />
                    {stripeLoading
                      ? "Opening Stripe…"
                      : stripeState === "not_connected"
                        ? "Connect Stripe"
                        : "Complete Stripe Requirements"}
                  </button>
                )}

                {stripeState !== "not_connected" && (
                  <button
                    type="button"
                    onClick={() => void refreshStripeStatus()}
                    disabled={stripeLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw
                      size={15}
                      className={stripeLoading ? "animate-spin" : ""}
                    />
                    Refresh status
                  </button>
                )}

                {activeWorkspace?.stripeAccountId && (
                  <button
                    type="button"
                    onClick={() => void disconnectStripeFromWorkspace()}
                    disabled={stripeLoading}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Disconnect Stripe
                  </button>
                )}
              </div>
            )}
          </div>
          {stripeError && (
            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {stripeError}
            </p>
          )}
          {stripeMessage && !stripeError && (
            <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              {stripeMessage}
            </p>
          )}
        </div>
      </div>

      <div className={`${cardClass} mb-5`}>
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck size={18} className="text-slate-700" />
          <h2 className="font-bold text-gray-900">Workspace access</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className={labelClass}>Workspace</p>
            <p className="mt-1 font-semibold text-gray-900">
              {activeWorkspace?.name || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Role</p>
            <p className="mt-1 font-semibold capitalize text-gray-900">
              {role === "co_owner" ? "Co-owner" : role || "—"}
            </p>
          </div>
          <div>
            <p className={labelClass}>Team size</p>
            <p className="mt-1 font-semibold text-gray-900">
              {workspaceMembers.length}
            </p>
          </div>
        </div>
      </div>


      <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-bold text-red-800">Delete account</h2>
            <p className="mt-1 text-sm text-red-700">
              Permanently deletes your authentication account, personal workspace, and data you own. This cannot be undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void removeAccount()}
            disabled={deletingAccount}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          >
            <Trash2 size={15} /> {deletingAccount ? "Deleting…" : "Delete Account"}
          </button>
        </div>
      </div>
    </div>
  );
}
