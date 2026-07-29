import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Download, Loader2 } from "lucide-react";
import { useParams, useSearchParams } from "react-router";
import InvoiceDocument from "../components/InvoiceDocument";
import { supabase } from "../lib/supabase";
import type {
  Contact,
  Invoice,
  InvoiceSnapshot,
  LineItem,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";
import { formatMoney } from "../lib/estimate";

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function mapLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row =
      typeof item === "object" && item
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: text(row.id) || `line-${index}`,
      description: text(row.description),
      qty: numberValue(row.qty),
      unit: text(row.unit) || "flat",
      unitCost: numberValue(row.unit_cost ?? row.unitCost),
      internalCost: 0,
    };
  });
}

function mapSnapshot(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const assignments = row.labor_assignments ?? row.laborAssignments;
  return {
    estimateNumber: text(row.estimate_number ?? row.estimateNumber),
    name: text(row.name),
    client: text(row.client),
    address: text(row.address),
    city: text(row.city),
    projectType: text(row.project_type ?? row.projectType),
    billingMethod:
      text(row.billing_method ?? row.billingMethod) === "hourly"
        ? "hourly"
        : "fixed",
    lineItems: mapLineItems(row.line_items ?? row.lineItems),
    laborAssignments: Array.isArray(assignments)
      ? assignments.map((item) => {
          const assignment = item as Record<string, unknown>;
          return {
            userId: text(assignment.user_id ?? assignment.userId),
            name: text(assignment.name) || "Team member",
            hours: numberValue(assignment.hours),
            hourlyRate: 0,
          };
        })
      : [],
    laborHours: numberValue(row.labor_hours ?? row.laborHours),
    laborRate: numberValue(row.labor_rate ?? row.laborRate),
    aiEstimate: text(row.estimate_summary ?? row.aiEstimate) || null,
    scopeDescription: text(row.scope_description ?? row.scopeDescription),
    clientNotes: text(row.client_notes ?? row.clientNotes),
    terms: text(row.terms),
    taxRate: numberValue(row.tax_rate ?? row.taxRate),
    discountAmount: numberValue(row.discount_amount ?? row.discountAmount),
    totalEstimate: numberValue(row.total_estimate ?? row.totalEstimate),
    internalOtherCost: 0,
    responseName: text(row.response_name ?? row.responseName),
    signatureData: text(row.signature_data ?? row.signatureData),
    acceptedAt: text(row.accepted_at ?? row.acceptedAt) || null,
  };
}

function mapInvoice(row: Record<string, unknown>): Invoice {
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    createdBy: text(row.created_by),
    projectId: text(row.project_id) || null,
    contactId: text(row.contact_id) || null,
    propertyId: text(row.property_id) || null,
    invoiceNumber: text(row.invoice_number),
    issueDate: text(row.issue_date),
    dueDate: text(row.due_date),
    status: (text(row.status) || "sent") as Invoice["status"],
    amount: numberValue(row.amount),
    notes: text(row.notes),
    estimateSnapshot: mapSnapshot(row.estimate_snapshot),
    shareToken: text(row.share_token),
    shareEnabled: true,
    sentAt: text(row.sent_at) || null,
    viewedAt: text(row.viewed_at) || null,
    paymentStatus:
      text(row.payment_status) === "paid"
        ? "paid"
        : text(row.payment_status) === "failed"
          ? "failed"
          : text(row.payment_status) === "refunded"
            ? "refunded"
            : "unpaid",
    paymentMethod: text(row.payment_method),
    stripeCheckoutUrl: null,
    stripeCheckoutSessionId: null,
    stripePaymentIntentId: null,
    paidAt: text(row.paid_at) || null,
    completedAt: text(row.completed_at) || null,
    voidedAt: text(row.voided_at) || null,
    archivedAt: text(row.archived_at) || null,
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function mapCompany(row: Record<string, unknown> | null): User {
  return {
    name: text(row?.full_name) || "YardPilot Professional",
    email: text(row?.email),
    company: text(row?.company) || "YardPilotUSA",
    phone: text(row?.phone),
    city: text(row?.city),
    state: text(row?.state),
  };
}

function mapContact(row: Record<string, unknown> | null): Contact | null {
  if (!row || !text(row.id)) return null;
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    name: text(row.name),
    email: text(row.email),
    phone: text(row.phone),
    address: text(row.address),
    city: text(row.city),
    state: text(row.state),
    zip: text(row.zip),
    contactType: "customer",
    activityStatus: "active",
    source: "",
    notes: "",
    createdAt: "",
    updatedAt: "",
  };
}

function mapProperty(row: Record<string, unknown> | null): Property | null {
  if (!row || !text(row.id)) return null;
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    contactId: text(row.contact_id),
    name: text(row.name),
    address: text(row.address),
    city: text(row.city),
    state: text(row.state),
    zip: text(row.zip),
    description: text(row.description),
    internalNotes: "",
    clientNotes: text(row.client_notes),
    createdAt: "",
    updatedAt: "",
  };
}

