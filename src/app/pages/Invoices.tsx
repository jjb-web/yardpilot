import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  CheckCircle2,
  ChevronRight,
  Mail,
  MessageSquareText,
  Plus,
  PackageCheck,
  ReceiptText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type {
  Invoice,
  InvoiceSnapshot,
  InvoiceStatus,
  Project,
} from "../data/types";
import { formatMoney } from "../lib/estimate";

function uid() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    Math.random().toString(36).slice(2, 11)
  );
}

function newInvoiceNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(1000 + Math.random() * 9000);
  return `INV-${year}-${random}`;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toISOString().slice(0, 10);
}

type InvoiceDraft = {
  projectId: string;
  contactId: string;
  propertyId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  amount: string;
  notes: string;
};

function blankDraft(): InvoiceDraft {
  const today = new Date();
  return {
    projectId: "",
    contactId: "",
    propertyId: "",
    invoiceNumber: newInvoiceNumber(),
    issueDate: today.toISOString().slice(0, 10),
    dueDate: addDays(today, 14),
    status: "draft",
    amount: "",
    notes: "",
  };
}

function statusClasses(status: InvoiceStatus) {
  if (status === "paid") return "bg-emerald-100 text-emerald-700";
  if (status === "overdue") return "bg-red-100 text-red-700";
  if (status === "sent") return "bg-blue-100 text-blue-700";
  if (status === "void") return "bg-gray-200 text-gray-600";
  return "bg-amber-100 text-amber-700";
}

function computedStatus(invoice: Invoice): InvoiceStatus {
  if (
    invoice.status !== "paid" &&
    invoice.status !== "void" &&
    new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()
  ) {
    return "overdue";
  }
  return invoice.status;
}

function snapshotFromProject(project: Project | undefined): InvoiceSnapshot | null {
  if (!project) return null;
  return {
    estimateNumber: project.estimateNumber,
    name: project.name,
    client: project.client,
    address: project.address,
    city: project.city,
    projectType: project.projectType,
    billingMethod: project.billingMethod,
    lineItems: project.lineItems,
    laborAssignments: project.laborAssignments,
    laborHours: project.laborHours,
    laborRate: project.laborRate,
    aiEstimate: project.aiEstimate,
    scopeDescription: project.scopeDescription,
    clientNotes: project.clientNotes,
    terms: project.terms,
    taxRate: project.taxRate,
    discountAmount: project.discountAmount,
    totalEstimate: project.totalEstimate,
    responseName: project.responseName,
    signatureData: project.signatureData,
    acceptedAt: project.acceptedAt,
  };
}

