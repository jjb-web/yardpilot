import {
  useEffect,
  useState,
} from "react";
import {
  useNavigate,
  useParams,
} from "react-router";
import {
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { generateEstimate } from "../services/ai";
import type {
  LineItem,
  Project,
  ProjectStatus,
} from "../data/types";

function uid() {
  return globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11);
}

const PROJECT_TYPES = [
  "Lawn Maintenance",
  "Landscape Design",
  "Hardscaping",
  "Irrigation",
  "Tree & Shrub Care",
  "Sod Installation",
  "Mulching & Beds",
  "Drainage",
  "Outdoor Lighting",
  "Other",
];

type EstimateForm = {
  name: string;
  client: string;
  address: string;
  projectType: string;
  squareFootage: number;
  laborRate: number;
  laborHours: number;
  notes: string;
  status: ProjectStatus;
};

function blankItem(): LineItem {
  return {
    id: uid(),
    description: "",
    qty: 1,
    unit: "each",
    unitCost: 0,
  };
}

function blankForm(): EstimateForm {
  return {
    name: "",
    client: "",
    address: "",
    projectType: PROJECT_TYPES[0],
    squareFootage: 0,
    laborRate: 65,
    laborHours: 0,
    notes: "",
    status: "active",
  };
}

function formFromProject(
  project: Project
): EstimateForm {
  return {
    name: project.name,
    client: project.client,
    address: project.address,
    projectType: project.projectType,
    squareFootage: project.squareFootage,
    laborRate: project.laborRate,
    laborHours: project.laborHours,
    notes: project.notes,
    status: project.status,
  };
}

