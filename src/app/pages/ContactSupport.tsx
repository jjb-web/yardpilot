import { Link } from "react-router";
import { ArrowLeft, Mail } from "lucide-react";

export default function ContactSupport() {
  return (
    <div className="min-h-screen bg-[#eef1ef] px-4 py-10 text-gray-900">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft size={16} /> Back to YardPilotUSA
        </Link>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <Mail size={21} />
          </div>
          <h1 className="mt-5 text-2xl font-bold">Contact YardPilotUSA</h1>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            For account problems, billing questions, bug reports, or feedback,
            email the YardPilot support address below. Include the workspace name
            and a brief description of what happened, but never include passwords,
            private API keys, or full payment information.
          </p>
          <a
            href="mailto:support@yardpilotusa.com?subject=YardPilotUSA%20Support"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900"
          >
            <Mail size={16} /> support@yardpilotusa.com
          </a>
          <p className="mt-4 text-xs text-gray-400">
            Configure this mailbox or forwarding address before publishing it as
            your official customer-support channel.
          </p>
        </div>
      </div>
    </div>
  );
}
