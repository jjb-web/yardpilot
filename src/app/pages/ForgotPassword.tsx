import { useState, type SyntheticEvent } from "react";
import { ArrowLeft, Mail } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "../lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset-password` }
    );

    setLoading(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }

    setMessage(
      "Check your email for a password-reset link. The message may take a few minutes to arrive."
    );
  }

  return (
    <main className="min-h-screen bg-[#edf0ee] px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-7 shadow-sm">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900">
          <ArrowLeft size={16} /> Back to sign in
        </Link>
        <div className="mt-7 flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-800">
          <Mail size={20} />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Reset your password</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Enter your account email. YardPilot will send a secure reset link when the account supports password sign-in.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-base text-gray-900 outline-none focus:ring-2 focus:ring-green-600/30 sm:text-sm"
              placeholder="you@example.com"
            />
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{message}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-green-800 px-4 py-3 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60"
          >
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      </section>
    </main>
  );
}
