import { Link } from "react-router";

const sections = [
  ["1. Service and beta status", "YardPilotUSA provides software for landscaping businesses, workers, and clients, including workspaces, contacts, estimates, approvals, jobs, scheduling, follow-ups, invoices, subscriptions, marketplace listings, bids, applications, and related records. Beta features may change, be interrupted, or contain defects. Keep independent copies of critical records."],
  ["2. Accounts, roles, and workspaces", "Provide accurate registration information and keep credentials secure. A single identity may use client, worker, and business modes. Workspace owners control membership and permissions. Team links and codes must be shared only with intended recipients. Owners must transfer ownership or deliberately close a workspace before deleting an account when other members or retained records are involved."],
  ["3. Estimates, approvals, contracts, and invoices", "Employees may prepare estimate drafts only where permitted. Internal approval by an owner or manager is separate from customer acceptance. Generated descriptions, calculations, schedules, reports, and forms are assistance tools. Review every document and obtain any signatures, licenses, permits, tax advice, or legal terms needed for the actual work."],
  ["4. Marketplace", "Client requests, business bids, openings, applications, and listings are introductions rather than guarantees. YardPilotUSA is not the employer, contractor, client, insurer, licensing authority, or guarantor. The Marketplace Terms and Acceptable Use Policy apply."],
  ["5. Payments and subscriptions", "YardPilotUSA Pro subscriptions are billed through Stripe according to the checkout and billing portal. Landscaping invoice payments are processed for the connected landscaping business. YardPilotUSA does not presently provide payroll. Employee payment records are a ledger and do not calculate withholding, file tax forms, or transmit wages."],
  ["6. Promotional access", "Gift and campaign codes are subject to their displayed duration, redemption limit, redemption deadline, and eligibility rules. Codes may not be sold, duplicated, guessed, or used fraudulently and may be revoked for misuse."],
  ["7. Content, files, and reviews", "You retain responsibility for content you submit and confirm that you have permission to use it. Do not upload unnecessary sensitive identifiers, payment-card details, private keys, malware, illegal content, or information you are not authorized to collect. Feedback and reviews may be moderated and must describe genuine experiences."],
  ["8. Business verification", "Any verification badge confirms only the specific registry information stated by YardPilotUSA at the recorded time. It does not verify quality, insurance, licensing, tax compliance, background, safety, or suitability."],
  ["9. Availability, suspension, and termination", "YardPilotUSA may restrict access to protect users, enforce policies, investigate fraud or security incidents, comply with law, or prevent platform abuse. Data retention and deletion are governed by the Privacy Policy and applicable recordkeeping needs."],
  ["10. Disclaimers and responsibility", "To the extent allowed by law, YardPilotUSA is provided without guarantees that every feature will be uninterrupted, error-free, legally sufficient, or suitable for a particular project. Users remain responsible for business, hiring, employment, payroll, tax, insurance, licensing, safety, and contract decisions."],
  ["11. Contact", "Questions about these terms may be submitted through the YardPilotUSA support page."],
] as const;

export default function Terms() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Back to YardPilotUSA</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">Terms and Conditions</h1>
        <p className="mt-2 text-sm text-slate-500">Effective August 2, 2026 · Beta policy draft · Version 2026-08-02</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          {sections.map(([title, text]) => <section key={title}><h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2><p>{text}</p></section>)}
        </div>
        <div className="mt-8 flex flex-wrap gap-3 text-sm font-semibold text-emerald-700">
          <Link to="/privacy" className="hover:underline">Privacy Policy</Link>
          <Link to="/marketplace-terms" className="hover:underline">Marketplace Terms</Link>
          <Link to="/acceptable-use" className="hover:underline">Acceptable Use</Link>
          <Link to="/refund-policy" className="hover:underline">Refund Policy</Link>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">This draft is a launch scaffold, not legal advice. Have a qualified attorney review it before broad commercial release.</p>
      </article>
    </main>
  );
}
