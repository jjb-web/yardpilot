import { Link } from "react-router";

export default function Terms() {
  return (
    <main className="min-h-screen bg-[#edf0ee] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-300 bg-white p-6 shadow-sm sm:p-10">
        <Link to="/" className="text-sm font-semibold text-green-800 hover:underline">
          ← Back to YardPilotUSA
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-gray-950">
          Terms and Conditions
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Effective July 28, 2026 · Starter policy for the YardPilotUSA beta
        </p>

        <div className="mt-8 max-w-none space-y-7 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-bold text-gray-900">1. Using YardPilotUSA</h2>
            <p>
              YardPilotUSA provides tools for contacts, properties, estimates,
              scheduling, invoices, team collaboration, and related business
              records. You are responsible for the accuracy of information,
              prices, tax treatment, work descriptions, and messages you send.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">2. Accounts and workspaces</h2>
            <p>
              Keep your login credentials secure. Company owners control
              workspace membership and permissions. Do not invite people who
              should not have access to customer or business information.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">3. Estimates and invoices</h2>
            <p>
              Generated descriptions and calculations are business-assistance
              tools, not legal, accounting, tax, engineering, or construction
              advice. Review every estimate, invoice, schedule, and client
              document before sending it.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">4. Acceptable use</h2>
            <p>
              Do not use the service for unlawful activity, unauthorized access,
              spam, fraud, harassment, or storing content you do not have
              permission to use.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">5. Beta availability</h2>
            <p>
              The beta may change, experience interruptions, or contain defects.
              Back up important records and do not rely on YardPilotUSA as the
              only copy of critical business information.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">6. Contact</h2>
            <p>
              Questions about these terms can be sent through the support contact
              published by YardPilotUSA.
            </p>
          </section>
        </div>

        <p className="mt-10 border-t border-gray-200 pt-5 text-xs text-gray-500">
          These beta terms should be reviewed by a qualified attorney before
          broad commercial release.
        </p>
      </article>
    </main>
  );
}
