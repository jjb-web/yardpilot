import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Eye,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { generateEstimate } from "../services/ai";
import type {
  EstimateStatus,
  LineItem,
  Project,
  ProjectStatus,
} from "../data/types";
import {
  calculateEstimate,
  formatMoney,
  propertyAddress,
} from "../lib/estimate";

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
  scheduledStart: string;
  scheduledEnd: string;
  followUpAt: string;
};

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11)
  );
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

function newEstimateNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `EST-${year}-${random}`;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

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
    scheduledStart: "",
    scheduledEnd: "",
    followUpAt: "",
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
    scheduledStart: toDateTimeLocal(project.scheduledStart),
    scheduledEnd: toDateTimeLocal(project.scheduledEnd),
    followUpAt: toDateTimeLocal(project.followUpAt),
  };
}

export default function EstimateBuilder() {
  const { id } = useParams<{ id: string }>();
  const {
    authUserId,
    activeWorkspaceId,
    projects,
    projectsLoading,
    contacts,
    properties,
    propertyPhotos,
    workspaceMembers,
    addProject,
    updateProject,
  } = useApp();
  const navigate = useNavigate();

  const editing = Boolean(id) && id !== "new";
  const existing = editing
    ? projects.find((project) => project.id === id) ?? null
    : null;

  const [form, setForm] = useState<EstimateForm>(() =>
    existing ? formFromProject(existing) : blankForm()
  );
  const [lineItems, setLineItems] = useState<LineItem[]>(() =>
    existing?.lineItems.length ? existing.lineItems : [blankItem()]
  );
  const [generatedDescription, setGeneratedDescription] = useState<
    string | null
  >(existing?.aiEstimate ?? null);
  const [assignedMemberIds, setAssignedMemberIds] = useState<string[]>(
    existing?.assignedMemberIds ?? []
  );
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    setSaveError("");
    if (existing) {
      setForm(formFromProject(existing));
      setLineItems(
        existing.lineItems.length ? existing.lineItems : [blankItem()]
      );
      setGeneratedDescription(existing.aiEstimate);
      setAssignedMemberIds(existing.assignedMemberIds);
      return;
    }
    if (!editing) {
      setForm(blankForm());
      setLineItems([blankItem()]);
      setGeneratedDescription(null);
      setAssignedMemberIds([]);
    }
  }, [editing, existing?.id]);

  const contactProperties = useMemo(
    () =>
      properties.filter(
        (property) => property.contactId === form.contactId
      ),
    [properties, form.contactId]
  );
  const selectedContact =
    contacts.find((contact) => contact.id === form.contactId) ?? null;
  const selectedProperty =
    properties.find((property) => property.id === form.propertyId) ?? null;
  const selectedPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === form.propertyId
  );
  const assignableMembers = workspaceMembers.filter(
    (member) => member.role !== "owner" || workspaceMembers.length === 1
  );

  const totals = calculateEstimate({
    lineItems,
    laborHours: form.laborHours,
    laborRate: form.laborRate,
    taxRate: form.taxRate,
    discountAmount: form.discountAmount,
  });

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  function setField<K extends keyof EstimateForm>(
    key: K,
    value: EstimateForm[K]
  ) {
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
        ? [
            contact.address,
            [contact.city, contact.state, contact.zip]
              .filter(Boolean)
              .join(" "),
          ]
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

  function updateItem<K extends keyof LineItem>(
    itemId: string,
    key: K,
    value: LineItem[K]
  ) {
    setLineItems((items) =>
      items.map((item) =>
        item.id === itemId ? { ...item, [key]: value } : item
      )
    );
  }

  function removeItem(itemId: string) {
    setLineItems((items) => {
      const remaining = items.filter((item) => item.id !== itemId);
      return remaining.length ? remaining : [blankItem()];
    });
  }

  function toggleAssignment(userId: string) {
    setAssignedMemberIds((current) =>
      current.includes(userId)
        ? current.filter((idValue) => idValue !== userId)
        : [...current, userId]
    );
  }

  async function handleGenerateDescription() {
    setGenerating(true);
    setSaveError("");
    try {
      const result = await generateEstimate({
        ...(existing ?? {}),
        ...form,
        contactId: form.contactId || null,
        propertyId: form.propertyId || null,
        validUntil: form.validUntil || null,
        scheduledStart: toIso(form.scheduledStart),
        scheduledEnd: toIso(form.scheduledEnd),
        followUpAt: toIso(form.followUpAt),
        lineItems,
        totalEstimate: totals.total,
      });
      setGeneratedDescription(result);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The description could not be generated."
      );
    } finally {
      setGenerating(false);
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
    if (!activeWorkspaceId || !authUserId) {
      setSaveError("Your workspace is still loading.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();

    try {
      let savedProject: Project;
      const common = {
        ...form,
        name: form.name.trim(),
        client: form.client.trim(),
        address: form.address.trim(),
        contactId: form.contactId || null,
        propertyId: form.propertyId || null,
        validUntil: form.validUntil || null,
        scheduledStart: toIso(form.scheduledStart),
        scheduledEnd: toIso(form.scheduledEnd),
        followUpAt: toIso(form.followUpAt),
        lineItems,
        aiEstimate: generatedDescription,
        totalEstimate: totals.total,
        assignedMemberIds,
      };

      if (existing) {
        savedProject = await updateProject({
          ...existing,
          ...common,
          updatedAt: now,
        });
      } else {
        savedProject = await addProject({
          id: uid(),
          workspaceId: activeWorkspaceId,
          createdBy: authUserId,
          ...common,
          shareToken: globalThis.crypto.randomUUID(),
          shareEnabled: false,
          createdAt: now,
          updatedAt: now,
        });
      }

      navigate(`/app/estimates/${savedProject.id}`);
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
      <div className="p-6 max-w-5xl mx-auto text-sm text-gray-500">
        Loading estimate...
      </div>
    );
  }

  if (editing && !existing) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Estimate not found
          </h1>
          <button
            type="button"
            onClick={() => navigate("/app/estimates")}
            className="mt-5 text-sm font-semibold text-green-700 cursor-pointer"
          >
            Return to estimates
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 cursor-pointer"
          >
            <ArrowLeft size={17} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editing ? "Edit Estimate" : "New Estimate"}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Build the client document, schedule the work, and assign the crew.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleGenerateDescription()}
            disabled={generating}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-green-200 bg-green-50 text-green-700 text-sm font-semibold hover:bg-green-100 disabled:opacity-60 cursor-pointer"
          >
            {generating ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Generate Description
          </button>
          {existing && (
            <button
              type="button"
              onClick={() => navigate(`/app/estimates/${existing.id}`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold cursor-pointer"
            >
              <Eye size={16} /> Preview
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Save size={16} />
            )}
            {editing ? "Update Estimate" : "Save Estimate"}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="mb-5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {saveError}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="space-y-5">
          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-5">
              Estimate details
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Estimate / Project Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="Backyard renovation"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Customer</label>
                <select
                  value={form.contactId}
                  onChange={(event) => chooseContact(event.target.value)}
                  className={inputClass}
                >
                  <option value="">No linked contact</option>
                  {contacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Property</label>
                <select
                  value={form.propertyId}
                  onChange={(event) => chooseProperty(event.target.value)}
                  disabled={!form.contactId}
                  className={inputClass}
                >
                  <option value="">No linked property</option>
                  {contactProperties.map((property) => (
                    <option key={property.id} value={property.id}>
                      {property.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Customer Name</label>
                <input
                  value={form.client}
                  onChange={(event) => setField("client", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Address</label>
                <input
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Estimate Number</label>
                <input
                  value={form.estimateNumber}
                  onChange={(event) =>
                    setField("estimateNumber", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Estimate Status</label>
                <select
                  value={form.estimateStatus}
                  onChange={(event) =>
                    setField(
                      "estimateStatus",
                      event.target.value as EstimateStatus
                    )
                  }
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Issue Date</label>
                <input
                  type="date"
                  value={form.issueDate}
                  onChange={(event) =>
                    setField("issueDate", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Valid Until</label>
                <input
                  type="date"
                  value={form.validUntil}
                  onChange={(event) =>
                    setField("validUntil", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Project Type</label>
                <select
                  value={form.projectType}
                  onChange={(event) =>
                    setField("projectType", event.target.value)
                  }
                  className={inputClass}
                >
                  {PROJECT_TYPES.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Job Status</label>
                <select
                  value={form.status}
                  onChange={(event) =>
                    setField("status", event.target.value as ProjectStatus)
                  }
                  className={inputClass}
                >
                  <option value="active">Active / Current</option>
                  <option value="completed">Completed</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Square Footage</label>
                <input
                  type="number"
                  min="0"
                  value={form.squareFootage}
                  onChange={(event) =>
                    setField("squareFootage", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-5">
              <CalendarDays size={18} className="text-green-700" />
              <h2 className="font-bold text-gray-900">
                Schedule and follow-up
              </h2>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Job / Appointment Start</label>
                <input
                  type="datetime-local"
                  value={form.scheduledStart}
                  onChange={(event) =>
                    setField("scheduledStart", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Scheduled End</label>
                <input
                  type="datetime-local"
                  value={form.scheduledEnd}
                  onChange={(event) =>
                    setField("scheduledEnd", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Follow-up Date</label>
                <input
                  type="datetime-local"
                  value={form.followUpAt}
                  onChange={(event) =>
                    setField("followUpAt", event.target.value)
                  }
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">
                  Scheduling the job or adding a follow-up automatically adds
                  reminders to Schedule and Follow-ups.
                </p>
              </div>
            </div>

            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-green-700" />
                <p className="font-semibold text-gray-900 text-sm">
                  Assigned team members
                </p>
              </div>
              {assignableMembers.length === 0 ? (
                <p className="text-sm text-gray-400">
                  Add employees or partners from the Team tab.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 gap-2">
                  {assignableMembers.map((member) => (
                    <label
                      key={member.userId}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={assignedMemberIds.includes(member.userId)}
                        onChange={() => toggleAssignment(member.userId)}
                        className="accent-green-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-gray-800 truncate">
                          {member.name}
                        </span>
                        <span className="block text-xs text-gray-400 capitalize">
                          {member.role}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-bold text-gray-900 mb-5">
              Scope, generated description, and notes
            </h2>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Scope Description</label>
                <textarea
                  value={form.scopeDescription}
                  onChange={(event) =>
                    setField("scopeDescription", event.target.value)
                  }
                  rows={5}
                  placeholder="Describe exactly what work is included..."
                  className={inputClass}
                />
              </div>
              <div>
                <div className="flex items-center justify-between gap-3 mb-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Optional Generated Description
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateDescription()}
                    disabled={generating}
                    className="text-xs font-semibold text-green-700 cursor-pointer"
                  >
                    Generate from estimate data
                  </button>
                </div>
                <textarea
                  value={generatedDescription ?? ""}
                  onChange={(event) =>
                    setGeneratedDescription(event.target.value || null)
                  }
                  rows={5}
                  placeholder="Generate a clean client-ready paragraph, or write your own."
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">
                  This uses your existing local generator. It does not call an
                  outside AI service. The paragraph is included in the shared
                  and downloaded estimate.
                </p>
              </div>
              <div>
                <label className={labelClass}>Client-visible Notes</label>
                <textarea
                  value={form.clientNotes}
                  onChange={(event) =>
                    setField("clientNotes", event.target.value)
                  }
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Internal Notes — not shared
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Terms</label>
                <textarea
                  value={form.terms}
                  onChange={(event) => setField("terms", event.target.value)}
                  rows={4}
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-gray-900">
                Materials and services
              </h2>
              <button
                type="button"
                onClick={() =>
                  setLineItems((items) => [...items, blankItem()])
                }
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 cursor-pointer"
              >
                <Plus size={15} /> Add line
              </button>
            </div>

            <div className="space-y-3">
              {lineItems.map((item) => (
                <div
                  key={item.id}
                  className="grid grid-cols-12 gap-2 items-end rounded-xl bg-gray-50 border border-gray-100 p-3"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <label className={labelClass}>Description</label>
                    <input
                      value={item.description}
                      onChange={(event) =>
                        updateItem(item.id, "description", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Qty</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.qty}
                      onChange={(event) =>
                        updateItem(item.id, "qty", Number(event.target.value))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit</label>
                    <input
                      value={item.unit}
                      onChange={(event) =>
                        updateItem(item.id, "unit", event.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit Cost</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitCost}
                      onChange={(event) =>
                        updateItem(
                          item.id,
                          "unitCost",
                          Number(event.target.value)
                        )
                      }
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="col-span-12 sm:col-span-1 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-5">
              <div>
                <label className={labelClass}>Labor Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.25"
                  value={form.laborHours}
                  onChange={(event) =>
                    setField("laborHours", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Labor Rate</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.laborRate}
                  onChange={(event) =>
                    setField("laborRate", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Tax Rate %</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.taxRate}
                  onChange={(event) =>
                    setField("taxRate", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Discount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.discountAmount}
                  onChange={(event) =>
                    setField("discountAmount", Number(event.target.value))
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6">
          <div className="bg-green-950 text-white rounded-2xl p-6">
            <p className="text-xs uppercase tracking-wider font-bold text-green-300">
              Estimate total
            </p>
            <p className="text-4xl font-extrabold mt-2">
              {formatMoney(totals.total)}
            </p>
            <div className="mt-5 pt-5 border-t border-white/10 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-green-200">Materials</span>
                <span>{formatMoney(totals.materials)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-200">Labor</span>
                <span>{formatMoney(totals.labor)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-200">Tax</span>
                <span>{formatMoney(totals.tax)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-200">Discount</span>
                <span>-{formatMoney(totals.discount)}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <ImageIcon size={16} className="text-green-700" />
              <h3 className="font-bold text-gray-900">Linked property</h3>
            </div>
            {selectedProperty ? (
              <div>
                <p className="font-semibold text-gray-900">
                  {selectedProperty.name}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  {propertyAddress(selectedProperty)}
                </p>
                {selectedProperty.description && (
                  <p className="text-sm text-gray-600 mt-3">
                    {selectedProperty.description}
                  </p>
                )}
                {selectedPhotos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {selectedPhotos.slice(0, 6).map((photo) => (
                      <img
                        key={photo.id}
                        src={photo.url}
                        alt={photo.caption || "Property"}
                        className="w-full aspect-square rounded-lg object-cover border border-gray-200"
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">
                Choose a contact and property. Properties are managed inside
                Contacts.
              </p>
            )}
          </div>

          {selectedContact && (
            <div className="bg-white rounded-xl border border-gray-200 p-5 text-sm">
              <p className="text-xs uppercase tracking-wider font-bold text-gray-400 mb-2">
                Customer
              </p>
              <p className="font-bold text-gray-900">
                {selectedContact.name}
              </p>
              {selectedContact.email && (
                <p className="text-gray-500 mt-1">
                  {selectedContact.email}
                </p>
              )}
              {selectedContact.phone && (
                <p className="text-gray-500">{selectedContact.phone}</p>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
