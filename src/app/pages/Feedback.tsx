import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import { Loader2, MessageSquareText, Star } from "lucide-react";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { YARDPILOT_APP_VERSION } from "../lib/legal";
import { checkTextSafety } from "../lib/contentSafety";
import { trackEvent } from "../lib/analytics";

 type Submission = {
  id: string;
  category: string;
  rating: number | null;
  title: string;
  message: string;
  status: string;
  created_at: string;
};

export default function Feedback() {
  const { user, authUserId, activeWorkspaceId } = useApp();
  const location = useLocation();
  const [category, setCategory] = useState("feedback");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [allowPublic, setAllowPublic] = useState(false);
  const [allowContact, setAllowContact] = useState(true);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!authUserId) return;
    const { data, error: loadError } = await supabase
      .from("feedback_submissions")
      .select("id, category, rating, title, message, status, created_at")
      .eq("user_id", authUserId)
      .order("created_at", { ascending: false });
    if (loadError) setError(loadError.message);
    else setSubmissions((data ?? []) as Submission[]);
  }

  useEffect(() => { void load(); }, [authUserId]);

  async function submit() {
    if (!authUserId || !message.trim()) {
      setError("Enter your feedback or review.");
      return;
    }
    const safety = checkTextSafety(`${title} ${message}`, "Feedback");
    if (!safety.safe) { setError(safety.message); return; }
    setBusy(true);
    setError("");
    setNotice("");
    const { data, error: submitError } = await supabase.functions.invoke("submit-feedback", {
      body: {
        workspaceId: user?.accountType === "landscaper" ? activeWorkspaceId : null,
        accountType: user?.accountType ?? "landscaper",
        category,
        rating: category === "review" ? rating : null,
        title: title.trim(),
        message: message.trim(),
        allowPublic: category === "review" ? allowPublic : false,
        allowContact,
        route: `${location.pathname}${location.search}`.slice(0, 500),
        appVersion: YARDPILOT_APP_VERSION,
        browserSummary: `${navigator.userAgent.slice(0, 400)} | ${window.innerWidth}x${window.innerHeight}`,
      },
    });
    setBusy(false);
    if (submitError || data?.error) {
      setError(data?.error || submitError?.message || "Feedback could not be submitted.");
      return;
    }
    setTitle("");
    setMessage("");
    setAllowPublic(false);
    setNotice(
      data?.emailDelivery === "delivered"
        ? "Thank you. Your submission was saved and emailed to YardPilotUSA support."
        : "Thank you. Your submission was saved. The support email alert could not be confirmed, but the submission remains available to YardPilotUSA administrators.",
    );
    trackEvent("feedback_submitted", { category, has_rating: category === "review" });
    await load();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-7">
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-white"><MessageSquareText size={24} /> YardPilotUSA feedback</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Report a bug, request a feature, leave private feedback, or submit a YardPilotUSA product review.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Type
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white">
              <option value="feedback">General feedback</option><option value="review">YardPilotUSA review</option><option value="bug">Bug report</option><option value="feature">Feature request</option>
            </select>
          </label>
          {category === "review" && (
            <label className="text-sm font-medium text-slate-700 dark:text-slate-200">Rating
              <div className="mt-2 flex gap-1">{[1, 2, 3, 4, 5].map((value) => <button key={value} type="button" onClick={() => setRating(value)} aria-label={`${value} stars`} className={value <= rating ? "text-amber-500" : "text-slate-300"}><Star size={22} fill="currentColor" /></button>)}</div>
            </label>
          )}
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optional short title" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
          <label className="sm:col-span-2 text-sm font-medium text-slate-700 dark:text-slate-200">Message
            <textarea required value={message} onChange={(event) => setMessage(event.target.value)} rows={6} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
          </label>
        </div>
        <label className="mt-4 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={allowContact} onChange={(event) => setAllowContact(event.target.checked)} className="mt-1" /> YardPilotUSA may contact me about this submission.</label>
        {category === "review" && <label className="mt-3 flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={allowPublic} onChange={(event) => setAllowPublic(event.target.checked)} className="mt-1" /> YardPilotUSA may display this product review publicly after moderation. Contact information is not included automatically.</label>}
        <button type="button" onClick={() => void submit()} disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-emerald-700">{busy && <Loader2 size={16} className="animate-spin" />} Submit</button>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Your submissions</h2>
        <div className="mt-4 space-y-3">
          {submissions.map((submission) => <article key={submission.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><div className="flex items-center justify-between gap-3"><p className="font-semibold capitalize text-slate-900 dark:text-white">{submission.title || submission.category}</p><span className="text-xs font-semibold uppercase text-slate-500">{submission.status}</span></div>{submission.rating && <p className="mt-1 text-sm text-amber-600">{"★".repeat(submission.rating)}</p>}<p className="mt-2 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">{submission.message}</p><p className="mt-2 text-xs text-slate-400">{new Date(submission.created_at).toLocaleString()}</p></article>)}
          {submissions.length === 0 && <p className="text-sm text-slate-500">No submissions yet.</p>}
        </div>
      </section>
    </div>
  );
}
