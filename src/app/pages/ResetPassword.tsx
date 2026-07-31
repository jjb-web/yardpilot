import { useEffect, useState, type SyntheticEvent } from "react";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { supabase } from "../lib/supabase";
import { passwordError, passwordRequirements } from "../lib/password";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    let resolved = false;

    function acceptSession() {
      if (!mounted) return;
      resolved = true;
      setReady(true);
      setError("");
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event: string, session: unknown) => {
        if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN")) {
          acceptSession();
        }
      }
    );

    async function checkSession() {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session) {
        acceptSession();
        return;
      }
      window.setTimeout(() => {
        if (mounted && !resolved) {
          setError(
            sessionError?.message ||
              "This reset link is invalid or expired. Request a new password-reset email."
          );
        }
      }, 800);
    }

    void checkSession();
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const strongPasswordError = passwordError(password);
    if (strongPasswordError) {
      setError(strongPasswordError);
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setSuccess(true);
    window.setTimeout(() => navigate("/login", { replace: true }), 1200);
  }

  return (
    <main className="min-h-screen bg-[#edf0ee] px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-gray-300 bg-white p-7 shadow-sm">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-green-100 text-green-800">
          {success ? <CheckCircle2 size={21} /> : <KeyRound size={21} />}
        </div>
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Choose a new password</h1>
        <p className="mt-2 text-sm text-gray-600">This changes the password for your YardPilot account.</p>

        {success ? (
          <div className="mt-6 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            Password updated. Returning to sign in…
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
              <input required minLength={10} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="w-full min-h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-base sm:text-sm" />
              <ul className="mt-2 grid gap-1 text-[11px] sm:grid-cols-2">
                {passwordRequirements(password).map((requirement) => (
                  <li key={requirement.label} className={requirement.met ? "text-green-700" : "text-gray-400"}>
                    {requirement.met ? "✓" : "○"} {requirement.label}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Confirm password</label>
              <input required minLength={10} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} className="w-full min-h-11 rounded-lg border border-gray-300 px-4 py-2.5 text-base sm:text-sm" />
            </div>
            {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button type="submit" disabled={!ready || loading} className="w-full rounded-lg bg-green-800 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}
        <Link to="/forgot-password" className="mt-5 inline-block text-sm font-semibold text-green-800 hover:underline">Request another link</Link>
      </section>
    </main>
  );
}
