import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  ChevronDown,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { generateEstimate } from "../services/ai";
import type {
  EstimateStatus,
  LineItem,
  Project,
  ProjectStatus,
} from "../data/types";
import { calculateEstimate, formatMoney, propertyAddress } from "../lib/estimate";

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

const DEFAULT_TERMS =
  "Pricing is valid through the date shown above. Changes to the scope, concealed site conditions, permit costs, or customer-requested additions may change the final price. Scheduling begins after approval.";

type EstimateForm = {
  name: string;
  client: string;
  address: string;
  contactId: string;
  propertyId: string;
  projectType: string;
  squareFootage: number;
  laborRate: number;
  laborHours: number;
  notes: string;
  status: ProjectStatus;
  estimateStatus: EstimateStatus;
  estimateNumber: string;
  issueDate: string;
  validUntil: string;
  scopeDescription: string;
  clientNotes: string;
  terms: string;
  taxRate: number;
  discountAmount: number;
};

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function newEstimateNumber() {
  const date = new Date();
  const year = date.getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `EST-${year}-${random}`;
}

function blankItem(): LineItem {
  return { id: uid(), description: "", qty: 1, unit: "each", unitCost: 0 };
}

function blankForm(): EstimateForm {
  const today = new Date();
  return {
    name: "",
    client: "",
    address: "",
    contactId: "",
    propertyId: "",
    projectType: PROJECT_TYPES[0],
    squareFootage: 0,
    laborRate: 65,
    laborHours: 0,
    notes: "",
    status: "active",
    estimateStatus: "draft",
    estimateNumber: newEstimateNumber(),
    issueDate: today.toISOString().slice(0, 10),
    validUntil: addDays(today, 30),
    scopeDescription: "",
    clientNotes: "",
    terms: DEFAULT_TERMS,
    taxRate: 0,
    discountAmount: 0,
  };
}

function formFromProject(project: Project): EstimateForm {
  return {
    name: project.name,
    client: project.client,
    address: project.address,
    contactId: project.contactId ?? "",
    propertyId: project.propertyId ?? "",
    projectType: project.projectType,
    squareFootage: project.squareFootage,
    laborRate: project.laborRate,
    laborHours: project.laborHours,
    notes: project.notes,
    status: project.status,
    estimateStatus: project.estimateStatus,
    estimateNumber: project.estimateNumber,
    issueDate: project.issueDate,
    validUntil: project.validUntil ?? "",
    scopeDescription: project.scopeDescription,
    clientNotes: project.clientNotes,
    terms: project.terms,
    taxRate: project.taxRate,
    discountAmount: project.discountAmount,
  };
}

