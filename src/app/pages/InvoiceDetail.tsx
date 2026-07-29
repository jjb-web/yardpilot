import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  PackageCheck,
  Share2,
  Trash2,
} from "lucide-react";
import ConfirmDialog from "../components/ConfirmDialog";
import CopyToast from "../components/CopyToast";
import InvoiceDocument from "../components/InvoiceDocument";
import { useApp } from "../context/AppContext";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import type { Invoice, InvoiceStatus } from "../data/types";
import { formatMoney, invoiceShareUrl } from "../lib/estimate";

function displayStatus(invoice: Invoice): InvoiceStatus {
  if (invoice.paymentStatus === "paid" || invoice.status === "paid") {
    return "paid";
  }
  if (invoice.status === "void") return "void";
  if (
    invoice.status === "sent" &&
    new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()
  ) {
    return "overdue";
  }
  return invoice.status;
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    invoices,
    invoicesLoading,
    contacts,
    properties,
    propertyPhotos,
    setInvoiceSharing,
    completeInvoice,
    voidInvoice,
    markInvoicePaid,
    deleteInvoice,
  } = useApp();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<
    "complete" | "void" | "delete" | null
  >(null);
  const { copyText, copiedMessage } = useCopyFeedback();

  const invoice = invoices.find((item) => item.id === id) ?? null;
  const contact = contacts.find((item) => item.id === invoice?.contactId) ?? null;
  const property = properties.find((item) => item.id === invoice?.propertyId) ?? null;
  const photos = propertyPhotos.filter(
    (item) => item.propertyId === property?.id
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [id]);

  useEffect(() => {
    if (!invoice || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [invoice?.id, searchParams]);

  async function shareInvoice() {
    if (!invoice) return;
    setMessage("");
    setBusy(true);
    try {
      const shared =
        invoice.shareEnabled && invoice.status !== "draft"
          ? invoice
          : await setInvoiceSharing(invoice.id, true);
      const url = invoiceShareUrl(shared.shareToken);
      if (navigator.share) {
        await navigator.share({
          title: `${shared.invoiceNumber} - Invoice`,
          text: `Invoice ${shared.invoiceNumber} for ${formatMoney(
            shared.amount
          )}`,
          url,
        });
        setMessage("Invoice marked Sent and shared.");
      } else {
        const copied = await copyText(url, "Public invoice link copied");
        if (!copied) window.prompt("Copy this public invoice link:", url);
        setMessage(
          copied
            ? "Invoice marked Sent and public link copied."
            : "Invoice marked Sent. Copy the public link from the prompt."
        );
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setMessage(
          error instanceof Error ? error.message : "Could not share invoice."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function runConfirmedAction() {
    if (!invoice || !confirmAction) return;
    setBusy(true);
    setMessage("");
    try {
      if (confirmAction === "void") {
        await voidInvoice(invoice.id);
        setMessage("Invoice voided and archived.");
        navigate("/app/projects/past");
      } else if (confirmAction === "delete") {
        await deleteInvoice(invoice.id);
        navigate("/app/invoices", { replace: true });
      } else {
        await completeInvoice(invoice.id);
        navigate("/app/projects/past");
      }
      setConfirmAction(null);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The invoice action failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function markPaidOffline() {
    if (!invoice) return;
    setBusy(true);
    setMessage("");
    try {
      await markInvoicePaid(invoice.id, "offline");
      setMessage("Invoice marked paid, completed, and archived.");
      navigate("/app/projects/past");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not mark the invoice paid."
      );
    } finally {
      setBusy(false);
    }
  }

  if (invoicesLoading) {
    return <div className="p-6 text-sm text-gray-500">Loading invoice…</div>;
  }

  if (!invoice || !user) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <h1 className="text-xl font-bold text-gray-900">Invoice not found</h1>
          <button
            type="button"
            onClick={() => navigate("/app/invoices")}
            className="mt-4 text-sm font-semibold text-slate-700 cursor-pointer"
          >
            Return to invoices
          </button>
        </div>
      </div>
    );
  }

  const status = displayStatus(invoice);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/app/invoices"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Back to invoices
        </Link>

        <div className="flex flex-wrap gap-2">
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <Link
              to={`/app/invoices?edit=${invoice.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Edit3 size={15} /> Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <Download size={15} /> Download PDF
          </button>
          {status !== "void" && (
            <button
              type="button"
              onClick={() => void shareInvoice()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60 cursor-pointer"
            >
              <Share2 size={15} /> Share Invoice
            </button>
          )}
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <button
              type="button"
              onClick={() => void markPaidOffline()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              <CheckCircle2 size={15} /> Paid Offline
            </button>
          )}
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <button
              type="button"
              onClick={() => setConfirmAction("void")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <Ban size={15} /> Void
            </button>
          )}
          {!invoice.archivedAt && (
            <button
              type="button"
              onClick={() => setConfirmAction("complete")}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <PackageCheck size={15} /> Complete
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmAction("delete")}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 size={15} /> Delete
          </button>
        </div>
      </div>

      {message && (
        <div className="no-print mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      <div className="no-print mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-4 text-sm">
        <span className="font-semibold capitalize text-gray-800">{status}</span>
        <span className="text-gray-300">•</span>
        <span className="text-gray-500">
          Due {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("en-US")}
        </span>
        {invoice.paymentMethod && (
          <>
            <span className="text-gray-300">•</span>
            <span className="capitalize text-gray-500">
              Payment: {invoice.paymentMethod}
            </span>
          </>
        )}
        {invoice.paidAt && (
          <>
            <span className="text-gray-300">•</span>
            <span className="text-gray-500">
              Paid {new Date(invoice.paidAt).toLocaleDateString("en-US")}
            </span>
          </>
        )}
      </div>

      {invoice.archivedAt && (
        <div className="no-print mb-5 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Archived invoice · {status}
        </div>
      )}

      <InvoiceDocument
        invoice={invoice}
        company={user}
        contact={contact}
        property={property}
        photos={photos}
      />

      <div className="no-print mt-6 flex justify-center">
        <Link
          to="/app/invoices"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={15} /> Back to invoices
        </Link>
      </div>

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={
          confirmAction === "delete"
            ? `Delete ${invoice.invoiceNumber}?`
            : confirmAction === "void"
              ? `Void ${invoice.invoiceNumber}?`
              : `Complete ${invoice.invoiceNumber}?`
        }
        description={
          confirmAction === "delete"
            ? "This permanently deletes this invoice record and cannot be undone."
            : confirmAction === "void"
              ? "The public payment button will be disabled. The invoice will be preserved as Void and attached to its Past Job."
              : "This closes and archives the invoice beside its Past Job. An unpaid invoice stays recorded as unpaid; it is not falsely marked paid."
        }
        confirmLabel={
          confirmAction === "delete"
            ? "Delete Invoice"
            : confirmAction === "void"
              ? "Void Invoice"
              : "Complete Invoice"
        }
        destructive={confirmAction === "delete" || confirmAction === "void"}
        busy={busy}
        onCancel={() => setConfirmAction(null)}
        onConfirm={() => void runConfirmedAction()}
      />
      <CopyToast message={copiedMessage} />
    </div>
  );
}
