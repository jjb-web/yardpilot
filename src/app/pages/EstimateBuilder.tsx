import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { Plus, Trash2, Sparkles, Loader2, ChevronDown } from "lucide-react";
import { useApp } from "../context/AppContext";
import { generateEstimate } from "../services/ai";
import type { LineItem, Project } from "../data/types";

function uid() { return Math.random().toString(36).slice(2, 9); }

const PROJECT_TYPES = [
  "Lawn Maintenance", "Landscape Design", "Hardscaping",
  "Irrigation", "Tree & Shrub Care", "Sod Installation",
  "Mulching & Beds", "Drainage", "Outdoor Lighting", "Other",
];

const blankItem = (): LineItem => ({ id: uid(), description: "", qty: 1, unit: "each", unitCost: 0 });

export default function EstimateBuilder() {
  const { id } = useParams<{ id: string }>();
  const { projects, addProject, updateProject } = useApp();
  const navigate = useNavigate();
  const existing = id && id !== "new" ? projects.find((p) => p.id === id) : null;

  const [form, setForm] = useState({
    name: existing?.name ?? "",
    client: existing?.client ?? "",
    address: existing?.address ?? "",
    projectType: existing?.projectType ?? PROJECT_TYPES[0],
    squareFootage: existing?.squareFootage ?? 0,
    laborRate: existing?.laborRate ?? 65,
    laborHours: existing?.laborHours ?? 0,
    notes: existing?.notes ?? "",
    status: existing?.status ?? "active",
  });

  const [lineItems, setLineItems] = useState<LineItem[]>(
    existing?.lineItems?.length ? existing.lineItems : [blankItem()]
  );
  const [aiResult, setAiResult] = useState<string | null>(existing?.aiEstimate ?? null);
  const [aiLoading, setAiLoading] = useState(false);

  function setField(key: string, val: string | number) { setForm((f) => ({ ...f, [key]: val })); }

  function updateItem(id: string, key: keyof LineItem, val: string | number) {
    setLineItems((items) => items.map((i) => i.id === id ? { ...i, [key]: val } : i));
  }

  function removeItem(id: string) { setLineItems((items) => items.filter((i) => i.id !== id)); }

  const materialsCost = lineItems.reduce((s, i) => s + i.qty * i.unitCost, 0);
  const laborCost = form.laborHours * form.laborRate;
  const totalEstimate = materialsCost + laborCost;

  async function handleAI() {
    setAiLoading(true);
    const result = await generateEstimate({ ...form, lineItems });
    setAiResult(result);
    setAiLoading(false);
  }

  function handleSave() {
    const now = new Date().toISOString();
    if (existing) {
      updateProject({ ...existing, ...form, lineItems, aiEstimate: aiResult, totalEstimate, updatedAt: now });
    } else {
      const p: Project = {
        id: uid(), ...form, lineItems, aiEstimate: aiResult, totalEstimate,
        createdAt: now, updatedAt: now,
        status: "active",
      };
      addProject(p);
    }
    navigate("/app/projects/current");
  }

  const inputClass = "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 transition";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          {existing ? "Edit Estimate" : "New Estimate"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">Fill in project details, then let AI generate your estimate.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-5">

          {/* Project info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">Project Details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Project Name</label>
                <input value={form.name} onChange={(e) => setField("name", e.target.value)} placeholder="Hartwell Backyard Redesign" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Client Name</label>
                <input value={form.client} onChange={(e) => setField("client", e.target.value)} placeholder="Mark Hartwell" className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Property Address</label>
                <input value={form.address} onChange={(e) => setField("address", e.target.value)} placeholder="822 Elmwood Dr, Austin TX 78701" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Project Type</label>
                <div className="relative">
                  <select value={form.projectType} onChange={(e) => setField("projectType", e.target.value)} className={inputClass + " appearance-none pr-8"}>
                    {PROJECT_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Square Footage</label>
                <input type="number" min={0} value={form.squareFootage} onChange={(e) => setField("squareFootage", Number(e.target.value))} placeholder="2400" className={inputClass} />
              </div>
            </div>
          </div>

          {/* Labor */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">Labor</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Hourly Rate ($)</label>
                <input type="number" min={0} value={form.laborRate} onChange={(e) => setField("laborRate", Number(e.target.value))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Estimated Hours</label>
                <input type="number" min={0} step={0.5} value={form.laborHours} onChange={(e) => setField("laborHours", Number(e.target.value))} className={inputClass} />
              </div>
            </div>
            {laborCost > 0 && (
              <p className="text-sm text-gray-500 mt-3">
                Labor subtotal: <span className="font-semibold text-gray-800">${laborCost.toLocaleString()}</span>
              </p>
            )}
          </div>

          {/* Materials */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">Materials & Line Items</h2>
              <button
                onClick={() => setLineItems((items) => [...items, blankItem()])}
                className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 transition-colors"
              >
                <Plus size={14} /> Add Item
              </button>
            </div>

            <div className="space-y-2">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-1">
                {["Description", "Qty", "Unit", "Unit Cost ($)", ""].map((h, i) => (
                  <p key={i} className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${i === 0 ? "col-span-4" : i === 4 ? "col-span-1" : "col-span-2"}`}>{h}</p>
                ))}
              </div>
              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Sod (Zoysia)" className={inputClass + " col-span-4"} />
                  <input type="number" min={0} value={item.qty} onChange={(e) => updateItem(item.id, "qty", Number(e.target.value))} className={inputClass + " col-span-2 text-center"} />
                  <input value={item.unit} onChange={(e) => updateItem(item.id, "unit", e.target.value)} placeholder="sq ft" className={inputClass + " col-span-2"} />
                  <input type="number" min={0} step={0.01} value={item.unitCost} onChange={(e) => updateItem(item.id, "unitCost", Number(e.target.value))} className={inputClass + " col-span-3"} />
                  <button onClick={() => removeItem(item.id)} className="col-span-1 flex justify-center text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {materialsCost > 0 && (
              <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
                Materials subtotal: <span className="font-semibold text-gray-800">${materialsCost.toLocaleString()}</span>
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className={labelClass}>Notes</label>
            <textarea rows={3} value={form.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Client preferences, site conditions, special requirements…" className={inputClass + " resize-none"} />
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Cost summary */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
            <h2 className="font-bold text-gray-900 mb-4">Cost Summary</h2>
            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Labor</span>
                <span className="font-medium text-gray-800">${laborCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Materials</span>
                <span className="font-medium text-gray-800">${materialsCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-3 mt-1">
                <span className="text-gray-900">Total</span>
                <span className="text-green-700">${totalEstimate.toLocaleString()}</span>
              </div>
            </div>

            {/* AI button */}
            <button
              onClick={handleAI}
              disabled={aiLoading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors disabled:opacity-60 mb-3"
            >
              {aiLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {aiLoading ? "Generating…" : "Generate AI Estimate"}
            </button>

            <button
              onClick={handleSave}
              className="w-full py-3 border border-green-700 text-green-700 font-semibold rounded-lg hover:bg-green-50 transition-colors"
            >
              Save Project
            </button>
          </div>

          {/* AI result */}
          {aiResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={15} className="text-green-700" />
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">AI Analysis</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">{aiResult}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}