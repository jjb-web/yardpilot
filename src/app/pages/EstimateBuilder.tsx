import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Fuel,
  FileText,
  Image as ImageIcon,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import FormErrorNotice from "../components/FormErrorNotice";
import { useApp } from "../context/AppContext";
import type {
  EstimateJob,
  EstimateStatus,
  LaborAssignment,
  LineItem,
  LineItemType,
  Project,
  ProjectBillingMethod,
  ProjectStatus,
} from "../data/types";
import { calculateEstimate, calculateJob, formatMoney } from "../lib/estimate";
import { checkTextSafety } from "../lib/contentSafety";
import { generateEstimateDescription } from "../lib/descriptionGenerator";
import { useSubscription } from "../hooks/useSubscription";
import { supabase } from "../lib/supabase";

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

const UNIT_OPTIONS = [
  "each",
  "sq ft",
  "linear ft",
  "cubic yard",
  "yard",
  "ton",
  "pound",
  "bag",
  "gallon",
  "load",
  "hour",
  "day",
  "flat",
];

const CUSTOM_VALUE = "__custom__";
const DEFAULT_TERMS =
  "Pricing is valid through the date shown above. Changes to the scope, concealed site conditions, permit costs, or customer-requested additions may change the final price. Scheduling begins after approval.";

type EstimateForm = {
  name: string;
  client: string;
  address: string;
  city: string;
  contactId: string;
  propertyId: string;
  billingMethod: ProjectBillingMethod;
  notes: string;
  status: ProjectStatus;
  estimateStatus: EstimateStatus;
  estimateNumber: string;
  issueDate: string;
  validUntil: string;
  invoiceDueDate: string;
  clientNotes: string;
  terms: string;
  taxRate: number;
  discountAmount: number;
  followUpAt: string;
};

