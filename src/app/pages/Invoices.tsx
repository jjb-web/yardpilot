import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Mail,
  MessageSquareText,
  Plus,
  ReceiptText,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import type { Invoice, InvoiceStatus } from "../data/types";
import { combinedLaborHours } from "../lib/estimate";

function uid() {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 11);
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
  if (status === "paid") return "bg-green-100 text-green-700";
  if (status === "overdue") return "bg-red-100 text-red-700";
  if (status === "sent") return "bg-blue-100 text-blue-700";
  if (status === "void") return "bg-gray-200 text-gray-600";
  return "bg-amber-100 text-amber-700";
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
  } = useApp();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvoiceStatus>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [draft, setDraft] = useState<InvoiceDraft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...invoices]
      .filter((invoice) => {
        const project = projects.find((item) => item.id === invoice.projectId);
        const contact = contacts.find((item) => item.id === invoice.contactId);
        const computedStatus =
          invoice.status !== "paid" &&
          invoice.status !== "void" &&
          new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()
            ? "overdue"
            : invoice.status;
        if (statusFilter !== "all" && computedStatus !== statusFilter) return false;
        if (!query) return true;
        return [
          invoice.invoiceNumber,
          invoice.notes,
          project?.name ?? "",
          contact?.name ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [invoices, projects, contacts, search, statusFilter]);

  const totalOutstanding = invoices
    .filter((invoice) => invoice.status !== "paid" && invoice.status !== "void")
    .reduce((sum, invoice) => sum + invoice.amount, 0);
  const totalPaid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((sum, invoice) => sum + invoice.amount, 0);

  const inputClass =
    "w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30";
  const labelClass =
    "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

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

  function chooseProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    setDraft((current) => ({
      ...current,
      projectId,
      contactId: project?.contactId ?? current.contactId,
      propertyId: project?.propertyId ?? current.propertyId,
      amount: project ? String(project.totalEstimate) : current.amount,
      notes: current.notes || project?.name || "",
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
          createdAt: now,
          updatedAt: now,
        });
      }
      setModalOpen(false);
      setSelected(null);
      setDraft(blankDraft());
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The invoice could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function markPaid(invoice: Invoice) {
    try {
      await updateInvoice({
        ...invoice,
        status: "paid",
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : "Could not mark invoice paid.");
    }
  }

  async function removeInvoice() {
    if (!selected || !window.confirm(`Delete ${selected.invoiceNumber}?`)) return;
    setSaving(true);
    try {
      await deleteInvoice(selected.id);
      setModalOpen(false);
      setSelected(null);
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "The invoice could not be deleted.");
    } finally {
      setSaving(false);
    }
  }

  function sendEmail(invoice: Invoice) {
    const contact = contacts.find((item) => item.id === invoice.contactId);
    if (!contact?.email) return;
    const subject = encodeURIComponent(`Invoice ${invoice.invoiceNumber}`);
    const body = encodeURIComponent(
      `Hello ${contact.name},\n\nInvoice ${invoice.invoiceNumber} for $${invoice.amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} is due on ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}.\n\nThank you.`
    );
    window.location.href = `mailto:${contact.email}?subject=${subject}&body=${body}`;
  }

  function sendSms(invoice: Invoice) {
    const contact = contacts.find((item) => item.id === invoice.contactId);
    if (!contact?.phone) return;
    const body = encodeURIComponent(
      `Invoice ${invoice.invoiceNumber} for $${invoice.amount.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} is due ${new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}.`
    );
    window.location.href = `sms:${contact.phone}?&body=${body}`;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-sm text-gray-500 mt-1">
            Invoice due dates automatically appear on Schedule and create payment follow-ups.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer"
        >
          <Plus size={16} /> New Invoice
        </button>
      </div>

      {invoicesError && (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {invoicesError}
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Total invoices</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{invoices.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Outstanding</p>
          <p className="text-2xl font-bold text-red-700 mt-1">
            ${totalOutstanding.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm text-gray-500">Paid</p>
          <p className="text-2xl font-bold text-green-700 mt-1">
            ${totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <div className="relative flex-1 min-w-64">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search invoices..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as "all" | InvoiceStatus)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 bg-white text-sm text-gray-700"
        >
          <option value="all">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="void">Void</option>
        </select>
      </div>

      {invoicesLoading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-sm text-gray-400">
          Loading invoices...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <ReceiptText size={30} className="mx-auto text-gray-300 mb-3" />
          <p className="font-semibold text-gray-700">No invoices yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((invoice) => {
            const project = projects.find((item) => item.id === invoice.projectId);
            const contact = contacts.find((item) => item.id === invoice.contactId);
            const computedStatus: InvoiceStatus =
              invoice.status !== "paid" &&
              invoice.status !== "void" &&
              new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()
                ? "overdue"
                : invoice.status;
            return (
              <article key={invoice.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                  <button
                    type="button"
                    onClick={() => openInvoice(invoice)}
                    className="flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-bold text-gray-900">{invoice.invoiceNumber}</p>
                      <span className={`text-xs font-semibold capitalize px-2 py-1 rounded-full ${statusClasses(computedStatus)}`}>
                        {computedStatus}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      {contact?.name || project?.client || "No customer"}
                      {project ? ` · ${project.name}` : ""}
                    </p>
                    {project && (
                      <p className="text-xs text-gray-500 mt-2">
                        {combinedLaborHours(project).toLocaleString("en-US")} total combined labor hours · {project.billingMethod === "hourly"
                          ? "Time & materials"
                          : "Fixed price"}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-2">
                      Issued {new Date(`${invoice.issueDate}T12:00:00`).toLocaleDateString("en-US")} · Due {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}
                    </p>
                  </button>
                  <div className="lg:text-right shrink-0">
                    <p className="text-2xl font-bold text-gray-900">
                      ${invoice.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2 lg:justify-end">
                      {contact?.email && (
                        <button
                          type="button"
                          onClick={() => sendEmail(invoice)}
                          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
                        >
                          <Mail size={15} />
                        </button>
                      )}
                      {contact?.phone && (
                        <button
                          type="button"
                          onClick={() => sendSms(invoice)}
                          className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 cursor-pointer"
                        >
                          <MessageSquareText size={15} />
                        </button>
                      )}
                      {invoice.status !== "paid" && invoice.status !== "void" && (
                        <button
                          type="button"
                          onClick={() => void markPaid(invoice)}
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-green-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          <CheckCircle2 size={14} /> Paid
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[70] flex min-h-0 items-stretch sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="w-full h-[100dvh] sm:h-auto sm:max-w-2xl sm:max-h-[92vh] bg-white sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
              <h2 className="font-bold text-gray-900">
                {selected ? "Edit Invoice" : "New Invoice"}
              </h2>
              <button type="button" onClick={() => setModalOpen(false)} className="text-gray-400 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <div className="p-4 sm:p-6 grid sm:grid-cols-2 gap-4 min-h-0 overflow-y-auto overscroll-contain flex-1">
              {modalError && (
                <div className="sm:col-span-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {modalError}
                </div>
              )}
              <div>
                <label className={labelClass}>Invoice Number</label>
                <input
                  value={draft.invoiceNumber}
                  onChange={(event) => setDraft((current) => ({ ...current, invoiceNumber: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <select
                  value={draft.status}
                  onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as InvoiceStatus }))}
                  className={inputClass}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                  <option value="void">Void</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Linked Job / Estimate</label>
                <select
                  value={draft.projectId}
                  onChange={(event) => chooseProject(event.target.value)}
                  className={inputClass}
                >
                  <option value="">No linked project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.estimateNumber} — {project.name}
                    </option>
                  ))}
                </select>
              </div>
              {draft.projectId && (() => {
                const linkedProject = projects.find((item) => item.id === draft.projectId);
                return linkedProject ? (
                  <div className="sm:col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
                    <p className="font-semibold text-gray-800">Linked job pricing</p>
                    <p className="text-gray-600 mt-1">
                      {combinedLaborHours(linkedProject).toLocaleString("en-US")} total combined labor hours · {linkedProject.billingMethod === "hourly"
                        ? "Time & materials based on total hours"
                        : "Fixed price due by job completion"}
                    </p>
                  </div>
                ) : null;
              })()}
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
                <label className={labelClass}>Property</label>
                <select
                  value={draft.propertyId}
                  onChange={(event) => setDraft((current) => ({ ...current, propertyId: event.target.value }))}
                  className={inputClass}
                >
                  <option value="">No property</option>
                  {properties
                    .filter((property) => !draft.contactId || property.contactId === draft.contactId)
                    .map((property) => (
                      <option key={property.id} value={property.id}>{property.name}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Issue Date</label>
                <input
                  type="date"
                  value={draft.issueDate}
                  onChange={(event) => setDraft((current) => ({ ...current, issueDate: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Due Date</label>
                <input
                  type="date"
                  value={draft.dueDate}
                  onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Amount</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.amount}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (/^\d*(?:\.\d{0,2})?$/.test(value)) {
                      setDraft((current) => ({ ...current, amount: value }));
                    }
                  }}
                  className={inputClass}
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0 bg-white pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div>
                {selected && (
                  <button
                    type="button"
                    onClick={() => void removeInvoice()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete
                  </button>
                )}
              </div>
              <div className="flex w-full sm:w-auto gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="flex-1 sm:flex-none px-4 py-2 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 cursor-pointer">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void saveInvoice()}
                  disabled={saving}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-green-700 text-white text-sm font-semibold cursor-pointer disabled:opacity-60"
                >
                  {saving ? "Saving..." : selected ? "Update Invoice" : "Create Invoice"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
