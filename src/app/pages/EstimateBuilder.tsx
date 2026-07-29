import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  LaborAssignment,
  LineItem,
  Project,
  ProjectBillingMethod,
  ProjectStatus,
} from "../data/types";
import {
  calculateEstimate,
  formatMoney,
  laborAssignmentsTotal,
  propertyAddress,
} from "../lib/estimate";

const PROJECT_TYPES = [
  "Lawn Mowing & Edging",
  "Lawn Maintenance",
  "Spring / Fall Cleanup",
  "Leaf Removal",
  "Aeration",
  "Dethatching",
  "Fertilization",
  "Weed Control",
  "Landscape Design",
  "Planting & Garden Beds",
  "Mulching & Beds",
  "Decorative Rock Installation",
  "Sod Installation",
  "Artificial Turf",
  "Irrigation Installation",
  "Irrigation Repair",
  "Drainage",
  "Grading & Excavation",
  "Hardscaping",
  "Paver Patio / Walkway",
  "Retaining Wall",
  "Fence Installation / Repair",
  "Tree & Shrub Care",
  "Pruning & Trimming",
  "Stump / Brush Removal",
  "Outdoor Lighting",
  "Pressure Washing",
];

const CUSTOM_PROJECT_TYPE = "__custom__";

const UNIT_OPTIONS = [
  "each",
  "sq ft",
  "linear ft",
  "yard",
  "ton",
  "bag",
  "hour",
  "day",
  "flat",
];

const DEFAULT_TERMS =
  "Pricing is valid through the date shown above. Changes to the scope, concealed site conditions, permit costs, or customer-requested additions may change the final price. Scheduling begins after approval.";

