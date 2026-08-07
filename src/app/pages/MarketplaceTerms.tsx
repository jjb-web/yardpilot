import { Link } from "react-router";

export default function MarketplaceTerms() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Back to YardPilotUSA</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">Marketplace Terms</h1>
        <p className="mt-2 text-sm text-slate-500">Effective August 2, 2026 · Beta policy draft</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">YardPilotUSA’s role</h2><p>YardPilotUSA provides software that helps clients and landscaping businesses discover each other, post requests, submit bids, publish openings, and manage resulting estimates and invoices. YardPilotUSA is not the employer, contractor, property owner, payroll provider, insurer, licensing authority, or guarantor of a transaction.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Client requests and business bids</h2><p>A client request is an invitation to submit proposals, not a binding contract. Accepting a marketplace bid identifies a selected business; the parties must still review and accept the final estimate, scope, schedule, change terms, and invoice.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Hiring market</h2><p>Openings and applications are informational. Businesses are responsible for lawful hiring, classification, payroll, tax, background-check, wage, and workplace obligations. Worker profiles and resumes must be accurate and used only for legitimate hiring.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Verification and reviews</h2><p>A business-registration badge, when present, confirms only the limited registry information stated by YardPilotUSA. It does not verify quality, insurance, contractor licensing, tax compliance, safety, identity beyond the stated check, or fitness for a project. Reviews may be moderated and must reflect genuine experiences.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Disputes</h2><p>Clients and businesses remain responsible for project disputes, cancellations, refunds, damage, scope changes, workplace issues, and legal compliance. Payment disputes may also be governed by Stripe and the connected business’s policies.</p></section>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">This draft requires attorney review before broad commercial release.</p>
      </article>
    </main>
  );
}
