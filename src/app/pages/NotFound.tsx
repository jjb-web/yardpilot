import { Link } from "react-router";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      <div className="max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Compass className="mx-auto text-slate-500" size={34} />
        <p className="mt-4 text-sm font-bold uppercase tracking-wider text-slate-400">404</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Page not found</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
          The link may be old, incomplete, or unavailable to your account.
        </p>
        <Link to="/" className="mt-6 inline-flex rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white dark:bg-emerald-700">
          Return to YardPilot
        </Link>
      </div>
    </main>
  );
}
