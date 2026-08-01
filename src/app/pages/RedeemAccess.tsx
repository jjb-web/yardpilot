import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Gift } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function RedeemAccess() {
  const { code = "" } = useParams();
  const { user } = useApp();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!code) return;
    sessionStorage.setItem("yardpilot-promo-code", code.toUpperCase());
    setSaved(true);
    if (user) navigate(`/app/billing?code=${encodeURIComponent(code)}`, { replace: true });
  }, [code, user, navigate]);

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-sm">
        <Gift className="mx-auto" size={30}/>
        <h1 className="mt-4 text-2xl font-bold">YardPilot promotional access</h1>
        <p className="mt-2 text-sm text-gray-600">{saved ? `Code ${code.toUpperCase()} is ready to redeem.` : "Preparing your code…"}</p>
        <Link to="/login" className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Sign in or create an account</Link>
        <p className="mt-3 text-xs text-gray-500">After signing in, open Account → Plans and billing to finish redemption.</p>
      </div>
    </div>
  );
}
