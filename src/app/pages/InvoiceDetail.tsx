import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ArrowLeft, Download, Edit3, PackageCheck, Share2 } from "lucide-react";
import CopyToast from "../components/CopyToast";
import InvoiceDocument from "../components/InvoiceDocument";
import { useApp } from "../context/AppContext";
import { useCopyFeedback } from "../hooks/useCopyFeedback";
import { invoiceShareUrl } from "../lib/estimate";

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
  } = useApp();
  const [message, setMessage] = useState("");
  const { copyText, copiedMessage } = useCopyFeedback();

  const invoice = invoices.find((item) => item.id === id) ?? null;
  const contact = contacts.find((item) => item.id === invoice?.contactId) ?? null;
  const property = properties.find((item) => item.id === invoice?.propertyId) ?? null;
  const photos = propertyPhotos.filter((item) => item.propertyId === property?.id);

  useEffect(() => {
    if (!invoice || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [invoice?.id, searchParams]);

  async function shareInvoice() {
    if (!invoice) return;
    setMessage("");
    try {
      const shared = invoice.shareEnabled
        ? invoice
        : await setInvoiceSharing(invoice.id, true);
      const url = invoiceShareUrl(shared.shareToken);
      const shareData = {
        title: `${shared.invoiceNumber} - Invoice`,
        text: `Invoice ${shared.invoiceNumber}`,
        url,
      };

      if (navigator.share) {
        await navigator.share(shareData);
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
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage(error instanceof Error ? error.message : "Could not share invoice.");
    }
  }

  async function finishInvoice() {
    if (!invoice) return;
    const finalStatus =
      invoice.status !== "paid" &&
      invoice.status !== "void" &&
      new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now()
        ? "overdue"
        : invoice.status;
    const confirmed = window.confirm(
      `Complete ${invoice.invoiceNumber}? It will leave the active invoice list and appear on its Past Job as Archived · ${finalStatus}.`
    );
    if (!confirmed) return;

    setMessage("");
    try {
      await completeInvoice(invoice.id);
      navigate("/app/projects/past");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The invoice could not be completed."
      );
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
          <Link
            to={`/app/invoices?edit=${invoice.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Edit3 size={15} /> Edit
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer"
          >
            <Download size={15} /> Download PDF
          </button>
          <button
            type="button"
            onClick={() => void shareInvoice()}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 cursor-pointer"
          >
            <Share2 size={15} /> Share Invoice
          </button>
          {!invoice.archivedAt && (
            <button
              type="button"
              onClick={() => void finishInvoice()}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <PackageCheck size={15} /> Complete Invoice
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className="no-print mb-5 rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {message}
        </div>
      )}

      {invoice.archivedAt && (
        <div className="no-print mb-5 rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-700">
          Archived invoice · {invoice.status}
        </div>
      )}

      <InvoiceDocument
        invoice={invoice}
        company={user}
        contact={contact}
        property={property}
        photos={photos}
      />
      <CopyToast message={copiedMessage} />
    </div>
  );
}
