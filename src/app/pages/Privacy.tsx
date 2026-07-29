import { Link } from "react-router";

export default function Privacy() {
  return (
    <main className="min-h-screen bg-[#edf0ee] px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-2xl border border-gray-300 bg-white p-6 shadow-sm sm:p-10">
        <Link to="/" className="text-sm font-semibold text-green-800 hover:underline">
          ← Back to YardPilotUSA
        </Link>
        <h1 className="mt-6 text-3xl font-bold text-gray-950">Privacy Policy</h1>
        <p className="mt-2 text-sm text-gray-500">
          Effective July 28, 2026 · Starter policy for the YardPilotUSA beta
        </p>

        <div className="mt-8 max-w-none space-y-7 text-sm leading-7 text-gray-700">
          <section>
            <h2 className="text-lg font-bold text-gray-900">Information collected</h2>
            <p>
              YardPilotUSA may store account details, workspace membership,
              contacts, properties, photos, estimates, signatures, schedules,
              follow-ups, invoices, and technical information needed to operate
              and secure the service.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">How information is used</h2>
            <p>
              Information is used to provide the app, authenticate users, enforce
              workspace permissions, generate documents, send requested
              invitations or account emails, maintain security, and improve
              reliability.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">Customer and employee data</h2>
            <p>
              Business users are responsible for having a lawful reason to enter
              customer, employee, property, photo, signature, and communications
              data. Only collect information reasonably needed for the work.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">Service providers</h2>
            <p>
              The beta uses providers such as Supabase for authentication,
              database, and storage; Vercel for hosting; Google for optional
              sign-in; and an email provider when invitation or account email
              delivery is configured.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">Security and retention</h2>
            <p>
              Workspace permissions and database policies are used to limit
              access, but no system is perfectly secure. Data may be retained
              while an account or workspace remains active and as reasonably
              needed for security, legal, or operational purposes.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-bold text-gray-900">Your choices</h2>
            <p>
              Users may update or delete many records in the app. Account-level
              deletion and formal privacy requests should be directed to the
              support contact published by YardPilotUSA.
            </p>
          </section>
        </div>

        <p className="mt-10 border-t border-gray-200 pt-5 text-xs text-gray-500">
          This starter privacy policy should be reviewed by a qualified attorney
          before broad commercial release.
        </p>
      </article>
    </main>
  );
}
