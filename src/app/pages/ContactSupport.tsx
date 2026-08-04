import { useState } from "react";
import { Link } from "react-router";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { supabase } from "../lib/supabase";
import { checkTextSafety } from "../lib/contentSafety";
import { trackEvent } from "../lib/analytics";

export default function ContactSupport() {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    const safety = checkTextSafety(`${subject} ${message}`, "Support message");
    if (!safety.safe) { setError(safety.message); return; }
    setBusy(true);
    const { data, error: invokeError } = await supabase.functions.invoke("submit-public-contact", {
      body: {
        email: email.trim(),
        subject: subject.trim(),
        message: message.trim(),
        website,
        source: "contact_page",
      },
    });
    setBusy(false);
    const responseError = data && typeof data === "object" && "error" in data ? String(data.error) : "";
    if (invokeError || responseError) {
      setError(responseError || invokeError?.message || "The message could not be submitted.");
      return;
    }
    setSubject("");
    setMessage("");
    const delivery = data && typeof data === "object" && "emailDelivery" in data ? String(data.emailDelivery) : "unknown";
    setNotice(delivery === "delivered"
      ? "Your message was saved and emailed to YardPilot support."
      : "Your message was saved in the YardPilot support inbox. Email delivery is not fully configured yet, so check back with support@yardpilotusa.com if urgent.");
    trackEvent("support_message_submitted", { email_delivery: delivery });
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-300">
          <ArrowLeft size={16} /> Back to YardPilot
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"><Mail size={21} /></div>
          <h1 className="mt-5 text-2xl font-bold">Contact YardPilot</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">Use this form for account problems, billing questions, privacy requests, bug reports, or marketplace concerns. Never include passwords, private API keys, Social Security numbers, full card information, or unnecessary sensitive data.</p>
          {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {notice && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm font-medium">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
            <label className="block text-sm font-medium">Subject<input required maxLength={160} value={subject} onChange={(event) => setSubject(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
            <label className="block text-sm font-medium">Message<textarea required minLength={10} maxLength={5000} rows={7} value={message} onChange={(event) => setMessage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
            <label className="hidden" aria-hidden="true">Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
            <button disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{busy && <Loader2 size={16} className="animate-spin" />} Submit message</button>
          </form>
          <p className="mt-5 text-xs text-slate-500">Direct email: <a href="mailto:support@yardpilotusa.com" className="font-semibold text-emerald-700 hover:underline">support@yardpilotusa.com</a>. Configure and monitor this mailbox before public launch.</p>
        </div>
      </div>
    </div>
  );
}