type Payload = {
  invoice: Record<string, unknown>;
  company: Record<string, unknown> | null;
  contact: Record<string, unknown> | null;
  property: Record<string, unknown> | null;
  photos: Array<Record<string, unknown>>;
  payments?: {
    enabled?: boolean;
  };
};

export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<User | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [photos, setPhotos] = useState<PropertyPhoto[]>([]);
  const [paymentsEnabled, setPaymentsEnabled] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  const load = useCallback(async () => {
    if (!token) {
      setError("This invoice link is invalid.");
      setLoading(false);
      return;
    }

    const { data, error: rpcError } = await supabase.rpc(
      "get_public_invoice",
      { requested_token: token }
    );
    if (rpcError || !data) {
      setError(
        rpcError?.message ||
          "This invoice is unavailable or sharing was disabled."
      );
      setLoading(false);
      return;
    }

    const payload = data as Payload;
    const mappedPhotos = await Promise.all(
      (payload.photos ?? []).map(async (row): Promise<PropertyPhoto> => {
        const storagePath = text(row.storage_path);
        const { data: signed } = await supabase.storage
          .from("property-photos")
          .createSignedUrl(storagePath, 60 * 60);
        return {
          id: text(row.id),
          workspaceId: text(row.workspace_id),
          propertyId: text(row.property_id),
          storagePath,
          caption: text(row.caption),
          url: signed?.signedUrl ?? "",
          createdAt: text(row.created_at),
        };
      })
    );

    setInvoice(mapInvoice(payload.invoice));
    setCompany(mapCompany(payload.company));
    setContact(mapContact(payload.contact));
    setProperty(mapProperty(payload.property));
    setPhotos(mappedPhotos);
    setPaymentsEnabled(Boolean(payload.payments?.enabled));
    setLoading(false);
    void supabase.rpc("record_invoice_view", { requested_token: token });
  }, [token]);

  useEffect(() => {
    let active = true;
    void load().catch(() => {
      if (active) {
        setError("The invoice could not be loaded.");
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [load]);

  useEffect(() => {
    if (searchParams.get("payment") !== "success" || !token) return;
    setPaymentMessage("Payment received. Confirming the invoice status…");
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      void load();
      if (attempts >= 8) window.clearInterval(timer);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [searchParams, token, load]);

  useEffect(() => {
    if (!invoice || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [invoice?.id, searchParams]);

  async function payInvoice() {
    if (!token) return;
    setPaying(true);
    setPaymentMessage("");
    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "create-invoice-checkout",
        { body: { shareToken: token } }
      );
      if (functionError) throw new Error(functionError.message);
      const url = typeof data?.url === "string" ? data.url : "";
      if (!url) throw new Error("Stripe did not return a payment page.");
      window.location.assign(url);
    } catch (paymentError) {
      setPaymentMessage(
        paymentError instanceof Error
          ? paymentError.message
          : "The payment page could not be opened."
      );
      setPaying(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">
        Loading invoice…
      </div>
    );
  }

  if (error || !invoice || !company) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-gray-900">Invoice unavailable</h1>
          <p className="mt-2 text-sm text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  const isPaid = invoice.paymentStatus === "paid" || invoice.status === "paid";
  const isVoid = invoice.status === "void";
  const isOverdue =
    invoice.status === "sent" &&
    new Date(`${invoice.dueDate}T23:59:59`).getTime() < Date.now();

  return (
    <main className="min-h-screen bg-gray-100 px-3 py-6 sm:px-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {isPaid ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1.5 text-sm font-bold text-emerald-700">
              <CheckCircle2 size={16} /> Paid
            </p>
          ) : isVoid ? (
            <p className="rounded-full bg-gray-200 px-3 py-1.5 text-sm font-bold text-gray-600">
              Void
            </p>
          ) : isOverdue ? (
            <p className="rounded-full bg-red-100 px-3 py-1.5 text-sm font-bold text-red-700">
              Overdue · {formatMoney(invoice.amount)} due
            </p>
          ) : (
            <p className="text-sm text-gray-600">
              {formatMoney(invoice.amount)} due{" "}
              {new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString(
                "en-US"
              )}
            </p>
          )}
          {paymentMessage && (
            <p className="mt-2 text-sm text-slate-600">{paymentMessage}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {paymentsEnabled && !isPaid && !isVoid && (
            <button
              type="button"
              onClick={() => void payInvoice()}
              disabled={paying}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-60"
            >
              {paying ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <CreditCard size={16} />
              )}
              {paying ? "Opening secure payment…" : "Pay securely with Stripe"}
            </button>
          )}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700"
          >
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>

      {!paymentsEnabled && !isPaid && !isVoid && (
        <div className="no-print mx-auto mb-4 max-w-4xl rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          Online payment is not enabled for this business. Contact the sender for
          payment instructions.
        </div>
      )}

      <InvoiceDocument
        invoice={invoice}
        company={company}
        contact={contact}
        property={property}
        photos={photos}
      />
    </main>
  );
}
