import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router";
import { Download } from "lucide-react";
import EstimateDocument from "../components/EstimateDocument";
import { supabase } from "../lib/supabase";
import type {
  Contact,
  LineItem,
  Project,
  Property,
  PropertyPhoto,
  User,
} from "../data/types";

type PublicPayload = {
  project: Record<string, unknown>;
  company: Record<string, unknown> | null;
  contact: Record<string, unknown> | null;
  property: Record<string, unknown> | null;
  photos: Array<Record<string, unknown>>;
};

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown) {
  return Number(value ?? 0);
}

function mapLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row = typeof item === "object" && item ? (item as Record<string, unknown>) : {};
    return {
      id: text(row.id) || `line-${index}`,
      description: text(row.description),
      qty: numberValue(row.qty),
      unit: text(row.unit) || "each",
      unitCost: numberValue(row.unitCost),
    };
  });
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: text(row.id),
    name: text(row.name),
    client: text(row.client),
    address: text(row.address),
    contactId: text(row.contact_id) || null,
    propertyId: text(row.property_id) || null,
    status: (text(row.status) || "active") as Project["status"],
    estimateStatus: (text(row.estimate_status) || "draft") as Project["estimateStatus"],
    estimateNumber: text(row.estimate_number),
    issueDate: text(row.issue_date),
    validUntil: text(row.valid_until) || null,
    projectType: text(row.project_type),
    squareFootage: numberValue(row.square_footage),
    laborRate: numberValue(row.labor_rate),
    laborHours: numberValue(row.labor_hours),
    lineItems: mapLineItems(row.line_items),
    aiEstimate: text(row.estimate_summary) || null,
    scopeDescription: text(row.scope_description),
    clientNotes: text(row.client_notes),
    terms: text(row.terms),
    taxRate: numberValue(row.tax_rate),
    discountAmount: numberValue(row.discount_amount),
    totalEstimate: numberValue(row.total_estimate),
    notes: "",
    shareToken: text(row.share_token),
    shareEnabled: true,
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
  };
}

function mapContact(row: Record<string, unknown> | null): Contact | null {
  if (!row || !text(row.id)) return null;
  return {
    id: text(row.id),
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

export default function PublicEstimate() {
  const { token } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
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
        setError("This estimate link is invalid.");
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc("get_public_estimate", {
        requested_token: token,
      });

      if (!active) return;
      if (rpcError || !data) {
        setError(rpcError?.message || "This estimate is unavailable or sharing was disabled.");
        setLoading(false);
        return;
      }

      const payload = data as PublicPayload;
      const mappedPhotos = await Promise.all(
        (payload.photos ?? []).map(async (row): Promise<PropertyPhoto> => {
          const storagePath = text(row.storage_path);
          const { data: signed } = await supabase.storage
            .from("property-photos")
            .createSignedUrl(storagePath, 60 * 60);
          return {
            id: text(row.id),
            propertyId: text(row.property_id),
            storagePath,
            caption: text(row.caption),
            url: signed?.signedUrl ?? "",
            createdAt: text(row.created_at),
          };
        })
      );

      if (!active) return;
      setProject(mapProject(payload.project));
      setCompany(mapCompany(payload.company));
      setContact(mapContact(payload.contact));
      setProperty(mapProperty(payload.property));
      setPhotos(mappedPhotos);
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!project || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 500);
    return () => window.clearTimeout(timer);
  }, [project?.id, searchParams]);

  if (loading) {
    return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">Loading estimate...</div>;
  }

  if (error || !project || !company) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">Estimate unavailable</h1>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="no-print max-w-[850px] mx-auto mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-700 text-white text-sm font-semibold hover:bg-green-800 cursor-pointer"
        >
          <Download size={15} /> Download PDF
        </button>
      </div>
      <EstimateDocument
        project={project}
        company={company}
        contact={contact}
        property={property}
        photos={photos}
      />
    </div>
  );
}