export default function EstimateBuilder() {
  const { id } = useParams<{ id: string }>();
  const {
    projects,
    projectsLoading,
    contacts,
    properties,
    propertyPhotos,
    addProject,
    updateProject,
  } = useApp();
  const navigate = useNavigate();

  const editing = Boolean(id) && id !== "new";
  const existing = editing ? projects.find((project) => project.id === id) ?? null : null;

  const [form, setForm] = useState<EstimateForm>(() =>
    existing ? formFromProject(existing) : blankForm()
  );
  const [lineItems, setLineItems] = useState<LineItem[]>(() =>
    existing?.lineItems.length ? existing.lineItems : [blankItem()]
  );
  const [aiResult, setAiResult] = useState<string | null>(existing?.aiEstimate ?? null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setSaveError("");
    if (existing) {
      setForm(formFromProject(existing));
      setLineItems(existing.lineItems.length ? existing.lineItems : [blankItem()]);
      setAiResult(existing.aiEstimate);
      return;
    }
    if (!editing) {
      setForm(blankForm());
      setLineItems([blankItem()]);
      setAiResult(null);
    }
  }, [editing, existing?.id]);

  const contactProperties = useMemo(
    () => properties.filter((property) => property.contactId === form.contactId),
    [properties, form.contactId]
  );
  const selectedContact = contacts.find((contact) => contact.id === form.contactId) ?? null;
  const selectedProperty = properties.find((property) => property.id === form.propertyId) ?? null;
  const selectedPhotos = propertyPhotos.filter((photo) => photo.propertyId === form.propertyId);

  const totals = calculateEstimate({
    lineItems,
    laborHours: form.laborHours,
    laborRate: form.laborRate,
    taxRate: form.taxRate,
    discountAmount: form.discountAmount,
  });

  function setField<K extends keyof EstimateForm>(key: K, value: EstimateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function chooseContact(contactId: string) {
    const contact = contacts.find((item) => item.id === contactId);
    setForm((current) => ({
      ...current,
      contactId,
      propertyId: "",
      client: contact?.name ?? current.client,
      address: contact
        ? [contact.address, [contact.city, contact.state, contact.zip].filter(Boolean).join(" ")]
            .filter(Boolean)
            .join(", ")
        : current.address,
    }));
  }

  function chooseProperty(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      address: propertyAddress(property) || current.address,
      name: current.name || property?.name || "",
    }));
  }

  function updateItem<K extends keyof LineItem>(itemId: string, key: K, value: LineItem[K]) {
    setLineItems((items) =>
      items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item))
    );
  }

  function removeItem(itemId: string) {
    setLineItems((items) => {
      const remaining = items.filter((item) => item.id !== itemId);
      return remaining.length ? remaining : [blankItem()];
    });
  }

  async function handleAI() {
    setAiLoading(true);
    try {
      const result = await generateEstimate({
        ...form,
        contactId: form.contactId || null,
        propertyId: form.propertyId || null,
        validUntil: form.validUntil || null,
        lineItems,
        totalEstimate: totals.total,
      });
      setAiResult(result);
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSave() {
    setSaveError("");
    if (!form.name.trim()) {
      setSaveError("Enter an estimate or project name before saving.");
      return;
    }
    if (!form.estimateNumber.trim()) {
      setSaveError("Enter an estimate number.");
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
          contactId: form.contactId || null,
          propertyId: form.propertyId || null,
          validUntil: form.validUntil || null,
          lineItems,
          aiEstimate: aiResult,
          totalEstimate: totals.total,
          updatedAt: now,
        });
      } else {
        savedProject = await addProject({
          id: uid(),
          ...form,
          name: form.name.trim(),
          client: form.client.trim(),
          address: form.address.trim(),
          contactId: form.contactId || null,
          propertyId: form.propertyId || null,
          validUntil: form.validUntil || null,
          lineItems,
          aiEstimate: aiResult,
          totalEstimate: totals.total,
          shareToken: globalThis.crypto.randomUUID(),
          shareEnabled: false,
          createdAt: now,
          updatedAt: now,
        });
      }
      navigate(`/app/estimates/${savedProject.id}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "The estimate could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  if (projectsLoading && editing) {
    return <div className="p-6 max-w-5xl mx-auto text-sm text-gray-500">Loading estimate...</div>;
  }

  if (editing && !existing) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">Estimate not found</h1>
          <button
            type="button"
            onClick={() => navigate("/app/estimates")}
            className="mt-5 text-sm font-semibold text-green-700 hover:underline cursor-pointer"
          >
            Return to estimates
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <button
            type="button"
            onClick={() => navigate("/app/estimates")}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 cursor-pointer mb-2"
          >
            <ArrowLeft size={15} /> Estimates
          </button>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {editing ? "Edit Estimate" : "Create Estimate"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Build the client document and connect it to a customer and property.
          </p>
        </div>
        <div className="flex gap-2">
          {existing && (
            <button
              type="button"
              onClick={() => navigate(`/app/estimates/${existing.id}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold hover:bg-gray-50 cursor-pointer"
            >
              <Eye size={15} /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60 cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save Estimate"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          {saveError}
        </div>
      )}

      <div className="grid lg:grid-cols-[1.6fr_0.75fr] gap-6 items-start">
        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-5">Client and estimate details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Contact</label>
                <div className="relative">
                  <select
                    value={form.contactId}
                    onChange={(event) => chooseContact(event.target.value)}
                    className={`${inputClass} appearance-none pr-9`}
                  >
                    <option value="">No linked contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Property</label>
                <div className="relative">
                  <select
                    value={form.propertyId}
                    onChange={(event) => chooseProperty(event.target.value)}
                    disabled={!form.contactId}
                    className={`${inputClass} appearance-none pr-9 disabled:bg-gray-100 disabled:text-gray-400`}
                  >
                    <option value="">No linked property</option>
                    {contactProperties.map((property) => (
                      <option key={property.id} value={property.id}>{property.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Estimate Number</label>
                <input value={form.estimateNumber} onChange={(event) => setField("estimateNumber", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Estimate Status</label>
                <select value={form.estimateStatus} onChange={(event) => setField("estimateStatus", event.target.value as EstimateStatus)} className={inputClass}>
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Issue Date</label>
                <input type="date" value={form.issueDate} onChange={(event) => setField("issueDate", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Valid Until</label>
                <input type="date" value={form.validUntil} onChange={(event) => setField("validUntil", event.target.value)} className={inputClass} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Estimate / Project Name</label>
                <input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Johnson backyard renovation" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Client Name</label>
                <input value={form.client} onChange={(event) => setField("client", event.target.value)} placeholder="Jordan Johnson" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Service Address</label>
                <input value={form.address} onChange={(event) => setField("address", event.target.value)} placeholder="123 Main St, Salem, OR 97301" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Project Type</label>
                <select value={form.projectType} onChange={(event) => setField("projectType", event.target.value)} className={inputClass}>
                  {PROJECT_TYPES.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Job Record Status</label>
                <select value={form.status} onChange={(event) => setField("status", event.target.value as ProjectStatus)} className={inputClass}>
                  <option value="active">Active / Current</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Square Footage</label>
                <input type="number" min="0" value={form.squareFootage} onChange={(event) => setField("squareFootage", Number(event.target.value))} className={inputClass} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-5">Scope, notes, and terms</h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Scope Description</label>
                <textarea value={form.scopeDescription} onChange={(event) => setField("scopeDescription", event.target.value)} rows={5} placeholder="Describe exactly what work is included..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Client-visible Notes</label>
                <textarea value={form.clientNotes} onChange={(event) => setField("clientNotes", event.target.value)} rows={3} placeholder="Access instructions, preparation, warranty notes..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Internal Notes (not shared)</label>
                <textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={3} placeholder="Crew notes, supplier details, private reminders..." className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Terms</label>
                <textarea value={form.terms} onChange={(event) => setField("terms", event.target.value)} rows={4} className={inputClass} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900">Materials and services</h2>
              <button type="button" onClick={() => setLineItems((items) => [...items, blankItem()])} className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 cursor-pointer">
                <Plus size={15} /> Add line
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item) => (
                <div key={item.id} className="grid grid-cols-12 gap-2 items-end rounded-xl bg-gray-50 border border-gray-100 p-3">
                  <div className="col-span-12 sm:col-span-5">
                    <label className={labelClass}>Description</label>
                    <input value={item.description} onChange={(event) => updateItem(item.id, "description", event.target.value)} placeholder="Mulch, plants, disposal..." className={inputClass} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Qty</label>
                    <input type="number" min="0" step="0.01" value={item.qty} onChange={(event) => updateItem(item.id, "qty", Number(event.target.value))} className={inputClass} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit</label>
                    <input value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} className={inputClass} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit Cost</label>
                    <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateItem(item.id, "unitCost", Number(event.target.value))} className={inputClass} />
                  </div>
                  <button type="button" onClick={() => removeItem(item.id)} aria-label="Remove line item" className="col-span-12 sm:col-span-1 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div>
                <label className={labelClass}>Labor Hours</label>
                <input type="number" min="0" step="0.25" value={form.laborHours} onChange={(event) => setField("laborHours", Number(event.target.value))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Labor Rate</label>
                <input type="number" min="0" step="0.01" value={form.laborRate} onChange={(event) => setField("laborRate", Number(event.target.value))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Tax Rate %</label>
                <input type="number" min="0" max="100" step="0.01" value={form.taxRate} onChange={(event) => setField("taxRate", Number(event.target.value))} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Discount Amount</label>
                <input type="number" min="0" step="0.01" value={form.discountAmount} onChange={(event) => setField("discountAmount", Number(event.target.value))} className={inputClass} />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="font-bold text-gray-900">Estimate summary</h2>
                <p className="text-xs text-gray-500 mt-1">Optional internal pricing summary.</p>
              </div>
              <button type="button" onClick={() => void handleAI()} disabled={aiLoading} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 disabled:opacity-60 cursor-pointer">
                {aiLoading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                Generate Summary
              </button>
            </div>
            {aiResult ? (
              <textarea value={aiResult} onChange={(event) => setAiResult(event.target.value)} rows={5} className={inputClass} />
            ) : (
              <p className="text-sm text-gray-400">No summary generated.</p>
            )}
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="bg-green-950 text-white rounded-2xl p-6">
            <p className="text-xs uppercase tracking-wider font-bold text-green-300">Estimate total</p>
            <p className="text-4xl font-extrabold mt-2">{formatMoney(totals.total)}</p>
            <div className="mt-5 pt-5 border-t border-white/10 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-green-200">Materials</span><span>{formatMoney(totals.materials)}</span></div>
              <div className="flex justify-between"><span className="text-green-200">Labor</span><span>{formatMoney(totals.labor)}</span></div>
              <div className="flex justify-between"><span className="text-green-200">Tax</span><span>{formatMoney(totals.tax)}</span></div>
              <div className="flex justify-between"><span className="text-green-200">Discount</span><span>-{formatMoney(totals.discount)}</span></div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon size={16} className="text-green-700" />
              <h3 className="font-bold text-gray-900">Linked property</h3>
            </div>
            {selectedProperty ? (
              <div>
                <p className="font-semibold text-gray-900">{selectedProperty.name}</p>
                <p className="text-sm text-gray-500 mt-1">{propertyAddress(selectedProperty)}</p>
                {selectedProperty.description && <p className="text-sm text-gray-600 mt-3 line-clamp-4">{selectedProperty.description}</p>}
                {selectedPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {selectedPhotos.slice(0, 6).map((photo) => (
                      <img key={photo.id} src={photo.url} alt={photo.caption || "Property"} className="w-full aspect-square rounded-lg object-cover border border-gray-200" />
                    ))}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-3">
                  Property descriptions, client notes, and photos are included in the shared/downloaded estimate.
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Choose a contact and property. Properties are managed inside Contacts.
              </p>
            )}
          </div>

          {selectedContact && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm">
              <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-2">Customer</p>
              <p className="font-bold text-gray-900">{selectedContact.name}</p>
              {selectedContact.email && <p className="text-gray-500 mt-1">{selectedContact.email}</p>}
              {selectedContact.phone && <p className="text-gray-500">{selectedContact.phone}</p>}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