export default function Invoices() {
  const {
    authUserId,
    activeWorkspaceId,
    invoices,
    invoicesLoading,
    invoicesError,
    projects,
    contacts,
    properties,
    addInvoice,
    updateInvoice,
    deleteInvoice,
    completeInvoice,
  } = useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<"all" | InvoiceStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [completingId, setCompletingId] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...invoices]
      .filter((invoice) => {
        if (invoice.archivedAt) return false;
        const project = projects.find((item) => item.id === invoice.projectId);
        const contact = contacts.find((item) => item.id === invoice.contactId);
        const status = computedStatus(invoice);
        if (statusFilter !== "all" && status !== statusFilter) return false;
        if (!query) return true;
        return [
          invoice.invoiceNumber,
          invoice.notes,
          project?.name ?? invoice.estimateSnapshot?.name ?? "",
          contact?.name ?? invoice.estimateSnapshot?.client ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [invoices, projects, contacts, search, statusFilter]);

  const totalOutstanding = invoices
    .filter((invoice) =>
      !invoice.archivedAt && !["paid", "void"].includes(computedStatus(invoice))
    )
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalPaid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const inputClass =
    "w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-500/25";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId || invoicesLoading) return;
    const invoice = invoices.find((item) => item.id === editId);
    if (invoice) openInvoice(invoice);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("edit");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, invoices, invoicesLoading, setSearchParams]);

  function openNew() {
    setSelected(null);
    setDraft(blankDraft());
    setModalError("");
    setModalOpen(true);
  }

  function openInvoice(invoice: Invoice) {
    setSelected(invoice);
    setDraft({
      projectId: invoice.projectId ?? "",
      contactId: invoice.contactId ?? "",
      propertyId: invoice.propertyId ?? "",
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      status: invoice.status,
      amount: String(invoice.amount),
      notes: invoice.notes,
    });
    setModalError("");
    setModalOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setModalOpen(false);
    setSelected(null);
    setDraft(blankDraft());
    setModalError("");
  }

  function chooseProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    setDraft((current) => ({
      ...current,
      projectId,
      contactId: project?.contactId ?? current.contactId,
      propertyId: project?.propertyId ?? current.propertyId,
      amount: project ? String(project.totalEstimate) : current.amount,
      notes:
        current.notes ||
        (project
          ? `Final invoice for ${project.name}. Created from estimate ${project.estimateNumber}.`
          : ""),
    }));
  }

  async function saveInvoice() {
    setModalError("");
    if (!draft.invoiceNumber.trim()) {
      setModalError("Enter an invoice number.");
      return;
    }
    if (!authUserId || !activeWorkspaceId) {
      setModalError("Workspace is still loading.");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const linkedProject = projects.find((item) => item.id === draft.projectId);
    try {
      if (selected) {
        await updateInvoice({
          ...selected,
          projectId: draft.projectId || null,
          contactId: draft.contactId || null,
          propertyId: draft.propertyId || null,
          invoiceNumber: draft.invoiceNumber.trim(),
          issueDate: draft.issueDate,
          dueDate: draft.dueDate,
          status: draft.status,
          amount: Number(draft.amount || 0),
          notes: draft.notes.trim(),
          estimateSnapshot:
            selected.estimateSnapshot ?? snapshotFromProject(linkedProject),
          updatedAt: now,
        });
      } else {
        await addInvoice({
          id: uid(),
          workspaceId: activeWorkspaceId,
          createdBy: authUserId,
          projectId: draft.projectId || null,
          contactId: draft.contactId || null,
          propertyId: draft.propertyId || null,
          invoiceNumber: draft.invoiceNumber.trim(),
          issueDate: draft.issueDate,
          dueDate: draft.dueDate,
          status: draft.status,
          amount: Number(draft.amount || 0),
          notes: draft.notes.trim(),
          estimateSnapshot: snapshotFromProject(linkedProject),
          shareToken: globalThis.crypto.randomUUID(),
          shareEnabled: false,
          sentAt: null,
          viewedAt: null,
          archivedAt: null,
          createdAt: now,
          updatedAt: now,
        });
      }
      closeModal();
    } catch (error) {
      setModalError(
        error instanceof Error
          ? error.message
          : "The invoice could not be saved."
      );
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(invoice: Invoice) {
    await updateInvoice({
      ...invoice,
      status: "paid",
      updatedAt: new Date().toISOString(),
    });
  }

  async function removeInvoice(invoice: Invoice) {
    if (!window.confirm(`Delete ${invoice.invoiceNumber}?`)) return;
    try {
      await deleteInvoice(invoice.id);
    } catch (error) {
      setModalError(
        error instanceof Error ? error.message : "The invoice could not be deleted."
      );
    }
  }

  async function finishInvoice(invoice: Invoice) {
    const finalStatus = computedStatus(invoice);
    const confirmed = window.confirm(
      `Complete ${invoice.invoiceNumber}? It will leave the active invoice list and appear on its Past Job as Archived · ${finalStatus}.`
    );
    if (!confirmed) return;

    setActionMessage("");
    setCompletingId(invoice.id);
    try {
      await completeInvoice(invoice.id);
      setActionMessage(
        `${invoice.invoiceNumber} archived with status ${finalStatus}.`
      );
    } catch (error) {
      setActionMessage(
        error instanceof Error ? error.message : "The invoice could not be completed."
      );
    } finally {
      setCompletingId("");
    }
  }

  function reminder(invoice: Invoice, channel: "email" | "sms") {
    const contact = contacts.find((item) => item.id === invoice.contactId);
    const message = `Reminder: invoice ${invoice.invoiceNumber} for ${formatMoney(
      invoice.amount
    )} is due ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
      "en-US"
    )}.`;
    if (channel === "email") {
      window.location.href = `mailto:${encodeURIComponent(
        contact?.email ?? ""
      )}?subject=${encodeURIComponent(
        `Invoice ${invoice.invoiceNumber}`
      )}&body=${encodeURIComponent(message)}`;
    } else {
      window.location.href = `sms:${encodeURIComponent(
        contact?.phone ?? ""
      )}?body=${encodeURIComponent(message)}`;
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="mt-1 text-sm text-gray-500">
            Completing a job automatically creates a final invoice from the agreed estimate.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 cursor-pointer"
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {invoicesError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {invoicesError}
        </div>
      )}

      {actionMessage && (
        <div className="mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {actionMessage}
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Outstanding
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMoney(totalOutstanding)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Paid revenue
          </p>
          <p className="mt-2 text-2xl font-bold text-gray-900">
            {formatMoney(totalPaid)}
          </p>
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <div className="relative">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoice, customer, or job"
            className={`${inputClass} pl-10`}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as "all" | InvoiceStatus)
          }
          className={inputClass}
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
      </div>

      {invoicesLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center text-sm text-gray-400">
          Loading invoices…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-16 text-center">
          <ReceiptText size={30} className="mx-auto text-gray-300" />
          <p className="mt-3 font-semibold text-gray-700">No invoices found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((invoice) => {
            const project = projects.find((item) => item.id === invoice.projectId);
            const contact = contacts.find((item) => item.id === invoice.contactId);
            const status = computedStatus(invoice);
            return (
              <div
                key={invoice.id}
                className="rounded-xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-center gap-4">
                  <Link
                    to={`/app/invoices/${invoice.id}`}
                    className="min-w-[220px] flex-1 group"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900 group-hover:text-slate-700">
                        {invoice.invoiceNumber}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClasses(
                          status
                        )}`}
                      >
                        {status}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">
                      {contact?.name || invoice.estimateSnapshot?.client || "No customer"}
                      {project?.name || invoice.estimateSnapshot?.name
                        ? ` · ${project?.name || invoice.estimateSnapshot?.name}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      Due {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}
                    </p>
                  </Link>

                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      {formatMoney(invoice.amount)}
                    </p>
                    {invoice.viewedAt && (
                      <p className="mt-1 text-xs text-gray-400">Viewed by client</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {contact?.email && status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => reminder(invoice, "email")}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                        aria-label="Email reminder"
                      >
                        <Mail size={16} />
                      </button>
                    )}
                    {contact?.phone && status !== "paid" && (
                      <button
                        type="button"
                        onClick={() => reminder(invoice, "sms")}
                        className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 cursor-pointer"
                        aria-label="Text reminder"
                      >
                        <MessageSquareText size={16} />
                      </button>
                    )}
                    {status !== "paid" && status !== "void" && (
                      <button
                        type="button"
                        onClick={() => void markPaid(invoice)}
                        className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer"
                        aria-label="Mark paid"
                      >
                        <CheckCircle2 size={17} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void finishInvoice(invoice)}
                      disabled={Boolean(completingId)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                    >
                      <PackageCheck size={16} />
                      {completingId === invoice.id ? "Completing…" : "Complete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => openInvoice(invoice)}
                      className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 cursor-pointer"
                    >
                      Edit
                    </button>
                    <Link
                      to={`/app/invoices/${invoice.id}`}
                      className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"
                      aria-label="Open invoice"
                    >
                      <ChevronRight size={18} />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[90] flex items-stretch justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[92vh] sm:max-w-2xl sm:rounded-2xl">
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {selected ? `Edit ${selected.invoiceNumber}` : "New Invoice"}
                </h2>
                <p className="mt-0.5 text-sm text-gray-500">
                  A completed job already creates this automatically; manual invoices remain available when needed.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
              {modalError && (
                <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Linked Job / Estimate</label>
                  <select
                    value={draft.projectId}
                    onChange={(event) => chooseProject(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Not linked</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} · {project.estimateNumber}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Invoice Number</label>
                  <input
                    value={draft.invoiceNumber}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        invoiceNumber: event.target.value,
                      }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Status</label>
                  <select
                    value={draft.status}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        status: event.target.value as InvoiceStatus,
                      }))
                    }
                    className={inputClass}
                  >
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                    <option value="void">Void</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Issue Date</label>
                  <input
                    type="date"
                    value={draft.issueDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, issueDate: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Due Date</label>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, dueDate: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Amount</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.amount}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, amount: event.target.value }))
                    }
                    placeholder="0.00"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Customer</label>
                  <select
                    value={draft.contactId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, contactId: event.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Not linked</option>
                    {contacts.map((contact) => (
                      <option key={contact.id} value={contact.id}>
                        {contact.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Property</label>
                  <select
                    value={draft.propertyId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, propertyId: event.target.value }))
                    }
                    className={inputClass}
                  >
                    <option value="">Not linked</option>
                    {properties
                      .filter(
                        (property) =>
                          !draft.contactId || property.contactId === draft.contactId
                      )
                      .map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Notes</label>
                  <textarea
                    rows={5}
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, notes: event.target.value }))
                    }
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 bg-white px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
              <div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeInvoice(selected)}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete Invoice
                  </button>
                )}
              </div>
              <div className="flex w-full gap-2 sm:w-auto">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 sm:flex-none cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveInvoice()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 sm:flex-none cursor-pointer"
                >
                  {saving ? "Saving…" : selected ? "Update & Close" : "Create & Close"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
