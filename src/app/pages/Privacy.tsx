import { Link } from "react-router";

const sections = [
  ["Information collected", "YardPilotUSA may process account and authentication details; client and worker profiles; workspace membership; company listings and verification records; contacts, properties, photos, estimates, signatures, assignments, schedules, follow-ups, invoices, bids, applications, resumes, feedback, support messages, notification settings, subscription status, and technical security or error information."],
  ["How information is used", "Information is used to authenticate users, provide requested features, enforce roles and workspace isolation, deliver marketplace and team workflows, process subscriptions and connected-business invoice payments, send operational notifications, prevent fraud and abuse, provide support, maintain audit records, and improve reliability."],
  ["Roles and business responsibility", "Businesses and clients must have a lawful reason to enter customer, worker, applicant, property, photo, signature, and communications data. Employers remain responsible for hiring, classification, payroll, retention, and employee privacy obligations. Only collect information reasonably necessary for the stated purpose."],
  ["Marketplace visibility", "Published business profiles, services, general service area, availability, and approved public review information may be visible to signed-in marketplace users. Job requests and openings are visible according to their status and access controls. Resumes are intended to remain private to the applicant and authorized hiring managers."],
  ["Payments and providers", "Stripe processes YardPilotUSA subscriptions and connected-business invoice payments. Supabase provides authentication, database, Edge Functions, and storage; Vercel hosts the web application; Google may provide optional sign-in; and configured email or monitoring providers may process operational messages. Their own terms and privacy practices also apply."],
  ["Analytics and error reports", "When a user grants analytics consent, YardPilotUSA may collect privacy-limited product events and page paths. YardPilotUSA is designed not to intentionally send names, email addresses, client addresses, estimate descriptions, resumes, access codes, or payment details to analytics. Technical error reports may include route, browser summary, app version, and stack trace."],
  ["Security", "YardPilotUSA uses authentication, row-level security, role checks, private storage policies, webhook signatures, access-code hashing, and audit records. No system is perfectly secure. Users must protect credentials, avoid sharing secrets, and report suspected unauthorized access promptly."],
  ["Retention and deletion", "Records may remain while accounts or workspaces are active and as reasonably needed for security, disputes, payment records, legal obligations, backups, and business continuity. Account deletion may remove personal access while preserving or anonymizing records that belong to a shared workspace or must be retained. Workspace owners may need to transfer ownership before deleting their account."],
  ["User choices", "Users may update profiles, notification preferences, marketplace visibility, and many application records. Analytics consent may be declined. Privacy, access, correction, export, or deletion requests may be submitted through support, subject to identity verification and applicable retention requirements."],
  ["Children and sensitive identifiers", "YardPilotUSA is not intended for children. Do not submit full payment-card data, passwords, private API keys, Social Security numbers, or EINs unless a future feature clearly requires and protects that information. Current business verification should use public registry information rather than collecting an EIN."],
  ["Contact", "Privacy questions and requests may be submitted through the YardPilotUSA support page."],
] as const;

export default function Privacy() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Back to YardPilotUSA</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective August 2, 2026 · Beta policy draft · Version 2026-08-02</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          {sections.map(([title, text]) => <section key={title}><h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2><p>{text}</p></section>)}
        </div>
        <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">This draft is a launch scaffold, not legal advice. Have a qualified privacy attorney review it before broad commercial release.</p>
      </article>
    </main>
  );
}
