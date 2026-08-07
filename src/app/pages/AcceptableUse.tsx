import { Link } from "react-router";

export default function AcceptableUse() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Back to YardPilotUSA</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">Acceptable Use Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective August 2, 2026 · Beta policy draft</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Allowed use</h2><p>Use YardPilotUSA for lawful landscaping, property-service, hiring, marketplace, estimate, invoice, and team-management activity for which you have authority and a legitimate business purpose.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Prohibited content and conduct</h2><p>Do not submit illegal services, fraud, impersonation, harassment, hate or abusive content, sexual exploitation, malware, spam, deceptive listings, stolen material, dangerous instructions, or private information you are not authorized to collect or disclose.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Marketplace integrity</h2><p>Listings, bids, job openings, applications, reviews, prices, credentials, registration details, and availability must be truthful. Do not manipulate bids or reviews, create fake demand, evade suspensions, or misrepresent licenses, insurance, employment status, or business verification.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Files and communications</h2><p>Upload only files you have permission to use. Never upload passwords, private API keys, full payment-card details, unnecessary government identifiers, or malware. Resume access must be limited to legitimate hiring review.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Enforcement</h2><p>YardPilotUSA may restrict content or access while investigating security, fraud, marketplace, legal, or safety concerns. Users may contact support to request review of an enforcement decision.</p></section>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">This draft requires attorney review before broad commercial release.</p>
      </article>
    </main>
  );
}