type SavedDraft = {
  savedAt: string;
  form: EstimateForm;
  jobSections: EstimateJob[];
  generatedDescription: string;
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
  return `EST-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

function toDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIso(value: string | null) {
  return value ? new Date(value).toISOString() : null;
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

function blankItem(itemType: LineItemType = "material"): LineItem {
  return {
    id: uid(),
    description: itemType === "fuel" ? "Fuel / gas" : "",
    qty: 1,
    unit: itemType === "fuel" ? "gallon" : "each",
    itemType,
    unitCost: 0,
  };
}

function blankJob(index = 0): EstimateJob {
  return {
    id: uid(),
    title: index === 0 ? "" : `Job ${index + 1}`,
    projectType: PROJECT_TYPES[0],
    scopeDescription: "",
    internalNotes: "",
    squareFootage: 0,
    pricePerSquareFoot: 0,
    scheduledStart: null,
    scheduledEnd: null,
    laborRate: 0,
    laborHours: 0,
    laborAssignments: [],
    lineItems: [blankItem()],
    photoIds: [],
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
    billingMethod: "fixed",
    notes: "",
    status: "active",
    estimateStatus: "draft",
    estimateNumber: newEstimateNumber(),
    issueDate: today.toISOString().slice(0, 10),
    validUntil: addDays(today, 30),
    invoiceDueDate: "",
    clientNotes: "",
    terms: DEFAULT_TERMS,
    taxRate: 0,
    discountAmount: 0,
    followUpAt: "",
  };
}

function jobsFromProject(project: Project): EstimateJob[] {
  if (project.jobSections?.length) {
    return project.jobSections.map((job) => ({
      ...job,
      scheduledStart: job.scheduledStart ? toDateTimeLocal(job.scheduledStart) : null,
      scheduledEnd: job.scheduledEnd ? toDateTimeLocal(job.scheduledEnd) : null,
      lineItems: job.lineItems?.length ? job.lineItems : [blankItem()],
    }));
  }
  return [
    {
      id: uid(),
      title: project.name,
      projectType: project.projectType,
      scopeDescription: project.scopeDescription,
      internalNotes: project.notes,
      squareFootage: project.squareFootage,
      pricePerSquareFoot: 0,
      scheduledStart: project.scheduledStart ? toDateTimeLocal(project.scheduledStart) : null,
      scheduledEnd: project.scheduledEnd ? toDateTimeLocal(project.scheduledEnd) : null,
      laborRate: project.laborRate,
      laborHours: project.laborHours,
      laborAssignments: project.laborAssignments,
      lineItems: project.lineItems.length ? project.lineItems : [blankItem()],
      photoIds: [],
    },
  ];
}

function formFromProject(project: Project): EstimateForm {
  return {
    name: project.name,
    client: project.client,
    address: project.address,
    city: project.city,
    contactId: project.contactId ?? "",
    propertyId: project.propertyId ?? "",
    billingMethod: project.billingMethod,
    notes: project.notes,
    status: project.status,
    estimateStatus: project.estimateStatus,
    estimateNumber: project.estimateNumber,
    issueDate: project.issueDate,
    validUntil: project.validUntil ?? "",
    invoiceDueDate: project.invoiceDueDate ?? "",
    clientNotes: project.clientNotes,
    terms: project.terms,
    taxRate: project.taxRate,
    discountAmount: project.discountAmount,
    followUpAt: toDateTimeLocal(project.followUpAt),
  };
}

function aggregateAssignments(jobs: EstimateJob[]) {
  const assignments = new Map<string, LaborAssignment>();
  for (const job of jobs) {
    for (const assignment of job.laborAssignments) {
      if (!assignment.userId) continue;
      const previous = assignments.get(assignment.userId);
      assignments.set(assignment.userId, {
        ...assignment,
        hours: Number(previous?.hours ?? 0) + Number(assignment.hours || 0),
      });
    }
  }
  return [...assignments.values()];
}

function Required() {
  return (
    <span className="ml-1 font-normal normal-case tracking-normal text-red-500">
      · Required
    </span>
  );
}

export default function EstimateBuilder() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    authUserId,
    activeWorkspaceId,
    projects,
    projectsLoading,
    contacts,
    properties,
    propertyPhotos,
    workspaceMembers,
    role,
    addProject,
    updateProject,
  } = useApp();

  const editing = Boolean(id) && id !== "new";
  const marketplaceRequestId = editing
    ? ""
    : searchParams.get("marketplaceRequest")?.trim() ?? "";
  const existing = editing ? projects.find((project) => project.id === id) ?? null : null;
  const [form, setForm] = useState<EstimateForm>(blankForm);
  const [jobSections, setJobSections] = useState<EstimateJob[]>([blankJob()]);
  const { hasFeature } = useSubscription();
  const canAddMultipleJobs = hasFeature("multi_job_estimates");
  const [generatedDescription, setGeneratedDescription] = useState("");
  const [openJobs, setOpenJobs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const draftReadyRef = useRef(false);
  const marketplacePrefillRef = useRef("");
  const topErrorRef = useRef<HTMLDivElement | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  const draftKey = useMemo(
    () =>
      activeWorkspaceId
        ? `yardpilot-estimate-draft:${activeWorkspaceId}:${
            editing ? id : marketplaceRequestId ? `marketplace-${marketplaceRequestId}` : "new"
          }`
        : "",
    [activeWorkspaceId, editing, id, marketplaceRequestId]
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    if (editing && projectsLoading) return;
    if (editing && !existing) return;

    const baseForm = existing ? formFromProject(existing) : blankForm();
    const baseJobs = existing ? jobsFromProject(existing) : [blankJob()];
    let restored = false;

    if (draftKey) {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const draft = JSON.parse(raw) as SavedDraft;
          const savedTime = new Date(draft.savedAt).getTime();
          const projectTime = existing ? new Date(existing.updatedAt).getTime() : 0;
          if (!existing || savedTime > projectTime) {
            setForm(draft.form);
            setJobSections(draft.jobSections?.length ? draft.jobSections : baseJobs);
            setGeneratedDescription(draft.generatedDescription ?? existing?.aiEstimate ?? "");
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
      setJobSections(baseJobs);
      setGeneratedDescription(existing?.aiEstimate ?? "");
      setDraftMessage("");
    }
    setOpenJobs(baseJobs.map((job) => job.id));
    setSaveError("");
    draftReadyRef.current = true;
  }, [draftKey, editing, existing?.id, existing?.updatedAt, projectsLoading]);

  useEffect(() => {
    if (
      editing ||
      !marketplaceRequestId ||
      !activeWorkspaceId ||
      !draftReadyRef.current ||
      marketplacePrefillRef.current === marketplaceRequestId
    ) {
      return;
    }

    marketplacePrefillRef.current = marketplaceRequestId;
    let cancelled = false;

    async function loadMarketplaceRequest() {
      const { data, error } = await supabase.rpc(
        "get_marketplace_request_for_estimate",
        { requested_request_id: marketplaceRequestId },
      );

      if (cancelled) return;
      if (error) {
        marketplacePrefillRef.current = "";
        showError(`The accepted marketplace request could not be loaded: ${error.message}`);
        return;
      }

      const request = (data ?? {}) as {
        workspaceId?: string;
        title?: string;
        description?: string;
        serviceType?: string;
        city?: string;
        state?: string;
        postalCode?: string;
        clientName?: string;
        desiredStart?: string | null;
        proposedStart?: string | null;
        acceptedBidAmount?: number | null;
        acceptedBidMessage?: string;
        projectId?: string | null;
      };

      if (request.workspaceId && request.workspaceId !== activeWorkspaceId) {
        marketplacePrefillRef.current = "";
        showError("Switch to the workspace that won this bid before creating its estimate.");
        return;
      }

      if (request.projectId) {
        navigate(`/app/estimates/${request.projectId}?origin=marketplace`, { replace: true });
        return;
      }

      const title = String(request.title ?? "").trim();
      const description = String(request.description ?? "").trim();
      const serviceType = String(request.serviceType ?? "").trim();
      const clientName = String(request.clientName ?? "").trim();
      const location = [request.city, request.state, request.postalCode]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
        .join(", ");
      const proposedStart = request.proposedStart || request.desiredStart || null;
      const acceptedBidNote = String(request.acceptedBidMessage ?? "").trim();

      const safetyInputs = [
        [title, "Marketplace request title"],
        [description, "Marketplace request description"],
        [serviceType, "Marketplace service type"],
        [clientName, "Marketplace client name"],
        [acceptedBidNote, "Accepted bid message"],
      ] as const;

      for (const [value, label] of safetyInputs) {
        const safety = checkTextSafety(value, label);
        if (!safety.safe) {
          showError(`The accepted marketplace request could not be loaded. ${safety.message}`);
          return;
        }
      }

      setForm((current) => ({
        ...current,
        name: current.name.trim() ? current.name : title,
        client: current.client.trim() ? current.client : clientName,
        city: current.city.trim() ? current.city : location,
      }));

      setJobSections((current) => {
        const base = current.length ? current : [blankJob()];
        return base.map((job, index) =>
          index === 0
            ? {
                ...job,
                title: job.title.trim() ? job.title : title,
                projectType: serviceType || job.projectType,
                scopeDescription: job.scopeDescription.trim()
                  ? job.scopeDescription
                  : [description, acceptedBidNote ? `Accepted proposal: ${acceptedBidNote}` : ""]
                      .filter(Boolean)
                      .join("\n\n"),
                scheduledStart: job.scheduledStart || (proposedStart ? toDateTimeLocal(proposedStart) : null),
              }
            : job,
        );
      });

      setDraftMessage(
        request.acceptedBidAmount != null
          ? `Accepted marketplace request loaded. Winning offer: ${formatMoney(Number(request.acceptedBidAmount))}.`
          : "Accepted marketplace request loaded into this estimate.",
      );
    }

    void loadMarketplaceRequest();
    return () => {
      cancelled = true;
    };
  }, [activeWorkspaceId, editing, marketplaceRequestId]);

  useEffect(() => {
    if (!draftKey || !draftReadyRef.current) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ savedAt: new Date().toISOString(), form, jobSections, generatedDescription })
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [draftKey, form, jobSections, generatedDescription]);

  const contactProperties = properties.filter(
    (property) => property.contactId === form.contactId
  );
  const selectableProperties = form.contactId ? contactProperties : properties;
  const selectedPhotos = propertyPhotos.filter(
    (photo) => photo.propertyId === form.propertyId
  );
  const aggregateLabor = aggregateAssignments(jobSections);
  const aggregateItems = jobSections.flatMap((job) => job.lineItems);
  const totals = calculateEstimate({
    lineItems: aggregateItems,
    laborAssignments: aggregateLabor,
    laborHours: jobSections.reduce((sum, job) => sum + job.laborHours, 0),
    laborRate: 0,
    jobSections,
    taxRate: form.taxRate,
    discountAmount: form.discountAmount,
  });

  const inputClass =
    "w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-base text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500/30 sm:text-sm";
  const labelClass =
    "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-500";

  function setField<K extends keyof EstimateForm>(key: K, value: EstimateForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateJob(jobId: string, updates: Partial<EstimateJob>) {
    setJobSections((jobs) =>
      jobs.map((job) => (job.id === jobId ? { ...job, ...updates } : job))
    );
  }

  function updateItem(jobId: string, itemId: string, updates: Partial<LineItem>) {
    setJobSections((jobs) =>
      jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              lineItems: job.lineItems.map((item) =>
                item.id === itemId ? { ...item, ...updates } : item
              ),
            }
          : job
      )
    );
  }

  function removeItem(jobId: string, itemId: string) {
    setJobSections((jobs) =>
      jobs.map((job) => {
        if (job.id !== jobId) return job;
        const remaining = job.lineItems.filter((item) => item.id !== itemId);
        return { ...job, lineItems: remaining.length ? remaining : [blankItem()] };
      })
    );
  }

  function toggleLaborMember(jobId: string, userId: string) {
    const member = workspaceMembers.find((item) => item.userId === userId);
    if (!member) return;
    setJobSections((jobs) =>
      jobs.map((job) => {
        if (job.id !== jobId) return job;
        const exists = job.laborAssignments.some(
          (assignment) => assignment.userId === userId
        );
        return {
          ...job,
          laborAssignments: exists
            ? job.laborAssignments.filter((assignment) => assignment.userId !== userId)
            : [
                ...job.laborAssignments,
                {
                  userId,
                  name: member.name,
                  hours: 0,
                  hourlyRate: member.hourlyRate,
                },
              ],
        };
      })
    );
  }

  function updateLabor(
    jobId: string,
    userId: string,
    key: "hours" | "hourlyRate",
    value: number
  ) {
    setJobSections((jobs) =>
      jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              laborAssignments: job.laborAssignments.map((assignment) =>
                assignment.userId === userId
                  ? { ...assignment, [key]: Math.max(0, value) }
                  : assignment
              ),
            }
          : job
      )
    );
  }

  function chooseContact(contactId: string) {
    const contact = contacts.find((item) => item.id === contactId);
    const linkedProperties = properties.filter((item) => item.contactId === contactId);
    const onlyProperty = linkedProperties.length === 1 ? linkedProperties[0] : null;

    setForm((current) => ({
      ...current,
      contactId,
      propertyId: onlyProperty?.id ?? "",
      client: contact?.name || current.client,
      address: onlyProperty?.address || contact?.address || current.address,
      city: onlyProperty?.city || contact?.city || current.city,
      name: current.name || onlyProperty?.name || "",
      notes: current.notes || contact?.notes || onlyProperty?.internalNotes || "",
      clientNotes: current.clientNotes || onlyProperty?.clientNotes || "",
    }));

    if (onlyProperty) {
      const photoIds = propertyPhotos
        .filter((photo) => photo.propertyId === onlyProperty.id)
        .map((photo) => photo.id);
      setJobSections((jobs) =>
        jobs.map((job, index) =>
          index === 0
            ? {
                ...job,
                title: job.title || onlyProperty.name,
                scopeDescription: job.scopeDescription || onlyProperty.description,
                internalNotes: job.internalNotes || onlyProperty.internalNotes,
                photoIds: job.photoIds.length ? job.photoIds : photoIds,
              }
            : job
        )
      );
    }
  }

  function chooseProperty(propertyId: string) {
    const property = properties.find((item) => item.id === propertyId);
    if (!property) {
      setForm((current) => ({ ...current, propertyId: "" }));
      return;
    }
    const contact = contacts.find((item) => item.id === property.contactId);
    const photoIds = propertyPhotos
      .filter((photo) => photo.propertyId === property.id)
      .map((photo) => photo.id);

    setForm((current) => ({
      ...current,
      contactId: property.contactId,
      propertyId,
      client: contact?.name || current.client,
      address: property.address || contact?.address || current.address,
      city: property.city || contact?.city || current.city,
      name: current.name || property.name || "",
      notes: current.notes || [contact?.notes, property.internalNotes].filter(Boolean).join("\n\n"),
      clientNotes: current.clientNotes || property.clientNotes || "",
    }));

    setJobSections((jobs) =>
      jobs.map((job, index) =>
        index === 0
          ? {
              ...job,
              title: job.title || property.name,
              scopeDescription: job.scopeDescription || property.description,
              internalNotes: job.internalNotes || property.internalNotes,
              photoIds: job.photoIds.length ? job.photoIds : photoIds,
            }
          : job
      )
    );
  }

  function handleGenerateDescription() {
    setSaveError("");

    const estimateInputs = [
      [form.name, "Estimate name"],
      [form.client, "Client name"],
      [form.address, "Property address"],
      [form.city, "Property city"],
    ] as const;

    for (const [value, label] of estimateInputs) {
      const safety = checkTextSafety(value, label);
      if (!safety.safe) {
        showError(`Description was not generated. ${safety.message}`, label === "Estimate name");
        return;
      }
    }

    for (let index = 0; index < jobSections.length; index += 1) {
      const job = jobSections[index];
      const jobInputs = [
        [job.title, `Job ${index + 1} title`],
        [job.projectType, `Job ${index + 1} type`],
        [job.scopeDescription, `Job ${index + 1} scope`],
        [job.internalNotes, `Job ${index + 1} internal notes`],
      ] as const;

      for (const [value, label] of jobInputs) {
        const safety = checkTextSafety(value, label);
        if (!safety.safe) {
          setOpenJobs((current) => [...new Set([...current, job.id])]);
          showError(`Description was not generated. ${safety.message}`);
          return;
        }
      }
    }

    const description = generateEstimateDescription({
      estimateName: form.name,
      clientName: form.client,
      address: form.address,
      city: form.city,
      billingMethod: form.billingMethod,
      jobs: jobSections,
      total: totals.total,
    });

    const generatedSafety = checkTextSafety(description, "Generated estimate description");
    if (!generatedSafety.safe) {
      showError(`Description was not generated. ${generatedSafety.message}`);
      return;
    }

    setGeneratedDescription(description);
  }

  function showError(message: string, focusName = false) {
    setSaveError(message);
    window.requestAnimationFrame(() => {
      topErrorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      if (focusName) nameRef.current?.focus();
    });
  }

  function validate() {
    if (!form.name.trim()) {
      showError("Enter an estimate name before saving.", true);
      return false;
    }
    if (!form.estimateNumber.trim()) {
      showError("Enter an estimate number.");
      return false;
    }
    if (!jobSections.length) {
      showError("Add at least one job to the estimate.");
      return false;
    }
    for (let index = 0; index < jobSections.length; index += 1) {
      const job = jobSections[index];
      if (!job.title.trim()) {
        showError(`Enter a title for Job ${index + 1}.`);
        setOpenJobs((current) => [...new Set([...current, job.id])]);
        return false;
      }
      const values = [
        [job.title, `Job ${index + 1} title`],
        [job.projectType, `Job ${index + 1} type`],
        [job.scopeDescription, `Job ${index + 1} scope`],
        [job.internalNotes, `Job ${index + 1} internal notes`],
      ] as const;
      for (const [value, label] of values) {
        const result = checkTextSafety(value, label);
        if (!result.safe) {
          showError(result.message);
          setOpenJobs((current) => [...new Set([...current, job.id])]);
          return false;
        }
      }
    }
    const descriptionSafety = checkTextSafety(generatedDescription, "Estimate description");
    if (!descriptionSafety.safe) {
      showError(descriptionSafety.message);
      return false;
    }
    const nameSafety = checkTextSafety(form.name, "Estimate name");
    if (!nameSafety.safe) {
      showError(nameSafety.message, true);
      return false;
    }
    return true;
  }

  async function handleSave() {
    setSaveError("");
    if (!validate()) return;
    if (!activeWorkspaceId || !authUserId) {
      showError("Your workspace is still loading. Try again in a moment.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const normalizedJobs = jobSections.map((job) => ({
      ...job,
      title: job.title.trim(),
      projectType: job.projectType.trim(),
      scopeDescription: job.scopeDescription.trim(),
      internalNotes: job.internalNotes.trim(),
      scheduledStart: toIso(job.scheduledStart),
      scheduledEnd: toIso(job.scheduledEnd),
      lineItems: job.lineItems.filter(
        (item) => item.description.trim() || item.qty || item.unitCost
      ),
    }));
    const assignments = aggregateAssignments(normalizedJobs);
    const allItems = normalizedJobs.flatMap((job) => job.lineItems);
    const firstJob = normalizedJobs[0];
    const firstStart = normalizedJobs
      .map((job) => job.scheduledStart)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
    const lastEnd = normalizedJobs
      .map((job) => job.scheduledEnd)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;
    const totalHours = normalizedJobs.reduce(
      (sum, job) =>
        sum +
        (job.laborAssignments.length
          ? job.laborAssignments.reduce(
              (jobSum, assignment) => jobSum + Number(assignment.hours || 0),
              0
            )
          : Number(job.laborHours || 0)),
      0
    );

    try {
      const common = {
        ...form,
        name: form.name.trim(),
        client: form.client.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        contactId: form.contactId || null,
        propertyId: form.propertyId || null,
        validUntil: form.validUntil || null,
        invoiceDueDate: form.invoiceDueDate || null,
        projectType: firstJob.projectType,
        jobSections: normalizedJobs,
        squareFootage: normalizedJobs.reduce(
          (sum, job) => sum + Number(job.squareFootage || 0),
          0
        ),
        laborRate: firstJob.laborRate,
        laborHours: totalHours,
        laborAssignments: assignments,
        lineItems: allItems,
        aiEstimate: generatedDescription.trim() || null,
        scopeDescription: normalizedJobs
          .map((job) => `${job.title}: ${job.scopeDescription}`)
          .join("\n\n"),
        totalEstimate: totals.total,
        scheduledStart: firstStart,
        scheduledEnd: lastEnd,
        followUpAt: toIso(form.followUpAt),
        assignedMemberIds: assignments.map((assignment) => assignment.userId),
        internalApprovalStatus: existing?.internalApprovalStatus ?? "draft",
        submittedForApprovalAt: existing?.submittedForApprovalAt ?? null,
        submittedForApprovalBy: existing?.submittedForApprovalBy ?? null,
        approvedAt: existing?.approvedAt ?? null,
        approvedBy: existing?.approvedBy ?? null,
        approvalNotes: existing?.approvalNotes ?? "",
        updatedAt: now,
      };

      const saved = existing
        ? await updateProject({ ...existing, ...common })
        : await addProject({
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

      if (marketplaceRequestId) {
        const { error: linkError } = await supabase.rpc(
          "link_marketplace_request_project",
          {
            requested_request_id: marketplaceRequestId,
            requested_project_id: saved.id,
          },
        );

        if (linkError) {
          showError(
            `The estimate was saved, but YardPilot could not link it to the marketplace request: ${linkError.message}`,
          );
          return;
        }
      }

      if (draftKey) localStorage.removeItem(draftKey);
      navigate(
        marketplaceRequestId
          ? `/app/estimates/${saved.id}?origin=marketplace`
          : `/app/estimates/${saved.id}`
      );
    } catch (error) {
      showError(error instanceof Error ? error.message : "The estimate could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  if (projectsLoading && editing) {
    return <div className="p-6 text-sm text-gray-500">Loading estimate…</div>;
  }

  if (editing && !existing) {
    return (
      <div className="p-6">
        <div className="mx-auto max-w-3xl rounded-xl border border-gray-200 bg-white p-10 text-center">
          <h1 className="text-xl font-bold">Estimate not found</h1>
          <button onClick={() => navigate(-1)} className="mt-4 text-sm font-semibold text-green-700">
            Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <FormErrorNotice message={saveError} position="floating" />

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => marketplaceRequestId ? navigate("/app/marketplace?tab=bidding") : navigate(-1)}
            className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-gray-500 hover:text-gray-900"
          >
            <ArrowLeft size={16} /> {marketplaceRequestId ? "Back to bidding market" : "Back"}
          </button>
          <h1 className="text-2xl font-bold text-gray-900">
            {editing ? "Edit Estimate" : "Create Estimate"}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Build one combined estimate with one or more separate jobs. Only fields marked Required must be completed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {role === "employee"
            ? editing ? "Update Draft" : "Save Draft"
            : editing ? "Update Estimate" : "Create Estimate"}
        </button>
      </div>

      <div ref={topErrorRef}>
        <FormErrorNotice message={saveError} />
      </div>
      {draftMessage && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {draftMessage}
        </div>
      )}
      {role === "employee" && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Employee estimates are saved as internal drafts. Open the saved estimate and submit it for manager approval before it can be shared with a client.
        </div>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-5 font-bold text-gray-900">Estimate details</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass}>Estimate name <Required /></label>
                <input ref={nameRef} value={form.name} onChange={(event) => setField("name", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contact</label>
                <select value={form.contactId} onChange={(event) => chooseContact(event.target.value)} className={inputClass}>
                  <option value="">No linked contact</option>
                  {contacts.map((contact) => <option key={contact.id} value={contact.id}>{contact.name}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Property</label>
                <select value={form.propertyId} onChange={(event) => chooseProperty(event.target.value)} className={inputClass}>
                  <option value="">No linked property</option>
                  {selectableProperties.map((property) => <option key={property.id} value={property.id}>{property.name}{property.address ? ` · ${property.address}` : ""}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Client name</label>
                <input value={form.client} onChange={(event) => setField("client", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Estimate number <Required /></label>
                <input value={form.estimateNumber} onChange={(event) => setField("estimateNumber", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Street address</label>
                <input value={form.address} onChange={(event) => setField("address", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>City</label>
                <input value={form.city} onChange={(event) => setField("city", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Pricing method</label>
                <select value={form.billingMethod} onChange={(event) => setField("billingMethod", event.target.value as ProjectBillingMethod)} className={inputClass}>
                  <option value="fixed">Fixed price</option>
                  <option value="hourly">Time and materials</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Issue date</label>
                <input type="date" value={form.issueDate} onChange={(event) => setField("issueDate", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Valid until</label>
                <input type="date" value={form.validUntil} onChange={(event) => setField("validUntil", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Invoice due date</label>
                <input type="date" value={form.invoiceDueDate} onChange={(event) => setField("invoiceDueDate", event.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Follow-up reminder</label>
                <input type="datetime-local" value={form.followUpAt} onChange={(event) => setField("followUpAt", event.target.value)} className={inputClass} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Jobs included in this estimate</h2>
                <p className="mt-1 text-sm text-gray-500">Keep lawn work, mulch installation, cleanup, or other work as separate employee-ready jobs.</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!canAddMultipleJobs && jobSections.length >= 1) return;
                  const job = blankJob(jobSections.length);
                  setJobSections((current) => [...current, job]);
                  setOpenJobs((current) => [...current, job.id]);
                }}
                disabled={!canAddMultipleJobs && jobSections.length >= 1}
                title={canAddMultipleJobs ? "Add another job" : "Multiple jobs per estimate requires YardPilot Pro"}
                className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus size={16} /> Add another job
              </button>
              {!canAddMultipleJobs && jobSections.length >= 1 && (
                <Link to="/app/billing" className="text-xs font-semibold text-slate-600 underline">Unlock multiple jobs with Pro</Link>
              )}
            </div>

            {jobSections.map((job, index) => {
              const open = openJobs.includes(job.id);
              const jobTotals = calculateJob(job);
              const customType = !PROJECT_TYPES.includes(job.projectType);
              return (
                <article key={job.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                    <button
                      type="button"
                      onClick={() => setOpenJobs((current) => open ? current.filter((value) => value !== job.id) : [...current, job.id])}
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-gray-900">{job.title || `Job ${index + 1}`}</span>
                        <span className="block truncate text-xs text-gray-500">{job.projectType || "Select a job type"} · {formatMoney(jobTotals.subtotal)}</span>
                      </span>
                      {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                    </button>
                    {jobSections.length > 1 && (
                      <button type="button" onClick={() => setJobSections((current) => current.filter((item) => item.id !== job.id))} className="rounded-lg p-2 text-red-500 hover:bg-red-50" aria-label={`Remove Job ${index + 1}`}>
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>

                  {open && (
                    <div className="space-y-6 p-5 sm:p-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Job title <Required /></label>
                          <input value={job.title} onChange={(event) => updateJob(job.id, { title: event.target.value })} placeholder="Example: Cut lawn" className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Job type <Required /></label>
                          <select value={customType ? CUSTOM_VALUE : job.projectType} onChange={(event) => updateJob(job.id, { projectType: event.target.value === CUSTOM_VALUE ? "" : event.target.value })} className={inputClass}>
                            {PROJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
                            <option value={CUSTOM_VALUE}>Custom job type…</option>
                          </select>
                          {customType && <input value={job.projectType} onChange={(event) => updateJob(job.id, { projectType: event.target.value })} placeholder="Enter a custom job type" className={`${inputClass} mt-2`} />}
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Scope of work</label>
                          <textarea value={job.scopeDescription} onChange={(event) => updateJob(job.id, { scopeDescription: event.target.value })} rows={4} className={inputClass} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelClass}>Internal employee instructions</label>
                          <textarea value={job.internalNotes} onChange={(event) => updateJob(job.id, { internalNotes: event.target.value })} rows={3} className={inputClass} />
                          <p className="mt-1.5 text-xs text-gray-400">Shown in Jobs and Past Jobs; not included in the customer estimate.</p>
                        </div>
                        <div>
                          <label className={labelClass}>Scheduled start</label>
                          <input type="datetime-local" value={job.scheduledStart ?? ""} onChange={(event) => updateJob(job.id, { scheduledStart: event.target.value || null })} className={inputClass} />
                        </div>
                        <div>
                          <label className={labelClass}>Scheduled end</label>
                          <input type="datetime-local" value={job.scheduledEnd ?? ""} onChange={(event) => updateJob(job.id, { scheduledEnd: event.target.value || null })} className={inputClass} />
                        </div>
                      </div>

                      <div className="rounded-xl border border-gray-200 p-4">
                        <h3 className="font-semibold text-gray-900">Square-foot pricing</h3>
                        <p className="mt-1 text-xs text-gray-400">Use this for sod, mulch, turf, cleanup, or any work priced per square foot.</p>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div>
                            <label className={labelClass}>Square feet</label>
                            <input inputMode="decimal" value={numericText(job.squareFootage)} onChange={(event) => updateJob(job.id, { squareFootage: parseNumeric(event.target.value) })} className={inputClass} />
                          </div>
                          <div>
                            <label className={labelClass}>Price per sq ft</label>
                            <input inputMode="decimal" value={numericText(job.pricePerSquareFoot)} onChange={(event) => updateJob(job.id, { pricePerSquareFoot: parseNumeric(event.target.value) })} className={inputClass} />
                          </div>
                        </div>
                        <p className="mt-3 text-sm font-semibold text-green-800">Square-foot total: {formatMoney(job.squareFootage * job.pricePerSquareFoot)}</p>
                      </div>

                      <div>
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-semibold text-gray-900">Materials and services</h3>
                            <p className="mt-1 text-xs text-gray-400">Add custom descriptions, custom units, or fuel/gas as a separate line.</p>
                          </div>
                          <div className="flex gap-2">
                            <button type="button" onClick={() => updateJob(job.id, { lineItems: [...job.lineItems, blankItem("fuel")] })} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"><Fuel size={14} /> Add fuel</button>
                            <button type="button" onClick={() => updateJob(job.id, { lineItems: [...job.lineItems, blankItem()] })} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700"><Plus size={14} /> Add line</button>
                          </div>
                        </div>
                        <div className="space-y-3">
                          {job.lineItems.map((item) => {
                            const customUnit = !UNIT_OPTIONS.includes(item.unit);
                            return (
                              <div key={item.id} className="grid grid-cols-12 items-end gap-2 rounded-xl border border-gray-100 bg-gray-50 p-3">
                                <div className="col-span-12 sm:col-span-2">
                                  <label className={labelClass}>Type</label>
                                  <select value={item.itemType ?? "material"} onChange={(event) => updateItem(job.id, item.id, { itemType: event.target.value as LineItemType })} className={inputClass}>
                                    <option value="material">Material</option>
                                    <option value="service">Service</option>
                                    <option value="fuel">Fuel / gas</option>
                                  </select>
                                </div>
                                <div className="col-span-12 sm:col-span-4">
                                  <label className={labelClass}>Description</label>
                                  <input value={item.description} onChange={(event) => updateItem(job.id, item.id, { description: event.target.value })} placeholder="Custom material or service" className={inputClass} />
                                </div>
                                <div className="col-span-4 sm:col-span-1">
                                  <label className={labelClass}>Qty</label>
                                  <input inputMode="decimal" value={numericText(item.qty)} onChange={(event) => updateItem(job.id, item.id, { qty: parseNumeric(event.target.value) })} className={inputClass} />
                                </div>
                                <div className="col-span-8 sm:col-span-2">
                                  <label className={labelClass}>Unit</label>
                                  <select value={customUnit ? CUSTOM_VALUE : item.unit} onChange={(event) => updateItem(job.id, item.id, { unit: event.target.value === CUSTOM_VALUE ? "" : event.target.value })} className={inputClass}>
                                    {UNIT_OPTIONS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                                    <option value={CUSTOM_VALUE}>Custom…</option>
                                  </select>
                                  {customUnit && <input value={item.unit} onChange={(event) => updateItem(job.id, item.id, { unit: event.target.value })} placeholder="Custom unit" className={`${inputClass} mt-2`} />}
                                </div>
                                <div className="col-span-8 sm:col-span-2">
                                  <label className={labelClass}>Price / unit</label>
                                  <input inputMode="decimal" value={numericText(item.unitCost)} onChange={(event) => updateItem(job.id, item.id, { unitCost: parseNumeric(event.target.value) })} className={inputClass} />
                                </div>
                                <button type="button" onClick={() => removeItem(job.id, item.id)} className="col-span-4 flex min-h-11 items-center justify-center rounded-lg border border-red-100 text-red-500 hover:bg-red-50 sm:col-span-1" aria-label="Remove line"><Trash2 size={16} /></button>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <div className="mb-3 flex items-center gap-2"><Users size={17} className="text-green-700" /><h3 className="font-semibold text-gray-900">Workers and estimated hours</h3></div>
                        {workspaceMembers.length > 0 && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {workspaceMembers.map((member) => {
                              const assignment = job.laborAssignments.find((item) => item.userId === member.userId);
                              return (
                                <div key={member.userId} className="rounded-xl border border-gray-200 p-4">
                                  <label className="flex items-center gap-3 text-sm font-semibold text-gray-800">
                                    <input type="checkbox" checked={Boolean(assignment)} onChange={() => toggleLaborMember(job.id, member.userId)} />
                                    {member.name}
                                  </label>
                                  {assignment && (
                                    <div className="mt-4 grid grid-cols-2 gap-3">
                                      <div><label className={labelClass}>Hours</label><input inputMode="decimal" value={numericText(assignment.hours)} onChange={(event) => updateLabor(job.id, member.userId, "hours", parseNumeric(event.target.value))} className={inputClass} /></div>
                                      <div><label className={labelClass}>Hourly rate</label><input inputMode="decimal" value={numericText(assignment.hourlyRate)} onChange={(event) => updateLabor(job.id, member.userId, "hourlyRate", parseNumeric(event.target.value))} className={inputClass} /></div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {job.laborAssignments.length === 0 && (
                          <div className="mt-3 grid gap-4 rounded-xl border border-dashed border-gray-300 p-4 sm:grid-cols-2">
                            <div><label className={labelClass}>Unassigned labor hours</label><input inputMode="decimal" value={numericText(job.laborHours)} onChange={(event) => updateJob(job.id, { laborHours: parseNumeric(event.target.value) })} className={inputClass} /></div>
                            <div><label className={labelClass}>Hourly rate</label><input inputMode="decimal" value={numericText(job.laborRate)} onChange={(event) => updateJob(job.id, { laborRate: parseNumeric(event.target.value) })} className={inputClass} /></div>
                          </div>
                        )}
                      </div>

                      {selectedPhotos.length > 0 && (
                        <div>
                          <div className="mb-3 flex items-center gap-2"><ImageIcon size={17} className="text-green-700" /><h3 className="font-semibold text-gray-900">Job photos</h3></div>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {selectedPhotos.map((photo) => (
                              <label key={photo.id} className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                                <img src={photo.url} alt={photo.caption || "Property"} className="aspect-square w-full object-cover" />
                                <span className="flex items-center gap-2 p-2 text-xs"><input type="checkbox" checked={job.photoIds.includes(photo.id)} onChange={() => updateJob(job.id, { photoIds: job.photoIds.includes(photo.id) ? job.photoIds.filter((value) => value !== photo.id) : [...job.photoIds, photo.id] })} /> Include</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Estimate description</h2>
                <p className="mt-1 text-sm text-gray-500">Generate editable customer-facing wording from the jobs, quantities, pricing range, and combined labor.</p>
              </div>
              <button type="button" onClick={handleGenerateDescription} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <FileText size={16} /> {generatedDescription ? "Regenerate description" : "Generate description"}
              </button>
            </div>
            <textarea
              value={generatedDescription}
              onChange={(event) => setGeneratedDescription(event.target.value)}
              rows={8}
              placeholder="Add a customer-facing overview, or generate one from the estimate details."
              className={inputClass}
            />
            <p className="mt-2 text-xs text-gray-400">The generated wording is local, editable, and changes each time based on the estimate details.</p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-5 font-bold text-gray-900">Customer and internal notes</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Client notes</label><textarea value={form.clientNotes} onChange={(event) => setField("clientNotes", event.target.value)} rows={4} className={inputClass} /></div>
              <div><label className={labelClass}>Estimate-level internal notes</label><textarea value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows={4} className={inputClass} /></div>
              <div className="sm:col-span-2"><label className={labelClass}>Terms</label><textarea value={form.terms} onChange={(event) => setField("terms", event.target.value)} rows={4} className={inputClass} /></div>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <h2 className="mb-5 font-bold text-gray-900">Final adjustments</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Tax rate (%)</label><input inputMode="decimal" value={numericText(form.taxRate)} onChange={(event) => setField("taxRate", parseNumeric(event.target.value))} className={inputClass} /></div>
              <div><label className={labelClass}>Discount amount</label><input inputMode="decimal" value={numericText(form.discountAmount)} onChange={(event) => setField("discountAmount", parseNumeric(event.target.value))} className={inputClass} /></div>
            </div>
          </section>

          <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
            <FormErrorNotice message={saveError} />
            <p className="text-xs text-gray-500">Fields marked Required are checked before saving. Errors also appear at the top of the viewport so the button never seems unresponsive.</p>
            <button type="button" onClick={() => void handleSave()} disabled={saving} className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editing ? "Update Estimate" : "Create Estimate"}
            </button>
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estimate total</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{formatMoney(totals.total)}</p>
            <dl className="mt-5 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-gray-500">Jobs</dt><dd className="font-semibold">{jobSections.length}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Materials/services</dt><dd>{formatMoney(totals.materials)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Combined labor</dt><dd>{formatMoney(totals.labor)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Tax</dt><dd>{formatMoney(totals.tax)}</dd></div>
              <div className="flex justify-between"><dt className="text-gray-500">Discount</dt><dd>-{formatMoney(totals.discount)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            <CalendarDays size={17} className="mb-2" />
            Each job can have its own schedule, crew, materials, instructions, and photos while the customer receives one combined estimate.
          </div>
        </aside>
      </div>
    </div>
  );
}
