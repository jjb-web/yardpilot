import { Link } from "react-router";

export default function RefundPolicy() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-10">
        <Link to="/" className="text-sm font-semibold text-emerald-700 hover:underline">← Back to YardPilot</Link>
        <h1 className="mt-6 text-3xl font-bold text-slate-950 dark:text-white">Subscription, Cancellation, and Refund Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective August 2, 2026 · Beta policy draft</p>
        <div className="mt-8 space-y-7 text-sm leading-7 text-slate-700 dark:text-slate-300">
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">YardPilot subscriptions</h2><p>Paid subscriptions renew at the displayed monthly or annual interval until canceled. Price, billing interval, trial or promotional period, and renewal date are shown before purchase and in the billing portal.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Cancellation</h2><p>Workspace owners may cancel through the Stripe billing portal. Unless required otherwise by law or expressly stated, cancellation takes effect at the end of the paid billing period and Pro access remains available until then.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Promotional access</h2><p>Gift and campaign codes have stated expiration, redemption, duration, and eligibility rules. Promotional access has no cash value and may be revoked for fraud, resale, duplication, or misuse.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Refund requests</h2><p>Contact support promptly for duplicate charges, incorrect subscription charges, or inability to access purchased features. Refund eligibility is reviewed individually and may be limited by usage, timing, applicable law, and Stripe processing rules.</p></section>
          <section><h2 className="text-lg font-bold text-slate-900 dark:text-white">Landscaper invoices</h2><p>Payments made to landscaping companies are transactions with those connected businesses, not YardPilot subscription purchases. The company’s scope, cancellation, refund, and dispute terms apply, together with Stripe payment rules and applicable law.</p></section>
        </div>
        <p className="mt-10 border-t border-slate-200 pt-5 text-xs text-slate-500">This draft requires attorney review before broad commercial release.</p>
      </article>
    </main>
  );
}
