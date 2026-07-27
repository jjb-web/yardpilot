import { useState } from "react";
import { useApp } from "../context/AppContext";
import { Key } from "lucide-react";

export default function Account() {
  const { user } = useApp();
  const [apiKey, setApiKey] = useState(localStorage.getItem("VITE_ANTHROPIC_KEY") || "");
  const [saved, setSaved] = useState(false);

  function saveKey() {
    localStorage.setItem("VITE_ANTHROPIC_KEY", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const inputClass = "w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 transition";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-7" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        Account
      </h1>

      {/* Profile */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <h2 className="font-bold text-gray-900 mb-4">Profile</h2>
        <div className="flex items-center gap-4 mb-5">
          <div className="w-14 h-14 rounded-full bg-green-700 flex items-center justify-center text-white text-xl font-bold">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <p className="font-bold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Company</label>
            <input defaultValue={user?.company} className={inputClass} readOnly />
          </div>
          <div>
            <label className={labelClass}>Phone</label>
            <input defaultValue={user?.phone} className={inputClass} readOnly />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClass}>Email</label>
            <input defaultValue={user?.email} className={inputClass} readOnly />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-3">Profile editing coming in the next update.</p>
      </div>

      {/* AI Configuration */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-5">
        <div className="flex items-center gap-2 mb-1">
          <Key size={16} className="text-green-700" />
          <h2 className="font-bold text-gray-900">AI Configuration</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Add your Anthropic API key to enable real AI estimates. Without a key, GreenEdge uses a built-in estimation engine.
        </p>
        <div className="mb-4">
          <label className={labelClass}>Anthropic API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className={inputClass}
          />
        </div>
        <button
          onClick={saveKey}
          className="px-5 py-2.5 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 transition-colors"
        >
          {saved ? "Saved ✓" : "Save API Key"}
        </button>
        <p className="text-xs text-gray-400 mt-3">
          Your key is stored locally in your browser only and never sent to our servers.
          Get a key at{" "}
          <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer" className="text-green-700 hover:underline">
            console.anthropic.com
          </a>.
        </p>
      </div>

      {/* App info */}
      <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-sm text-gray-600">
        <p className="font-semibold text-gray-800 mb-1">GreenEdge Beta</p>
        <p>This is an early-access build. Data is saved locally in your browser. Cloud sync, team features, and PDF export are coming in the full release.</p>
      </div>
    </div>
  );
}
