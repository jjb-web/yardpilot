import { useEffect, useState } from "react";
import {
  analyticsConfigured,
  getAnalyticsConsent,
  loadAnalytics,
  setAnalyticsConsent,
} from "../lib/analytics";

export default function AnalyticsConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!analyticsConfigured()) return;
    const consent = getAnalyticsConsent();
    if (consent === "granted") loadAnalytics();
    if (consent === null) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-w-2xl rounded-2xl border border-slate-300 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:p-5">
      <p className="font-semibold text-slate-900 dark:text-white">Help improve YardPilot</p>
      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
        YardPilot can collect privacy-limited usage analytics. We do not intentionally send names,
        email addresses, client addresses, estimate text, resumes, access codes, or payment details.
        Read the <a className="font-semibold text-emerald-700 hover:underline dark:text-emerald-400" href="/privacy">Privacy Policy</a>.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => { setAnalyticsConsent("granted"); setVisible(false); }}
          className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          Allow analytics
        </button>
        <button
          type="button"
          onClick={() => { setAnalyticsConsent("denied"); setVisible(false); }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
