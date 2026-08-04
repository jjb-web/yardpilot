import { useEffect, useState } from "react";
import { Bell, CheckCheck, Save, Trash2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useApp } from "../context/AppContext";
import { useNotificationCenter } from "../context/NotificationsContext";
import { supabase } from "../lib/supabase";

export default function Notifications() {
  const { authUserId } = useApp();
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    loading,
    error,
    markRead,
    markAllRead,
    remove,
  } = useNotificationCenter();
  const [actionError, setActionError] = useState("");
  const [preferences, setPreferences] = useState({
    in_app_enabled: true,
    email_enabled: true,
    marketplace_enabled: true,
    estimate_enabled: true,
    invoice_enabled: true,
    team_enabled: true,
  });
  const [savingPreferences, setSavingPreferences] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState("");

  async function openNotification(id: string, actionUrl: string) {
    try {
      await markRead(id);
      if (actionUrl) navigate(actionUrl);
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : "Could not open notification.");
    }
  }

  useEffect(() => {
    let active = true;
    async function loadPreferences() {
      if (!authUserId) return;
      const { data, error: preferenceError } = await supabase
        .from("notification_preferences")
        .select("in_app_enabled, email_enabled, marketplace_enabled, estimate_enabled, invoice_enabled, team_enabled")
        .eq("user_id", authUserId)
        .maybeSingle();
      if (!active) return;
      if (preferenceError) setActionError(preferenceError.message);
      else if (data) setPreferences(data);
    }
    void loadPreferences();
    return () => { active = false; };
  }, [authUserId]);

  async function savePreferences() {
    if (!authUserId) return;
    setSavingPreferences(true);
    setActionError("");
    setPreferenceNotice("");
    const { error: preferenceError } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: authUserId, ...preferences, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    setSavingPreferences(false);
    if (preferenceError) setActionError(preferenceError.message);
    else setPreferenceNotice("Notification preferences saved. Email delivery still requires production SMTP and email templates to be configured.");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-white">
            <Bell size={24} /> Notifications
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {unreadCount ? `${unreadCount} unread update${unreadCount === 1 ? "" : "s"}` : "You are all caught up."}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead().catch((caught) => setActionError(caught.message))}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <CheckCheck size={16} /> Mark all read
          </button>
        )}
      </div>

      {(error || actionError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {actionError || error}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-bold text-slate-900 dark:text-white">Notification preferences</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">In-app notifications are ready. Email preferences are stored now and can be connected to production email delivery during launch setup. Browser push remains disabled until a later permission-focused release.</p>
        {preferenceNotice && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{preferenceNotice}</div>}
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["in_app_enabled", "In-app notifications"],
            ["email_enabled", "Email notifications"],
            ["marketplace_enabled", "Marketplace updates"],
            ["estimate_enabled", "Estimate approvals"],
            ["invoice_enabled", "Invoice payments"],
            ["team_enabled", "Team and hiring"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 rounded-xl border border-slate-200 p-3 text-sm font-medium text-slate-700 dark:border-slate-700 dark:text-slate-200">
              <input type="checkbox" checked={preferences[key]} onChange={(event) => setPreferences((current) => ({ ...current, [key]: event.target.checked }))} /> {label}
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void savePreferences()} disabled={savingPreferences} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-emerald-700"><Save size={16} /> {savingPreferences ? "Saving…" : "Save preferences"}</button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">Loading notifications…</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">No notifications yet.</div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {notifications.map((notification) => (
              <article
                key={notification.id}
                className={`flex gap-3 p-4 sm:p-5 ${notification.read_at ? "bg-white dark:bg-slate-900" : "bg-emerald-50/70 dark:bg-emerald-950/20"}`}
              >
                <button
                  type="button"
                  onClick={() => void openNotification(notification.id, notification.action_url)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900 dark:text-white">{notification.title}</p>
                    {!notification.read_at && <span className="h-2 w-2 rounded-full bg-emerald-600" aria-label="Unread" />}
                  </div>
                  {notification.message && (
                    <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{notification.message}</p>
                  )}
                  <p className="mt-2 text-xs text-slate-400">{new Date(notification.created_at).toLocaleString()}</p>
                </button>
                <button
                  type="button"
                  onClick={() => void remove(notification.id).catch((caught) => setActionError(caught.message))}
                  className="self-start rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 dark:hover:bg-slate-800"
                  aria-label="Delete notification"
                >
                  <Trash2 size={16} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
