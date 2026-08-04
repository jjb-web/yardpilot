import {
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";
import {
  Link,
  useNavigate,
  useSearchParams,
} from "react-router";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { trackEvent } from "../lib/analytics";
import { passwordError, passwordRequirements } from "../lib/password";
import { YARDPILOT_PRIVACY_VERSION, YARDPILOT_TERMS_VERSION } from "../lib/legal";
import { useFeatureFlags } from "../hooks/useFeatureFlags";

type FormData = {
  name: string;
  email: string;
  company: string;
  phone: string;
  password: string;
  inviteCode: string;
  accountType: "landscaper" | "client";
};

const PENDING_INVITE_KEY = "yardpilot-pending-invite";
const PENDING_ACCOUNT_TYPE_KEY = "yardpilot-pending-account-type";
const PENDING_LEGAL_ACCEPTANCE_KEY = "yardpilot-pending-legal-acceptance";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const inviteFromUrl = searchParams.get("invite")?.trim() ?? "";
  const processingSessionRef = useRef(false);
  const inviteCodeRef = useRef(
    inviteFromUrl || localStorage.getItem(PENDING_INVITE_KEY) || ""
  );

  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" || inviteFromUrl
      ? "register"
      : "login"
  );
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { flags } = useFeatureFlags(["public_registration"]);
  const publicRegistrationEnabled = flags.public_registration;

  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    company: "",
    phone: "",
    password: "",
    inviteCode:
      inviteFromUrl || localStorage.getItem(PENDING_INVITE_KEY) || "",
    accountType: "landscaper",
  });

  useEffect(() => {
    inviteCodeRef.current = form.inviteCode;
  }, [form.inviteCode]);

  useEffect(() => {
    if (!inviteFromUrl) return;
    inviteCodeRef.current = inviteFromUrl;
    localStorage.setItem(PENDING_INVITE_KEY, inviteFromUrl);
    setForm((current) => ({ ...current, inviteCode: inviteFromUrl }));
    setMode("register");
  }, [inviteFromUrl]);

  useEffect(() => {
    let active = true;

    async function finishAuthenticatedSession(session: Session) {
      if (!active || processingSessionRef.current) return;
      processingSessionRef.current = true;

      if (window.location.hash) {
        window.history.replaceState(
          {},
          document.title,
          window.location.pathname + window.location.search
        );
      }

      const pendingInvite =
        inviteFromUrl ||
        localStorage.getItem(PENDING_INVITE_KEY)?.trim() ||
        inviteCodeRef.current.trim();
      const pendingAccountType = pendingInvite
        ? "landscaper"
        : localStorage.getItem(PENDING_ACCOUNT_TYPE_KEY);

      if (pendingAccountType === "client" || pendingAccountType === "landscaper") {
        const { error: accountTypeError } = await supabase.rpc(
          "set_active_profile_mode",
          { requested_mode: pendingAccountType }
        );
        if (accountTypeError) {
          setLoading(false);
          setError(accountTypeError.message);
          processingSessionRef.current = false;
          return;
        }
        localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
      }

      if (pendingInvite) {
        const { data, error: inviteError } = await supabase.rpc(
          "accept_workspace_invite",
          { invite_code: pendingInvite }
        );

        if (!active) return;

        if (inviteError) {
          localStorage.removeItem(PENDING_INVITE_KEY);
          setLoading(false);
          setError(
            `You are signed in, but the team invitation could not be accepted: ${inviteError.message}`
          );
          processingSessionRef.current = false;
          return;
        }

        localStorage.removeItem(PENDING_INVITE_KEY);
        if (data) {
          localStorage.setItem("yardpilot-workspace", String(data));
        }
      }

      if (localStorage.getItem(PENDING_LEGAL_ACCEPTANCE_KEY) === "yes") {
        const { error: legalError } = await supabase.rpc(
          "accept_current_legal_documents",
          {
            requested_terms_version: YARDPILOT_TERMS_VERSION,
            requested_privacy_version: YARDPILOT_PRIVACY_VERSION,
            requested_source: "registration",
          }
        );
        if (legalError) {
          setLoading(false);
          setError(`Your account was created, but legal acceptance could not be recorded: ${legalError.message}`);
          processingSessionRef.current = false;
          return;
        }
        localStorage.removeItem(PENDING_LEGAL_ACCEPTANCE_KEY);
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("account_type")
        .eq("id", session.user.id)
        .maybeSingle();

      navigate(
        profile?.account_type === "client" && !pendingInvite
          ? "/client/market"
          : "/app/dashboard",
        { replace: true }
      );
    }

    async function restoreSession() {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }
      if (session) await finishAuthenticatedSession(session);
    }

    void restoreSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "TOKEN_REFRESHED"
      ) {
        window.setTimeout(() => {
          if (active) void finishAuthenticatedSession(session);
        }, 0);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [navigate, inviteFromUrl]);

  function set(key: keyof FormData, value: string) {
    if (key === "inviteCode") inviteCodeRef.current = value;
    setForm((current) => ({ ...current, [key]: value }));
  }

  function changeMode(nextMode: "login" | "register") {
    if (nextMode === "register" && !publicRegistrationEnabled && !form.inviteCode.trim()) {
      setError("Public registration is temporarily closed. Join the waitlist or use a valid team invitation.");
      return;
    }
    setMode(nextMode);
    setError("");
    setMessage("");
    const invite = form.inviteCode.trim();
    if (nextMode === "register") {
      setSearchParams(invite ? { mode: "register", invite } : { mode: "register" });
    } else {
      localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);
      setSearchParams(invite ? { invite } : {});
    }
  }

  function rememberInvite() {
    const invite = form.inviteCode.trim();
    if (invite) localStorage.setItem(PENDING_INVITE_KEY, invite);
    else localStorage.removeItem(PENDING_INVITE_KEY);
  }

  function rememberRegistrationAccountType() {
    localStorage.setItem(
      PENDING_ACCOUNT_TYPE_KEY,
      form.inviteCode.trim() ? "landscaper" : form.accountType
    );
  }

  async function handleLogin(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    rememberInvite();
    if (!form.inviteCode.trim()) localStorage.removeItem(PENDING_ACCOUNT_TYPE_KEY);

    const { data, error: loginError } =
      await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });

    if (loginError) {
      setLoading(false);
      setError(loginError.message);
      return;
    }

    if (data.session) {
      trackEvent("login", { method: "password" });
      processingSessionRef.current = false;
      // The auth-state listener completes invite acceptance and navigation.
    }
  }

  async function handleRegister(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!publicRegistrationEnabled && !form.inviteCode.trim()) {
      setError("Public registration is temporarily closed. Join the waitlist or use a valid team invitation.");
      return;
    }
    setMessage("");
    const passwordValidation = passwordError(form.password);
    if (passwordValidation) {
      setError(passwordValidation);
      return;
    }
    if (!acceptedTerms) {
      setError("Accept the Terms, Privacy Policy, and marketplace rules before creating an account.");
      return;
    }
    localStorage.setItem(PENDING_LEGAL_ACCEPTANCE_KEY, "yes");
    setLoading(true);
    rememberInvite();
    rememberRegistrationAccountType();

    const inviteQuery = form.inviteCode.trim()
      ? `?confirmed=true&invite=${encodeURIComponent(form.inviteCode.trim())}`
      : "?confirmed=true";

    const { data, error: signupError } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login${inviteQuery}`,
        data: {
          full_name: form.name.trim(),
          company: form.company.trim(),
          phone: form.phone.trim(),
          account_type: form.inviteCode.trim() ? "landscaper" : form.accountType,
          accepted_terms_version: YARDPILOT_TERMS_VERSION,
          accepted_privacy_version: YARDPILOT_PRIVACY_VERSION,
          accepted_legal_at: new Date().toISOString(),
        },
      },
    });

    if (signupError) {
      setLoading(false);
      if (/already|registered|exists/i.test(signupError.message)) {
        setMode("login");
        setError(
          "Account found. Sign in with Google or your password, or reset your password."
        );
      } else {
        setError(signupError.message);
      }
      return;
    }

    if (data.session) {
      processingSessionRef.current = false;
      return;
    }

    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      setLoading(false);
      setMode("login");
      setError(
        "Account found. Sign in with Google or your password, or reset your password."
      );
      return;
    }

    setLoading(false);
    trackEvent("sign_up", { method: "password", account_type: form.inviteCode.trim() ? "invited_landscaper" : form.accountType });
    setMessage(
      form.inviteCode.trim()
        ? "Account created. Confirm your email, then the team invitation will be joined automatically."
        : "Account created. Check your email and click the confirmation link."
    );
  }

  async function handleGoogleLogin() {
    setError("");
    setMessage("");
    if (mode === "register" && !acceptedTerms) {
      setError("Accept the Terms, Privacy Policy, and marketplace rules before creating an account.");
      return;
    }
    if (mode === "register") localStorage.setItem(PENDING_LEGAL_ACCEPTANCE_KEY, "yes");
    setLoading(true);
    rememberInvite();
    if (mode === "register") rememberRegistrationAccountType();

    const invite = form.inviteCode.trim();
    const returnUrl = invite
      ? `${window.location.origin}/login?invite=${encodeURIComponent(invite)}`
      : `${window.location.origin}/login`;

    trackEvent(mode === "register" ? "sign_up_started" : "login_started", { method: "google" });
    const { error: googleError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: returnUrl,
        queryParams: { prompt: "select_account" },
      },
    });

    if (googleError) {
      setLoading(false);
      setError(googleError.message);
    }
  }

  const inputClass =
    "w-full min-h-11 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div
      className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center overflow-hidden">
            <img
              src="/yardpilot-logo.png"
              alt="YardPilot"
              className="w-full h-full object-contain"
            />
          </div>
          <span
            className="font-bold text-gray-900 text-lg"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            YardPilot
          </span>
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 sm:p-7">
          {form.inviteCode.trim() && (
            <div className="mb-5 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-sm font-semibold text-green-800">
                Team invitation detected
              </p>
              <p className="text-xs text-green-700 mt-1">
                Sign in or create an account using the invited email. YardPilot
                will join the workspace automatically.
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={loading}
            className="w-full py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Connecting..." : "Continue with Google"}
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
                onClick={() => changeMode(currentMode)}
                disabled={currentMode === "register" && !publicRegistrationEnabled && !form.inviteCode.trim()}
                className={`flex-1 disabled:cursor-not-allowed disabled:opacity-50 py-2 rounded-md text-sm font-semibold transition-all cursor-pointer ${
                  mode === currentMode
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {currentMode === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {!publicRegistrationEnabled && !form.inviteCode.trim() && (
            <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800">
              Public registration is temporarily closed while YardPilot is in controlled beta. Existing users can sign in, and valid team invitations still work.
            </div>
          )}

          <form
            onSubmit={mode === "login" ? handleLogin : handleRegister}
            className="space-y-4"
          >
            {mode === "register" && (
              <>
                {!form.inviteCode.trim() && (
                  <div>
                    <label className={labelClass}>What are you using YardPilot for?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => set("accountType", "landscaper")}
                        className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                          form.accountType === "landscaper"
                            ? "border-green-600 bg-green-50 text-green-900"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        <span className="block font-semibold">Landscaping business</span>
                        <span className="mt-1 block text-xs">Run a company, workgroup, or join a team.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => set("accountType", "client")}
                        className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                          form.accountType === "client"
                            ? "border-green-600 bg-green-50 text-green-900"
                            : "border-gray-200 bg-white text-gray-600"
                        }`}
                      >
                        <span className="block font-semibold">Client</span>
                        <span className="mt-1 block text-xs">Find landscapers and post work for bids.</span>
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className={labelClass}>Full Name</label>
                  <input
                    required
                    type="text"
                    autoComplete="name"
                    placeholder="Alex Rivera"
                    value={form.name}
                    onChange={(event) => set("name", event.target.value)}
                    className={inputClass}
                  />
                </div>

                {(form.accountType === "landscaper" || form.inviteCode.trim()) && (
                  <div>
                    <label className={labelClass}>
                      Business Name <span className="text-gray-400">(optional)</span>
                    </label>
                    <input
                      type="text"
                      autoComplete="organization"
                      placeholder="Leave blank if solo or joining a team"
                      value={form.company}
                      onChange={(event) => set("company", event.target.value)}
                      className={inputClass}
                    />
                    <p className="text-xs text-gray-400 mt-1.5">
                      This does not claim a company. Create a company workspace
                      later from Team, or join one with an invite.
                    </p>
                  </div>
                )}
              </>
            )}

            <div>
              <label className={labelClass}>Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={(event) => set("email", event.target.value)}
                className={inputClass}
              />
            </div>

            {mode === "register" && (
              <div>
                <label className={labelClass}>
                  Phone <span className="text-gray-400">(optional)</span>
                </label>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder="(512) 555-0100"
                  value={form.phone}
                  onChange={(event) => set("phone", event.target.value)}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <label className={labelClass}>Password</label>
              <input
                required
                minLength={10}
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                placeholder="••••••••"
                value={form.password}
                onChange={(event) => set("password", event.target.value)}
                className={inputClass}
              />
              {mode === "register" && (
                <ul className="mt-2 grid gap-1 text-xs text-gray-500">
                  {passwordRequirements(form.password).map((requirement) => (
                    <li key={requirement.label} className={requirement.met ? "text-green-700" : "text-gray-500"}>
                      {requirement.met ? "✓" : "○"} {requirement.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {mode === "login" && (
              <div className="-mt-2 text-right">
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-green-700 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
            )}

            <div>
              <label className={labelClass}>
                Team Invite Code <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="none"
                placeholder="Paste an invite code"
                value={form.inviteCode}
                onChange={(event) => set("inviteCode", event.target.value)}
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

            {mode === "register" && (
              <label className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-600">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(event) => setAcceptedTerms(event.target.checked)}
                  className="mt-0.5"
                  required
                />
                <span>
                  I agree to the <Link to="/terms" className="font-semibold text-green-700 hover:underline">Terms</Link>, acknowledge the <Link to="/privacy" className="font-semibold text-green-700 hover:underline">Privacy Policy</Link>, and agree to the <Link to="/marketplace-terms" className="font-semibold text-green-700 hover:underline">Marketplace Terms</Link> and <Link to="/acceptable-use" className="font-semibold text-green-700 hover:underline">Acceptable Use Policy</Link>.
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading
                ? mode === "login"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "login"
                  ? "Sign In"
                  : "Create Account"}
            </button>
          </form>
        </div>
        <p className="mt-5 text-center text-xs text-gray-500">
          <Link to="/terms" className="hover:text-gray-800 hover:underline">Terms</Link>
          <span className="mx-2">·</span>
          <Link to="/privacy" className="hover:text-gray-800 hover:underline">Privacy</Link>
        </p>
      </div>
    </div>
  );
}
