import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { Leaf } from "lucide-react";
import { useApp } from "../context/AppContext";
import type { User } from "../data/types";
import { supabase } from "../lib/supabase";

export default function Login() {
  const { login, register } = useApp();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", email: "", company: "", phone: "", password: "" });

  function set(key: string, val: string) { setForm((f) => ({ ...f, [key]: val })); }

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const ok = login(form.email, form.password);
    if (ok) { navigate("/app/dashboard"); }
    else { setError("No account found. Try demo@greenedge.app with any password."); }
  }

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const u: User = { name: form.name, email: form.email, company: form.company, phone: form.phone };
    register(u, form.password);
    navigate("/app/dashboard");
  }

async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });

  if (error) {
    console.error("Google login failed:", error.message);
  }
}


  const inputClass = "w-full px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/40 transition";
  const labelClass = "block text-sm font-medium text-gray-700 mb-1.5";

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 justify-center mb-8">
          <div className="w-9 h-9 bg-green-700 rounded-lg flex items-center justify-center">
            <Leaf size={18} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>GreenEdge</span>
        </Link>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-7">
          {/* Toggle */}
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); }}
                className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                {m === "login" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className={labelClass}>Email</label>
                <input required type="email" placeholder="you@example.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input required type="password" placeholder="••••••••" value={form.password} onChange={(e) => set("password", e.target.value)} className={inputClass} />
              </div>
              {error && <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
              <button type="submit" className="w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors">
                Sign In
              </button>
              <p className="text-center text-xs text-gray-400">
                Demo: <span className="font-mono text-gray-600">demo@greenedge.app</span> / any password
              </p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className={labelClass}>Full Name</label>
                <input required type="text" placeholder="Alex Rivera" value={form.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Company</label>
                <input required type="text" placeholder="Green Edge Lawn & Landscape" value={form.company} onChange={(e) => set("company", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input required type="email" placeholder="you@company.com" value={form.email} onChange={(e) => set("email", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Phone</label>
                <input type="tel" placeholder="(512) 555-0100" value={form.phone} onChange={(e) => set("phone", e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Password</label>
                <input required type="password" placeholder="Choose a password" value={form.password} onChange={(e) => set("password", e.target.value)} className={inputClass} />
              </div>
              <button type="submit" className="w-full py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors">
                Create Account
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          <Link to="/" className="hover:text-gray-600 transition-colors">← Back to home</Link>
        </p>
      </div>
    </div>
  );
}
