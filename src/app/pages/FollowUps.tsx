import { useMemo, useState } from "react";
import {
  Check,
  Clock3,
  Mail,
  MessageSquareText,
  Phone,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  FollowUp,
  FollowUpChannel,
  FollowUpType,
} from "../data/types";

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
}

function toLocalInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type FollowUpDraft = {
  title: string;
  notes: string;
  dueAt: string;
  type: FollowUpType;
  channel: FollowUpChannel;
  contactId: string;
  projectId: string;
  invoiceId: string;
  assignedUserId: string;
};

function blankDraft(): FollowUpDraft {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(9, 0, 0, 0);
  return {
    title: "",
    notes: "",
    dueAt: toLocalInput(due),
    type: "general",
    channel: "email",
    contactId: "",
    projectId: "",
    invoiceId: "",
    assignedUserId: "",
  };
}

function typeClasses(type: FollowUpType) {
  if (type === "payment") return "bg-red-100 text-red-700";
  if (type === "appointment") return "bg-blue-100 text-blue-700";
  if (type === "estimate") return "bg-amber-100 text-amber-700";
  if (type === "customer") return "bg-violet-100 text-violet-700";
  return "bg-gray-100 text-gray-600";
}

export default function FollowUps() {
  const {
    authUserId,
    activeWorkspaceId,
    role,
    contacts,
    projects,
    invoices,
    workspaceMembers,
    followUps,
    followUpsLoading,
    followUpsError,
    addFollowUp,
    updateFollowUp,
    deleteFollowUp,
  } = useApp();

  const [tab, setTab] = useState<"pending" | "past" | "completed">("pending");
  const [typeFilter, setTypeFilter] = useState<"all" | FollowUpType>("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<FollowUpDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const now = Date.now();

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...followUps]
      .filter((followUp) => {
        const due = new Date(followUp.dueAt).getTime();
        if (tab === "completed" && followUp.status !== "completed") return false;
        if (tab === "pending" && (followUp.status !== "pending" || due < now)) return false;
        if (tab === "past" && (followUp.status !== "pending" || due >= now)) return false;
        if (typeFilter !== "all" && followUp.type !== typeFilter) return false;
        if (!query) return true;
        const contact = contacts.find((item) => item.id === followUp.contactId);
        const project = projects.find((item) => item.id === followUp.projectId);
        return [
          followUp.title,
          followUp.notes,
          contact?.name ?? "",
          project?.name ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }, [followUps, contacts, projects, tab, typeFilter, search, now]);

  const counts = {
    pending: followUps.filter(
      (item) => item.status === "pending" && new Date(item.dueAt).getTime() >= now
    ).length,
    past: followUps.filter(
      (item) => item.status === "pending" && new Date(item.dueAt).getTime() < now
    ).length,
    completed: followUps.filter((item) => item.status === "completed").length,
  };

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  function contactFor(followUp: FollowUp) {
    return contacts.find((contact) => contact.id === followUp.contactId) ?? null;
  }

  function messageBody(followUp: FollowUp) {
    const project = projects.find((item) => item.id === followUp.projectId);
    const invoice = invoices.find((item) => item.id === followUp.invoiceId);
    if (followUp.type === "payment" && invoice) {
      return `Hello, this is a reminder that invoice ${invoice.invoiceNumber} for $${invoice.amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} was due on ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}. Please let us know if you have any questions.`;
    }
    if (followUp.type === "appointment" && project?.scheduledStart) {
      return `Hello, this is a reminder about ${project.name} scheduled for ${new Date(project.scheduledStart).toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      })}.`;
    }
    if (project) {
      return `Hello, I am following up regarding ${project.name}. Please let me know if you have any questions or would like to move forward.`;
    }
    return `Hello, I am following up regarding ${followUp.title}.`;
  }

  function sendEmail(followUp: FollowUp) {
    const contact = contactFor(followUp);
    if (!contact?.email) return;
    const subject = encodeURIComponent(followUp.title);
    const body = encodeURIComponent(messageBody(followUp));
    window.location.href = `mailto:${contact.email}?subject=${subject}&body=${body}`;
  }

  function sendSms(followUp: FollowUp) {
    const contact = contactFor(followUp);
    if (!contact?.phone) return;
    const body = encodeURIComponent(messageBody(followUp));
    window.location.href = `sms:${contact.phone}?&body=${body}`;
  }

  async function markCompleted(followUp: FollowUp) {
    try {
      await updateFollowUp({
        ...followUp,
        status: "completed",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not update follow-up.");
    }
  }

  async function saveFollowUp() {
    setModalError("");
    if (!draft.title.trim()) {
      setModalError("Enter a follow-up title.");
      return;
    }
    if (!authUserId || !activeWorkspaceId) {
      setModalError("Workspace is still loading.");
      return;
    }

    setSaving(true);
    const nowValue = new Date().toISOString();
    try {
      await addFollowUp({
        id: uid(),
        workspaceId: activeWorkspaceId,
        createdBy: authUserId,
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        dueAt: new Date(draft.dueAt).toISOString(),
        type: draft.type,
        status: "pending",
        channel: draft.channel,
        contactId: draft.contactId || null,
        projectId: draft.projectId || null,
        invoiceId: draft.invoiceId || null,
        assignedUserId:
          role === "employee" ? authUserId : draft.assignedUserId || null,
        autoKey: null,
        createdAt: nowValue,
        updatedAt: nowValue,
      });
      setModalOpen(false);
      setDraft(blankDraft());
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The follow-up could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function removeFollowUp(followUp: FollowUp) {
    if (followUp.autoKey) {
      window.alert("Automatic follow-ups are controlled by their linked estimate, job, or invoice.");
      return;
    }
    if (!window.confirm("Delete this follow-up?")) return;
    try {
      await deleteFollowUp(followUp.id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not delete follow-up.");
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Follow-ups</h1>
          <p className="text-sm text-gray-500 mt-1">
            Estimate expirations, appointments, and invoice due dates generate reminders automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDraft(blankDraft());
            setModalError("");
            setModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-green-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
        >
          <Plus size={16} /> New Follow-up
        </button>
      </div>

      {followUpsError && (
        <div className="mb-5 border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">
          {followUpsError}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        {(["pending", "past", "completed"] as const).map((value) => (
          <button
            type="button"
            key={value}
            onClick={() => setTab(value)}
            className={`rounded-xl border p-4 text-left cursor-pointer ${
              tab === value
                ? "border-green-400 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <p className="text-2xl font-bold text-gray-900">{counts[value]}</p>
            <p className="text-sm text-gray-500 capitalize mt-1">
              {value === "past" ? "Past Due" : value}
            </p>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search follow-ups..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value as "all" | FollowUpType)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700"
        >
          <option value="all">All Types</option>
          <option value="general">General</option>
          <option value="estimate">Estimate</option>
          <option value="appointment">Appointment</option>
          <option value="payment">Payment</option>
          <option value="customer">Customer</option>
        </select>
      </div>

      {followUpsLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          Loading follow-ups...
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Clock3 size={28} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">No follow-ups in this section</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((followUp) => {
            const contact = contactFor(followUp);
            const project = projects.find((item) => item.id === followUp.projectId);
            const assigned = workspaceMembers.find((member) => member.userId === followUp.assignedUserId);
            const overdue = followUp.status === "pending" && new Date(followUp.dueAt).getTime() < now;
            return (
              <article
                key={followUp.id}
                className={`bg-white rounded-xl border p-5 ${overdue ? "border-red-200" : "border-gray-200"}`}
              >
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-full ${typeClasses(followUp.type)}`}>
                        {followUp.type}
                      </span>
                      {followUp.autoKey && (
                        <span className="text-xs text-gray-400">Automatic</span>
                      )}
                      {overdue && (
                        <span className="text-xs font-semibold text-red-600">Past due</span>
                      )}
                    </div>
                    <h2 className="font-bold text-gray-900">{followUp.title}</h2>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500 mt-2">
                      <span>
                        Due {new Date(followUp.dueAt).toLocaleString("en-US", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                      {contact && <span>{contact.name}</span>}
                      {project && <span>{project.name}</span>}
                      {assigned && <span>Assigned to {assigned.name}</span>}
                    </div>
                    {followUp.notes && (
                      <p className="text-sm text-gray-500 mt-3">{followUp.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 shrink-0">
                    {contact?.email && (
                      <button
                        type="button"
                        onClick={() => sendEmail(followUp)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer"
                      >
                        <Mail size={15} /> Email
                      </button>
                    )}
                    {contact?.phone && (
                      <button
                        type="button"
                        onClick={() => sendSms(followUp)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700 cursor-pointer"
                      >
                        <MessageSquareText size={15} /> Text
                      </button>
                    )}
                    {contact?.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-700"
                      >
                        <Phone size={15} /> Call
                      </a>
                    )}
                    {followUp.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => void markCompleted(followUp)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer"
                      >
                        <Check size={15} /> Complete
                      </button>
                    )}
                    {!followUp.autoKey && (
                      <button
                        type="button"
                        onClick={() => void removeFollowUp(followUp)}
                        className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
              <h2 className="font-bold text-gray-900">New Follow-up</h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-gray-400 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {modalError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {modalError}
                </div>
              )}
              <div>
                <label className={labelClass}>Title</label>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Due Date</label>
                  <input
                    type="datetime-local"
                    value={draft.dueAt}
                    onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Type</label>
                  <select
                    value={draft.type}
                    onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value as FollowUpType }))}
                    className={inputClass}
                  >
                    <option value="general">General</option>
                    <option value="estimate">Estimate</option>
                    <option value="appointment">Appointment</option>
                    <option value="payment">Payment</option>
                    <option value="customer">Customer</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Preferred Contact Method</label>
                  <select
                    value={draft.channel}
                    onChange={(event) => setDraft((current) => ({ ...current, channel: event.target.value as FollowUpChannel }))}
                    className={inputClass}
                  >
                    <option value="email">Email</option>
                    <option value="sms">Text message</option>
                    <option value="phone">Phone call</option>
                    <option value="none">None</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Contact</label>
                  <select
                    value={draft.contactId}
                    onChange={(event) => setDraft((current) => ({ ...current, contactId: event.target.value }))}
                    className={inputClass}
                  >
                    <option value="">No contact</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>{contact.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Linked Job / Estimate</label>
                  <select
                    value={draft.projectId}
                    onChange={(event) => {
                      const projectId = event.target.value;
                      const project = projects.find((item) => item.id === projectId);
                      setDraft((current) => ({
                        ...current,
                        projectId,
                        contactId: project?.contactId ?? current.contactId,
                      }));
                    }}
                    className={inputClass}
                  >
                    <option value="">No linked job</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                {role !== "employee" && (
                  <div>
                    <label className={labelClass}>Assign To</label>
                    <select
                      value={draft.assignedUserId}
                      onChange={(event) => setDraft((current) => ({ ...current, assignedUserId: event.target.value }))}
                      className={inputClass}
                    >
                      <option value="">Unassigned</option>
                      {workspaceMembers.map((member) => (
                        <option key={member.userId} value={member.userId}>
                          {member.name} — {member.role}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label className={labelClass}>Notes</label>
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-gray-100 px-6 py-4">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveFollowUp()}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
              >
                {saving ? "Saving..." : "Add Follow-up"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
