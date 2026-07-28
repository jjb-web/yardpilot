import {
  useEffect,
  useState,
  type SyntheticEvent,
} from "react";
import { Link, useNavigate } from "react-router";
import { Leaf } from "lucide-react";
import { supabase } from "../lib/supabase";

type FormData = {
  name: string;
  email: string;
  company: string;
  phone: string;
  password: string;
};

export default function Login() {
  const navigate = useNavigate();
  useEffect(() => {
  let active = true;

  supabase.auth.getSession().then(({ data }) => {
    if (active && data.session) {
      navigate("/app/dashboard", { replace: true });
    }
  });

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session) {
      navigate("/app/dashboard", { replace: true });
    }
  });

  return () => {
    active = false;
    subscription.unsubscribe();
  };
}, [navigate]);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    company: "",
    phone: "",
    password: "",
  });

  function set(key: keyof FormData, value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  async function handleLogin(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const { error: loginError } =
      await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

    setLoading(false);

    if (loginError) {
      setError(loginError.message);
      return;
    }

    navigate("/app/dashboard");
  }

  async function handleRegister(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app/dashboard`,
        data: {
          full_name: form.name.trim(),
          company: form.company.trim(),
          phone: form.phone.trim(),
        },
      },
    });

    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    if (data.session) {
      navigate("/app/dashboard");
      return;
    }

    setMessage(
      "Account created. Check your email and click the confirmation link."
    );
  }

  async function handleGoogleLogin() {
  setError("");
  setMessage("");
  setLoading(true);

  const { error: googleError } =
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/login`,
      },
    });

  if (googleError) {
    setLoading(false);
    setError(googleError.message);
  }
}

  const inputClass =
    "w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition";

  const labelClass =
    "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div
      className="min-h-screen bg-gray-50 flex items-center justify-center px-4"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <Link
          to="/"
          className="flex items-center gap-2 justify-center mb-8"
        >
          <div className="w-9 h-9 bg-green-700 rounded-lg flex items-center justify-center">
            <Leaf size={18} className="text-white" />
          </div>

          <span
            className="font-bold text-gray-900 text-lg"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            GreenEdge
          </span>
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            {(["login", "register"] as const).map((currentMode) => (
              <button
                type="button"
                key={currentMode}
                onClick={() => {
                  setMode(currentMode);
                  setError("");
                  setMessage("");
                }}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
                  mode === currentMode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {currentMode === "login"
                  ? "Sign In"
                  : "Create Account"}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(event) =>
                    set("email", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  required
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(event) =>
                    set("password", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {message && (
                <p className="text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  required
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Rivera"
                  value={form.name}
                  onChange={(event) =>
                    set("name", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Company</label>
                <input
                  required
                  type="text"
                  autoComplete="organization"
                  placeholder="Green Edge Lawn & Landscape"
                  value={form.company}
                  onChange={(event) =>
                    set("company", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Email</label>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  value={form.email}
                  onChange={(event) =>
                    set("email", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Phone</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="(512) 555-0100"
                  value={form.phone}
                  onChange={(event) =>
                    set("phone", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  required
                  minLength={6}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Choose a password"
                  value={form.password}
                  onChange={(event) =>
                    set("password", event.target.value)
                  }
                  className={inputClass}
                />
              </div>

              {error && (
                <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              {message && (
                <p className="text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  {message}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors disabled:opacity-60"
              >
                {loading ? "Creating account..." : "Create Account"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          <Link
            to="/"
            className="hover:text-gray-600 transition-colors"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}