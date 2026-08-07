import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  CreditCard,
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
import { useSubscription } from "../hooks/useSubscription";
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

function paymentMethodLabel(value: string) {
  return value.replace(/^other:/, "").replaceAll("_", " ");
}

export default function InvoiceDetail() {
  const { hasFeature } = useSubscription();
  const onlinePaymentsUnlocked = hasFeature("online_payments");
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const {
    user,
    activeWorkspace,
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
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [customPaymentMethod, setCustomPaymentMethod] = useState("");
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

  async function shareInvoice(onlinePayment: boolean) {
    if (!invoice) return;
    const stripeReady = Boolean(
      activeWorkspace?.stripeChargesEnabled &&
        activeWorkspace?.stripePayoutsEnabled
    );
    if (onlinePayment && !stripeReady) {
      setMessage(
        "Connect Stripe under Account → Invoice payments before sending an online payment link."
      );
      return;
    }
    setMessage("");
    setBusy(true);
    try {
      const shared =
        invoice.shareEnabled && invoice.status !== "draft"
          ? invoice
          : await setInvoiceSharing(invoice.id, true);
      const baseUrl = invoiceShareUrl(shared.shareToken);
      const url = onlinePayment ? baseUrl : `${baseUrl}?mode=copy`;
      const text = onlinePayment
        ? `Pay invoice ${shared.invoiceNumber} online for ${formatMoney(shared.amount)}`
        : `Invoice ${shared.invoiceNumber} for ${formatMoney(shared.amount)}`;
      if (navigator.share) {
        await navigator.share({
          title: `${shared.invoiceNumber} - Invoice`,
          text,
          url,
        });
      } else {
        const copied = await copyText(
          url,
          onlinePayment ? "Online payment link copied" : "Invoice copy link copied"
        );
        if (!copied) window.prompt("Copy this invoice link:", url);
      }
      setMessage(
        onlinePayment
          ? "Invoice marked Sent and online payment link shared."
          : "Invoice marked Sent and invoice-copy link shared."
      );
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

  async function markPaidInPerson() {
    if (!invoice) return;
    setBusy(true);
    setMessage("");
    try {
      const method = paymentMethod === "other" ? `other:${customPaymentMethod.trim()}` : paymentMethod;
      if (paymentMethod === "other" && !customPaymentMethod.trim()) {
        setMessage("Describe the other payment method before saving.");
        setBusy(false);
        return;
      }
      await markInvoicePaid(invoice.id, method);
      setMessage(
        `Invoice marked paid in person (${paymentMethodLabel(method)}), completed, and archived.`
      );
      setPaymentModalOpen(false);
      navigate(-1);
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
            onClick={() => navigate(-1)}
            className="mt-4 text-sm font-semibold text-slate-700 cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  const status = displayStatus(invoice);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="no-print mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-3 lg:grid-cols-4">
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <Link
              to={`/app/invoices?edit=${invoice.id}`}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              <Edit3 size={15} /> Edit
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <Download size={15} /> Download PDF
          </button>
          {status !== "void" && (
            <>
              <button
                type="button"
                onClick={() => void shareInvoice(false)}
                disabled={busy}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
              >
                <Share2 size={15} /> Share invoice copy
              </button>
              <button
                type="button"
                onClick={() => void shareInvoice(true)}
                disabled={
                  busy ||
                  !activeWorkspace?.stripeChargesEnabled ||
                  !activeWorkspace?.stripePayoutsEnabled
                }
                title={
                  activeWorkspace?.stripeChargesEnabled && activeWorkspace?.stripePayoutsEnabled
                    ? "Send the invoice with online Stripe payment"
                    : "Connect Stripe in Account first"
                }
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
              >
                <CreditCard size={15} /> Send online payment link
              </button>
            </>
          )}
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <button
              type="button"
              onClick={() => { setPaymentMethod("cash"); setCustomPaymentMethod(""); setPaymentModalOpen(true); }}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
            >
              <CheckCircle2 size={15} /> Paid in person
            </button>
          )}
          {!invoice.archivedAt && status !== "paid" && status !== "void" && (
            <button
              type="button"
              onClick={() => setConfirmAction("void")}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60"
            >
              <Ban size={15} /> Void
            </button>
          )}
          {!invoice.archivedAt && (
            <button
              type="button"
              onClick={() => setConfirmAction("complete")}
              disabled={busy}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              <PackageCheck size={15} /> Complete
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmAction("delete")}
            disabled={busy}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
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

      {!activeWorkspace?.stripeChargesEnabled || !activeWorkspace?.stripePayoutsEnabled ? (
        <div className="no-print mb-5 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          <p className="font-semibold">Online payments are not connected yet.</p>
          <p className="mt-1">Connect Stripe under Account → Invoice payments to send customers a link they can pay online. You can still share the invoice copy or record an in-person payment.</p>
          <Link to="/app/account" className="mt-2 inline-flex font-semibold underline">Open payment settings</Link>
        </div>
      ) : null}

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
              Payment: {paymentMethodLabel(invoice.paymentMethod)}
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
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={15} /> Back
        </button>
      </div>

      {paymentModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-gray-900">Mark paid in person</h2>
            <p className="mt-2 text-sm text-gray-500">Choose how the customer paid outside YardPilotUSA.</p>
            <label className="mt-5 block text-xs font-semibold uppercase tracking-wide text-gray-500">Payment method</label>
            <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm">
              <option value="cash">Cash</option>
              <option value="check">Check</option>
              <option value="card_outside_yardpilot">Card outside YardPilotUSA</option>
              <option value="bank_transfer">Bank transfer</option>
              <option value="cash_app">Cash App</option>
              <option value="venmo">Venmo</option>
              <option value="other">Other</option>
            </select>
            {paymentMethod === "other" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">Describe payment method</label>
                <input value={customPaymentMethod} onChange={(event) => setCustomPaymentMethod(event.target.value)} maxLength={80} placeholder="Example: Zelle, money order, barter" className="mt-2 min-h-11 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm" />
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPaymentModalOpen(false)} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700">Cancel</button>
              <button type="button" onClick={() => void markPaidInPerson()} disabled={busy || (paymentMethod === "other" && !customPaymentMethod.trim())} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">Mark paid</button>
            </div>
          </div>
        </div>
      )}

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
