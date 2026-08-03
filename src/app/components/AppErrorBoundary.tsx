import { Component, type ErrorInfo, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { YARDPILOT_APP_VERSION } from "../lib/legal";

type Props = { children: ReactNode };
type State = { failed: boolean };

function browserSummary() {
  return `${navigator.userAgent.slice(0, 400)} | ${window.innerWidth}x${window.innerHeight}`;
}

export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const payload = {
      message: error.message || "Unexpected application error",
      stack: `${error.stack ?? ""}\n${info.componentStack ?? ""}`.slice(0, 12000),
      route: `${window.location.pathname}${window.location.search}`.slice(0, 500),
      appVersion: YARDPILOT_APP_VERSION,
      browserSummary: browserSummary(),
    };
    void supabase.functions.invoke("report-client-error", { body: payload });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900 dark:bg-slate-950 dark:text-white">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <img src="/yardpilot-logo.png" alt="YardPilot" className="mx-auto h-14 w-14 object-contain" />
          <h1 className="mt-5 text-2xl font-bold">YardPilot hit an unexpected error</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            The technical details were reported without intentionally including form contents. Reload the page. If it happens again, contact support.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => window.location.reload()} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Reload</button>
            <a href="/contact" className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-600">Contact support</a>
          </div>
        </section>
      </main>
    );
  }
}