export default function EstimateBuilder() {
  const { id } = useParams<{
    id: string;
  }>();
  const {
    projects,
    projectsLoading,
    addProject,
    updateProject,
  } = useApp();
  const navigate = useNavigate();

  const editing =
    Boolean(id) && id !== "new";
  const existing = editing
    ? projects.find(
        (project) => project.id === id
      ) ?? null
    : null;

  const [form, setForm] =
    useState<EstimateForm>(() =>
      existing
        ? formFromProject(existing)
        : blankForm()
    );
  const [lineItems, setLineItems] =
    useState<LineItem[]>(() =>
      existing?.lineItems.length
        ? existing.lineItems
        : [blankItem()]
    );
  const [aiResult, setAiResult] =
    useState<string | null>(
      existing?.aiEstimate ?? null
    );
  const [aiLoading, setAiLoading] =
    useState(false);
  const [saving, setSaving] =
    useState(false);
  const [saveError, setSaveError] =
    useState("");

  useEffect(() => {
    setSaveError("");

    if (existing) {
      setForm(formFromProject(existing));
      setLineItems(
        existing.lineItems.length
          ? existing.lineItems
          : [blankItem()]
      );
      setAiResult(existing.aiEstimate);
      return;
    }

    if (!editing) {
      setForm(blankForm());
      setLineItems([blankItem()]);
      setAiResult(null);
    }
  }, [editing, existing?.id]);

  function setField<K extends keyof EstimateForm>(
    key: K,
    value: EstimateForm[K]
  ) {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function updateItem<K extends keyof LineItem>(
    itemId: string,
    key: K,
    value: LineItem[K]
  ) {
    setLineItems((items) =>
      items.map((item) =>
        item.id === itemId
          ? { ...item, [key]: value }
          : item
      )
    );
  }

  function removeItem(itemId: string) {
    setLineItems((items) =>
      items.filter(
        (item) => item.id !== itemId
      )
    );
  }

  const materialsCost = lineItems.reduce(
    (sum, item) =>
      sum + item.qty * item.unitCost,
    0
  );
  const laborCost =
    form.laborHours * form.laborRate;
  const totalEstimate =
    materialsCost + laborCost;

  async function handleAI() {
    setAiLoading(true);

    try {
      const result = await generateEstimate({
        ...form,
        lineItems,
      });
      setAiResult(result);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    setSaveError("");

    if (!form.name.trim()) {
      setSaveError(
        "Enter a project name before saving."
      );
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();

    try {
      let savedProject: Project;

      if (existing) {
        savedProject = await updateProject({
          ...existing,
          ...form,
          name: form.name.trim(),
          client: form.client.trim(),
          address: form.address.trim(),
          lineItems,
          aiEstimate: aiResult,
          totalEstimate,
          updatedAt: now,
        });
      } else {
        savedProject = await addProject({
          id: uid(),
          ...form,
          name: form.name.trim(),
          client: form.client.trim(),
          address: form.address.trim(),
          lineItems,
          aiEstimate: aiResult,
          totalEstimate,
          createdAt: now,
          updatedAt: now,
        });
      }

      navigate(
        savedProject.status === "completed"
          ? "/app/projects/past"
          : "/app/projects/current"
      );
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The estimate could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  if (projectsLoading && editing) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500">
          Loading estimate...
        </p>
      </div>
    );
  }

  if (editing && !existing) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Estimate not found
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            This estimate may have been deleted or
            belongs to another account.
          </p>
          <button
            type="button"
            onClick={() =>
              navigate("/app/dashboard")
            }
            className="mt-5 text-sm font-semibold text-green-700 hover:underline cursor-pointer"
          >
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  const inputClass =
    "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-green-500/30 transition";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-7">
        <h1
          className="text-2xl font-bold text-gray-900"
          style={{
            fontFamily:
              "'Plus Jakarta Sans', sans-serif",
          }}
        >
          {existing
            ? "Edit Estimate"
            : "New Estimate"}
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Fill in the project details and save
          the estimate to this account.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">
              Project Details
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Project Name
                </label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setField(
                      "name",
                      event.target.value
                    )
                  }
                  placeholder="Backyard redesign"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Client Name
                </label>
                <input
                  value={form.client}
                  onChange={(event) =>
                    setField(
                      "client",
                      event.target.value
                    )
                  }
                  placeholder="Client name"
                  className={inputClass}
                />
              </div>

              <div className="sm:col-span-2">
                <label className={labelClass}>
                  Property Address
                </label>
                <input
                  value={form.address}
                  onChange={(event) =>
                    setField(
                      "address",
                      event.target.value
                    )
                  }
                  placeholder="Property address"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Project Type
                </label>
                <div className="relative">
                  <select
                    value={form.projectType}
                    onChange={(event) =>
                      setField(
                        "projectType",
                        event.target.value
                      )
                    }
                    className={
                      inputClass +
                      " appearance-none pr-8"
                    }
                  >
                    {PROJECT_TYPES.map((type) => (
                      <option key={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Square Footage
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.squareFootage}
                  onChange={(event) =>
                    setField(
                      "squareFootage",
                      Number(event.target.value)
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-gray-900 mb-4">
              Labor
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>
                  Hourly Rate ($)
                </label>
                <input
                  type="number"
                  min={0}
                  value={form.laborRate}
                  onChange={(event) =>
                    setField(
                      "laborRate",
                      Number(event.target.value)
                    )
                  }
                  className={inputClass}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Estimated Hours
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.laborHours}
                  onChange={(event) =>
                    setField(
                      "laborHours",
                      Number(event.target.value)
                    )
                  }
                  className={inputClass}
                />
              </div>
            </div>

            {laborCost > 0 && (
              <p className="text-sm text-gray-500 mt-3">
                Labor subtotal:{" "}
                <span className="font-semibold text-gray-800">
                  $
                  {laborCost.toLocaleString(
                    "en-US"
                  )}
                </span>
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900">
                Materials & Line Items
              </h2>
              <button
                type="button"
                onClick={() =>
                  setLineItems((items) => [
                    ...items,
                    blankItem(),
                  ])
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-green-700 hover:text-green-800 transition-colors cursor-pointer"
              >
                <Plus size={14} />
                Add Item
              </button>
            </div>

            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 px-1">
                {[
                  "Description",
                  "Qty",
                  "Unit",
                  "Unit Cost ($)",
                  "",
                ].map((heading, index) => (
                  <p
                    key={heading || "actions"}
                    className={`text-xs font-semibold text-gray-400 uppercase tracking-wide ${
                      index === 0
                        ? "col-span-4"
                        : index === 4
                          ? "col-span-1"
                          : "col-span-2"
                    }`}
                  >
                    {heading}
                  </p>
                ))}
              </div>

              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 items-center"
                >
                  <input
                    value={item.description}
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        "description",
                        event.target.value
                      )
                    }
                    placeholder="Material or service"
                    className={
                      inputClass + " col-span-4"
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    value={item.qty}
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        "qty",
                        Number(event.target.value)
                      )
                    }
                    className={
                      inputClass +
                      " col-span-2 text-center"
                    }
                  />
                  <input
                    value={item.unit}
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        "unit",
                        event.target.value
                      )
                    }
                    placeholder="each"
                    className={
                      inputClass + " col-span-2"
                    }
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={item.unitCost}
                    onChange={(event) =>
                      updateItem(
                        item.id,
                        "unitCost",
                        Number(event.target.value)
                      )
                    }
                    className={
                      inputClass + " col-span-3"
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      removeItem(item.id)
                    }
                    aria-label="Remove line item"
                    className="col-span-1 flex justify-center text-gray-300 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            {materialsCost > 0 && (
              <p className="text-sm text-gray-500 mt-3 pt-3 border-t border-gray-100">
                Materials subtotal:{" "}
                <span className="font-semibold text-gray-800">
                  $
                  {materialsCost.toLocaleString(
                    "en-US"
                  )}
                </span>
              </p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className={labelClass}>
              Notes
            </label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(event) =>
                setField(
                  "notes",
                  event.target.value
                )
              }
              placeholder="Client preferences, site conditions, special requirements..."
              className={
                inputClass + " resize-none"
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-4">
            <h2 className="font-bold text-gray-900 mb-4">
              Cost Summary
            </h2>

            <div className="space-y-2.5 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  Labor
                </span>
                <span className="font-medium text-gray-800">
                  $
                  {laborCost.toLocaleString(
                    "en-US"
                  )}
                </span>
              </div>

              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  Materials
                </span>
                <span className="font-medium text-gray-800">
                  $
                  {materialsCost.toLocaleString(
                    "en-US"
                  )}
                </span>
              </div>

              <div className="flex justify-between text-base font-bold border-t border-gray-100 pt-3 mt-1">
                <span className="text-gray-900">
                  Total
                </span>
                <span className="text-green-700">
                  $
                  {totalEstimate.toLocaleString(
                    "en-US"
                  )}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleAI}
              disabled={aiLoading || saving}
              className="w-full flex items-center justify-center gap-2 py-3 bg-green-700 text-white font-semibold rounded-lg hover:bg-green-800 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 mb-3"
            >
              {aiLoading ? (
                <Loader2
                  size={16}
                  className="animate-spin"
                />
              ) : (
                <Sparkles size={16} />
              )}
              {aiLoading
                ? "Generating..."
                : "Generate Estimate"}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || aiLoading}
              className="w-full py-3 border border-green-700 text-green-700 font-semibold rounded-lg hover:bg-green-50 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Saving..."
                : existing
                  ? "Save Changes"
                  : "Save Project"}
            </button>

            {saveError && (
              <p className="text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
                {saveError}
              </p>
            )}
          </div>

          {aiResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles
                  size={15}
                  className="text-green-700"
                />
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide">
                  Estimate Analysis
                </p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {aiResult}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}