import { useEffect, useState } from "react";
import { Download } from "lucide-react";
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
            hourlyRate: numberValue(
              assignment.hourly_rate ?? assignment.hourlyRate
            ),
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
};

export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [company, setCompany] = useState<User | null>(null);
  const [contact, setContact] = useState<Contact | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [photos, setPhotos] = useState<PropertyPhoto[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!token) {
        setError("This invoice link is invalid.");
        setLoading(false);
        return;
      }
      const { data, error: rpcError } = await supabase.rpc("get_public_invoice", {
        requested_token: token,
      });
      if (!active) return;
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
      if (!active) return;
      setInvoice(mapInvoice(payload.invoice));
      setCompany(mapCompany(payload.company));
      setContact(mapContact(payload.contact));
      setProperty(mapProperty(payload.property));
      setPhotos(mappedPhotos);
      setLoading(false);
      void supabase.rpc("record_invoice_view", { requested_token: token });
    }
    void load();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!invoice || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 450);
    return () => window.clearTimeout(timer);
  }, [invoice?.id, searchParams]);

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

  return (
    <main className="min-h-screen bg-gray-100 px-3 py-6 sm:px-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-4xl justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white cursor-pointer"
        >
          <Download size={16} /> Download PDF
        </button>
      </div>
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