type EstimateForm = {
  name: string;
  client: string;
  address: string;
  city: string;
  contactId: string;
  propertyId: string;
  projectType: string;
  billingMethod: ProjectBillingMethod;
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

type SavedDraft = {
  savedAt: string;
  form: EstimateForm;
  lineItems: LineItem[];
  generatedDescription: string | null;
  laborAssignments: LaborAssignment[];
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
    city: "",
    contactId: "",
    propertyId: "",
    projectType: PROJECT_TYPES[0],
    billingMethod: "fixed",
    squareFootage: 0,
    laborRate: 0,
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
    city: project.city,
    contactId: project.contactId ?? "",
    propertyId: project.propertyId ?? "",
    projectType: project.projectType,
    billingMethod: project.billingMethod,
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

function numericText(value: number) {
  return value === 0 || Number.isNaN(value) ? "" : String(value);
}

function parseNumeric(value: string) {
  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized || normalized === "-" || normalized === ".") return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
  const draftReadyRef = useRef(false);

  const editing = Boolean(id) && id !== "new";
  const existing = editing
    ? projects.find((project) => project.id === id) ?? null
    : null;

  const [form, setForm] = useState<EstimateForm>(blankForm);
  const [lineItems, setLineItems] = useState<LineItem[]>([blankItem()]);
  const [generatedDescription, setGeneratedDescription] = useState<
    string | null
  >(null);
  const [laborAssignments, setLaborAssignments] = useState<
    LaborAssignment[]
  >([]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");

  const draftKey = useMemo(
    () =>
      activeWorkspaceId
        ? `yardpilot-estimate-draft:${activeWorkspaceId}:${editing ? id : "new"}`
        : "",
    [activeWorkspaceId, editing, id]
  );

  useEffect(() => {
    if (editing && projectsLoading) return;
    if (editing && !existing) return;

    const baseForm = existing ? formFromProject(existing) : blankForm();
    const baseItems = existing?.lineItems.length
      ? existing.lineItems
      : [blankItem()];
    const baseDescription = existing?.aiEstimate ?? null;
    const baseLabor = existing?.laborAssignments ?? [];

    let restored = false;
    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as SavedDraft;
          const savedTime = new Date(draft.savedAt).getTime();
          const projectTime = existing
            ? new Date(existing.updatedAt).getTime()
            : 0;
          if (!existing || savedTime > projectTime) {
            setForm(draft.form);
            setLineItems(
              draft.lineItems?.length ? draft.lineItems : [blankItem()]
            );
            setGeneratedDescription(draft.generatedDescription ?? null);
            setLaborAssignments(draft.laborAssignments ?? []);
            setDraftMessage("Unsaved draft restored.");
            restored = true;
          }
        }
      } catch {
        localStorage.removeItem(draftKey);
      }
    }

    if (!restored) {
      setForm(baseForm);
      setLineItems(baseItems);
      setGeneratedDescription(baseDescription);
      setLaborAssignments(baseLabor);
      setDraftMessage("");
    }

    setSaveError("");
    draftReadyRef.current = true;
  }, [draftKey, editing, existing?.id, existing?.updatedAt, projectsLoading]);

  useEffect(() => {
    if (!draftKey || !draftReadyRef.current) return;
    const timer = window.setTimeout(() => {
      const draft: SavedDraft = {
        savedAt: new Date().toISOString(),
        form,
        lineItems,
        generatedDescription,
        laborAssignments,
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftKey, form, lineItems, generatedDescription, laborAssignments]);

  const contactProperties = useMemo(
    () =>
      properties.filter((property) => property.contactId === form.contactId),
    [properties, form.contactId]
  );
  const selectedContact =
    contacts.find((contact) => contact.id === form.contactId) ?? null;
  const selectedProperty =
    properties.find((property) => property.id === form.propertyId) ?? null;
  const selectedPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === form.propertyId
  );

  const totals = calculateEstimate({
    lineItems,
    laborAssignments,
    laborHours: form.laborHours,
    laborRate: form.laborRate,
    taxRate: form.taxRate,
    discountAmount: form.discountAmount,
  });
  const combinedLaborHours = laborAssignments.length
    ? laborAssignments.reduce(
        (sum, assignment) => sum + Number(assignment.hours || 0),
        0
      )
    : form.laborHours;
  const usesCustomProjectType = !PROJECT_TYPES.includes(form.projectType);

  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30";
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
      address: contact?.address ?? current.address,
      city: contact?.city ?? current.city,
    }));
  }

  function chooseProperty(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    setForm((current) => ({
      ...current,
      propertyId,
      address: property?.address || current.address,
      city: property?.city || current.city,
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

  function toggleLaborMember(userId: string) {
    const member = workspaceMembers.find((item) => item.userId === userId);
    if (!member) return;
    setLaborAssignments((current) => {
      const exists = current.some((assignment) => assignment.userId === userId);
      if (exists) {
        return current.filter((assignment) => assignment.userId !== userId);
      }
      return [
        ...current,
        {
          userId,
          name: member.name,
          hours: 0,
          hourlyRate: member.hourlyRate,
        },
      ];
    });
  }

  function updateLaborAssignment(
    userId: string,
    key: "hours" | "hourlyRate",
    value: number
  ) {
    setLaborAssignments((current) =>
      current.map((assignment) =>
        assignment.userId === userId
          ? { ...assignment, [key]: Math.max(0, value) }
          : assignment
      )
    );
  }

  async function handleGenerateDescription() {
    setGenerating(true);
    setSaveError("");
    try {
      const totalHours = laborAssignments.reduce(
        (sum, assignment) => sum + assignment.hours,
        0
      );
      const laborTotal = laborAssignmentsTotal(laborAssignments);
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
        laborAssignments,
        laborHours: laborAssignments.length ? totalHours : form.laborHours,
        laborRate:
          laborAssignments.length && totalHours > 0
            ? laborTotal / totalHours
            : form.laborRate,
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
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!form.estimateNumber.trim()) {
      setSaveError("Enter an estimate number.");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    if (!activeWorkspaceId || !authUserId) {
      setSaveError("Your workspace is still loading.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const totalLaborHours = laborAssignments.length
      ? laborAssignments.reduce(
          (sum, assignment) => sum + Number(assignment.hours || 0),
          0
        )
      : form.laborHours;
    const laborTotal = laborAssignments.length
      ? laborAssignmentsTotal(laborAssignments)
      : form.laborHours * form.laborRate;
    const averageLaborRate =
      totalLaborHours > 0 ? laborTotal / totalLaborHours : 0;

    try {
      let savedProject: Project;
      const common = {
        ...form,
        name: form.name.trim(),
        client: form.client.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        contactId: form.contactId || null,
        propertyId: form.propertyId || null,
        validUntil: form.validUntil || null,
        lineItems,
        laborAssignments,
        laborHours: totalLaborHours,
        laborRate: averageLaborRate,
        aiEstimate: generatedDescription,
        totalEstimate: totals.total,
        scheduledStart: toIso(form.scheduledStart),
        scheduledEnd: toIso(form.scheduledEnd),
        followUpAt: toIso(form.followUpAt),
        assignedMemberIds: laborAssignments.map(
          (assignment) => assignment.userId
        ),
        updatedAt: now,
      };

      if (existing) {
        savedProject = await updateProject({ ...existing, ...common });
      } else {
        savedProject = await addProject({
          id: uid(),
          workspaceId: activeWorkspaceId,
          createdBy: authUserId,
          ...common,
          shareToken: globalThis.crypto.randomUUID(),
          shareEnabled: false,
          sentAt: null,
          viewedAt: null,
          respondedAt: null,
          acceptedAt: null,
          declinedAt: null,
          responseName: "",
          responseMessage: "",
          signatureData: "",
          createdAt: now,
        });
      }

      if (draftKey) localStorage.removeItem(draftKey);
      navigate(`/app/estimates/${savedProject.id}`);
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The estimate could not be saved."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }

  const SaveActions = () => (
    <div className="flex items-center justify-end">
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="inline-flex justify-center items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 cursor-pointer disabled:opacity-60"
      >
        {saving ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <Save size={16} />
        )}
        {editing ? "Update Estimate" : "Save Estimate"}
      </button>
    </div>
  );

  if (projectsLoading && editing) {
    return (
      <div className="p-6 max-w-4xl mx-auto text-sm text-gray-500">
        Loading estimate...
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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900 cursor-pointer mb-3"
          >
            <ArrowLeft size={16} /> Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {editing ? "Edit Estimate" : "Create Estimate"}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Changes are saved as a browser draft until you save the estimate.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {editing && existing && (
            <button
              type="button"
              onClick={() => navigate(`/app/estimates/${existing.id}`)}
              className="inline-flex justify-center items-center gap-2 px-4 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-semibold cursor-pointer"
            >
              <Eye size={16} /> View Estimate
            </button>
          )}
          <SaveActions />
        </div>
      </div>

      {saveError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {saveError}
        </div>
      )}
      {draftMessage && (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {draftMessage}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        <div className="space-y-6">
          <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <h2 className="font-bold text-gray-900 mb-5">Estimate details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Estimate / Project Name</label>
                <input
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Contact</label>
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
                <label className={labelClass}>Client Name</label>
                <input
                  value={form.client}
                  onChange={(event) => setField("client", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Street Address</label>
                <input
                  value={form.address}
                  onChange={(event) => setField("address", event.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input
                  value={form.city}
                  onChange={(event) => setField("city", event.target.value)}
                  placeholder="Salem"
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
                <label className={labelClass}>Service / Job Type</label>
                <select
                  value={usesCustomProjectType ? CUSTOM_PROJECT_TYPE : form.projectType}
                  onChange={(event) =>
                    setField(
                      "projectType",
                      event.target.value === CUSTOM_PROJECT_TYPE
                        ? ""
                        : event.target.value
                    )
                  }
                  className={inputClass}
                >
                  {PROJECT_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                  <option value={CUSTOM_PROJECT_TYPE}>Other job type…</option>
                </select>
                {usesCustomProjectType && (
                  <input
                    value={form.projectType}
                    onChange={(event) => setField("projectType", event.target.value)}
                    placeholder="Enter another job or service type"
                    className={`${inputClass} mt-2`}
                  />
                )}
              </div>
              <div>
                <label className={labelClass}>Pricing Method</label>
                <select
                  value={form.billingMethod}
                  onChange={(event) =>
                    setField(
                      "billingMethod",
                      event.target.value as ProjectBillingMethod
                    )
                  }
                  className={inputClass}
                >
                  <option value="fixed">Fixed price — due by job completion</option>
                  <option value="hourly">Time & materials — based on total hours</option>
                </select>
                <p className="mt-1.5 text-xs text-gray-400">
                  Hourly estimates are projections. The final invoice can use actual combined crew hours.
                </p>
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
                <label className={labelClass}>Estimate Status</label>
                <div className="flex min-h-11 items-center rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold capitalize text-gray-700">
                  {form.estimateStatus}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">
                  Status changes automatically when the estimate is shared or the client responds.
                </p>
              </div>
              <div>
                <label className={labelClass}>Square Footage</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={numericText(form.squareFootage)}
                  onChange={(event) =>
                    setField("squareFootage", parseNumeric(event.target.value))
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-5">
              <CalendarDays size={17} className="text-green-700" />
              <h2 className="font-bold text-gray-900">Schedule & follow-up</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Scheduled Start</label>
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
              <div>
                <label className={labelClass}>Follow-up Reminder</label>
                <input
                  type="datetime-local"
                  value={form.followUpAt}
                  onChange={(event) =>
                    setField("followUpAt", event.target.value)
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-2">
              <Users size={17} className="text-green-700" />
              <h2 className="font-bold text-gray-900">Crew labor & combined hours</h2>
            </div>
            <p className="text-sm text-gray-500 mb-5">
              Select workers and enter their estimated hours. Each person's
              saved hourly rate is used automatically.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {workspaceMembers.map((member) => {
                const assignment = laborAssignments.find(
                  (item) => item.userId === member.userId
                );
                return (
                  <div
                    key={member.userId}
                    className={`rounded-xl border p-4 ${
                      assignment
                        ? "border-green-300 bg-green-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(assignment)}
                        onChange={() => toggleLaborMember(member.userId)}
                        className="mt-1"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-900 truncate">
                          {member.name}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {member.positionTitle || member.role.replace("_", " ")}
                          {member.hourlyRate > 0
                            ? ` · ${formatMoney(member.hourlyRate)}/hr`
                            : " · no rate set"}
                        </p>
                      </div>
                    </label>
                    {assignment && (
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div>
                          <label className={labelClass}>Hours</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={numericText(assignment.hours)}
                            onChange={(event) =>
                              updateLaborAssignment(
                                member.userId,
                                "hours",
                                parseNumeric(event.target.value)
                              )
                            }
                            placeholder="0"
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Rate</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={numericText(assignment.hourlyRate)}
                            onChange={(event) =>
                              updateLaborAssignment(
                                member.userId,
                                "hourlyRate",
                                parseNumeric(event.target.value)
                              )
                            }
                            placeholder="0"
                            className={inputClass}
                          />
                        </div>
                        <p className="col-span-2 text-sm font-semibold text-green-800">
                          Labor: {formatMoney(
                            assignment.hours * assignment.hourlyRate
                          )}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {laborAssignments.length === 0 && (
              <div className="mt-5 rounded-xl border border-dashed border-gray-300 p-4">
                <p className="text-sm font-semibold text-gray-700">
                  No team member assigned
                </p>
                <p className="text-xs text-gray-400 mt-1 mb-4">
                  Use these fallback fields for solo work or a single combined labor rate.
                </p>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Total Combined Labor Hours</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={numericText(form.laborHours)}
                      onChange={(event) =>
                        setField("laborHours", parseNumeric(event.target.value))
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Combined Labor Rate</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={numericText(form.laborRate)}
                      onChange={(event) =>
                        setField("laborRate", parseNumeric(event.target.value))
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                </div>
              </div>
            )}
          </section>

          <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
            <div className="mb-5">
              <h2 className="font-bold text-gray-900">Description & notes</h2>
              <p className="mt-1 text-sm text-gray-500">Write the scope yourself or use the local formatter for a clean client-ready paragraph.</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className={labelClass}>Scope Description</label>
                <textarea
                  value={form.scopeDescription}
                  onChange={(event) =>
                    setField("scopeDescription", event.target.value)
                  }
                  rows={4}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <label className={`${labelClass} mb-0`}>
                    Optional Generated Description
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleGenerateDescription()}
                    disabled={generating || saving}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-60"
                  >
                    {generating ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Sparkles size={15} />
                    )}
                    {generating ? "Generating…" : "Generate Description"}
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
                <p className="text-xs text-gray-400 mt-1.5">
                  This formatter uses your estimate data and does not call an
                  outside AI service.
                </p>
              </div>
              <div>
                <label className={labelClass}>Client Notes</label>
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
                <label className={labelClass}>Internal Notes — not shared</label>
                <textarea
                  value={form.notes}
                  onChange={(event) => setField("notes", event.target.value)}
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
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

          <section className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6">
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
                      type="text"
                      inputMode="decimal"
                      value={numericText(item.qty)}
                      onChange={(event) =>
                        updateItem(
                          item.id,
                          "qty",
                          parseNumeric(event.target.value)
                        )
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit</label>
                    <select
                      value={item.unit}
                      onChange={(event) =>
                        updateItem(item.id, "unit", event.target.value)
                      }
                      className={inputClass}
                    >
                      {UNIT_OPTIONS.map((unit) => (
                        <option key={unit} value={unit}>
                          {unit}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className={labelClass}>Unit Cost</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={numericText(item.unitCost)}
                      onChange={(event) =>
                        updateItem(
                          item.id,
                          "unitCost",
                          parseNumeric(event.target.value)
                        )
                      }
                      placeholder="0"
                      className={inputClass}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="col-span-12 sm:col-span-1 h-11 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                    aria-label="Remove line item"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4 mt-5">
              <div>
                <label className={labelClass}>Tax Rate %</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={numericText(form.taxRate)}
                  onChange={(event) =>
                    setField("taxRate", parseNumeric(event.target.value))
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Discount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={numericText(form.discountAmount)}
                  onChange={(event) =>
                    setField("discountAmount", parseNumeric(event.target.value))
                  }
                  placeholder="0"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <div className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5">
            <SaveActions />
          </div>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-6 self-start">
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
                <span className="text-green-200">Total combined labor hours</span>
                <span>{combinedLaborHours.toLocaleString("en-US")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-200">Combined labor cost</span>
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
                <p className="text-gray-500 mt-1">{selectedContact.email}</p>
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
