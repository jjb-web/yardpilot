import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useParams, useSearchParams } from "react-router";
import {
  CheckCircle2,
  Download,
  RotateCcw,
  XCircle,
} from "lucide-react";
import EstimateDocument from "../components/EstimateDocument";
import { supabase } from "../lib/supabase";
import type {
  Contact,
  EstimateJob,
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
    const row =
      typeof item === "object" && item
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: text(row.id) || `line-${index}`,
      description: text(row.description),
      qty: numberValue(row.qty),
      unit: text(row.unit) || "each",
      itemType:
        text(row.itemType) === "fuel" ||
        text(row.itemType) === "service"
          ? (text(row.itemType) as LineItem["itemType"])
          : "material",
      unitCost: numberValue(row.unitCost ?? row.unit_cost),
    };
  });
}

function mapJobSections(value: unknown): EstimateJob[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const row =
      typeof item === "object" && item
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: text(row.id) || `job-${index + 1}`,
      title: text(row.title) || `Job ${index + 1}`,
      projectType: text(row.projectType ?? row.project_type),
      scopeDescription: text(row.scopeDescription ?? row.scope_description),
      internalNotes: "",
      squareFootage: numberValue(row.squareFootage ?? row.square_footage),
      pricePerSquareFoot: numberValue(
        row.pricePerSquareFoot ?? row.price_per_square_foot
      ),
      scheduledStart: text(row.scheduledStart ?? row.scheduled_start) || null,
      scheduledEnd: text(row.scheduledEnd ?? row.scheduled_end) || null,
      laborRate: numberValue(row.laborRate ?? row.labor_rate),
      laborHours: numberValue(row.laborHours ?? row.labor_hours),
      laborAssignments: Array.isArray(
        row.laborAssignments ?? row.labor_assignments
      )
        ? ((row.laborAssignments ?? row.labor_assignments) as Array<
            Record<string, unknown>
          >).map((assignment) => ({
            userId: text(assignment.userId ?? assignment.user_id),
            name: text(assignment.name) || "Crew member",
            hours: numberValue(assignment.hours),
            hourlyRate: numberValue(
              assignment.hourlyRate ?? assignment.hourly_rate
            ),
          }))
        : [],
      lineItems: mapLineItems(row.lineItems ?? row.line_items),
      photoIds: Array.isArray(row.photoIds ?? row.photo_ids)
        ? ((row.photoIds ?? row.photo_ids) as unknown[]).map(text).filter(Boolean)
        : [],
    };
  });
}

function mapProject(row: Record<string, unknown>): Project {
  return {
    id: text(row.id),
    workspaceId: text(row.workspace_id),
    createdBy: text(row.created_by) || text(row.user_id),
    name: text(row.name),
    client: text(row.client),
    address: text(row.address),
    city: text(row.city),
    contactId: text(row.contact_id) || null,
    propertyId: text(row.property_id) || null,
    status: (text(row.status) || "active") as Project["status"],
    estimateStatus: (text(row.estimate_status) ||
      "draft") as Project["estimateStatus"],
    estimateNumber: text(row.estimate_number),
    issueDate: text(row.issue_date),
    validUntil: text(row.valid_until) || null,
    invoiceDueDate: text(row.invoice_due_date) || null,
    projectType: text(row.project_type),
    jobSections: mapJobSections(row.job_sections),
    billingMethod: (text(row.billing_method) || "fixed") as Project["billingMethod"],
    squareFootage: numberValue(row.square_footage),
    laborRate: numberValue(row.labor_rate),
    laborHours: numberValue(row.labor_hours),
    laborAssignments: Array.isArray(row.labor_assignments)
      ? (row.labor_assignments as Array<Record<string, unknown>>).map(
          (assignment) => ({
            userId: text(assignment.user_id ?? assignment.userId),
            name: text(assignment.name) || "Crew member",
            hours: numberValue(assignment.hours),
            hourlyRate: numberValue(
              assignment.hourly_rate ?? assignment.hourlyRate
            ),
          })
        )
      : [],
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
    sentAt: text(row.sent_at) || null,
    viewedAt: text(row.viewed_at) || null,
    respondedAt: text(row.responded_at) || null,
    acceptedAt: text(row.accepted_at) || null,
    declinedAt: text(row.declined_at) || null,
    responseName: text(row.response_name),
    responseMessage: text(row.response_message),
    signatureData: text(row.signature_data),
    scheduledStart: text(row.scheduled_start) || null,
    scheduledEnd: text(row.scheduled_end) || null,
    followUpAt: text(row.follow_up_at) || null,
    assignedMemberIds: [],
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

function SignaturePad({
  onChange,
}: {
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const inkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function resizeCanvas() {
      if (!canvas) return;
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.floor(bounds.width * ratio));
      canvas.height = Math.max(1, Math.floor(bounds.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.scale(ratio, ratio);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = 2.25;
      context.strokeStyle = "#111827";
    }

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const bounds = canvas.getBoundingClientRect();
    return {
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
  }

  function begin(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawingRef.current = true;
  }

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
    if (!inkRef.current) {
      inkRef.current = true;
      setHasInk(true);
    }
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas || !drawingRef.current) return;
    drawingRef.current = false;
    if (canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    onChange(inkRef.current ? canvas.toDataURL("image/png") : "");
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    inkRef.current = false;
    setHasInk(false);
    onChange("");
  }

  return (
    <div>
      <div className="relative rounded-xl border border-gray-300 bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          className="block w-full h-40 touch-none cursor-crosshair"
          onPointerDown={begin}
          onPointerMove={draw}
          onPointerUp={finish}
          onPointerCancel={finish}
          aria-label="Signature pad"
        />
        {!hasInk && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-300">
            Sign here with your finger or mouse
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={clear}
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-500 hover:text-gray-800 cursor-pointer"
      >
        <RotateCcw size={14} /> Clear signature
      </button>
    </div>
  );
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
  const [responseName, setResponseName] = useState("");
  const [responseMessage, setResponseMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [responding, setResponding] = useState(false);
  const [responseError, setResponseError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      if (!token) {
        setError("This estimate link is invalid.");
        setLoading(false);
        return;
      }

      const { data, error: rpcError } = await supabase.rpc(
        "get_public_estimate",
        { requested_token: token }
      );

      if (!active) return;
      if (rpcError || !data) {
        setError(
          rpcError?.message ||
            "This estimate is unavailable or sharing was disabled."
        );
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
      const mappedProject = mapProject(payload.project);
      setProject(mappedProject);
      setCompany(mapCompany(payload.company));
      setContact(mapContact(payload.contact));
      setProperty(mapProperty(payload.property));
      setPhotos(mappedPhotos);
      setResponseName(
        mappedProject.responseName || mapContact(payload.contact)?.name || ""
      );
      setResponseMessage(mappedProject.responseMessage);
      setLoading(false);

      void supabase.rpc("record_estimate_view", {
        requested_token: token,
      });
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

  async function respond(decision: "accepted" | "declined") {
    if (!token || !project) return;
    setResponseError("");
    if (!responseName.trim()) {
      setResponseError("Enter your name before responding.");
      return;
    }
    if (decision === "accepted" && !signature) {
      setResponseError("Add your signature before accepting.");
      return;
    }

    setResponding(true);
    const { data, error: responseRpcError } = await supabase.rpc(
      "respond_to_estimate",
      {
        requested_token: token,
        requested_decision: decision,
        requested_name: responseName.trim(),
        requested_signature: decision === "accepted" ? signature : "",
        requested_message: responseMessage.trim(),
      }
    );
    setResponding(false);

    if (responseRpcError) {
      setResponseError(responseRpcError.message);
      return;
    }

    const result = (data ?? {}) as Record<string, unknown>;
    setProject((current) =>
      current
        ? {
            ...current,
            estimateStatus: decision,
            respondedAt: text(result.responded_at) || new Date().toISOString(),
            acceptedAt:
              decision === "accepted" ? new Date().toISOString() : null,
            declinedAt:
              decision === "declined" ? new Date().toISOString() : null,
            responseName: responseName.trim(),
            responseMessage: responseMessage.trim(),
            signatureData: decision === "accepted" ? signature : "",
          }
        : current
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">
        Loading estimate...
      </div>
    );
  }

  if (error || !project || !company) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-6">
        <div className="max-w-md bg-white rounded-xl border border-gray-200 p-8 text-center">
          <h1 className="text-xl font-bold text-gray-900">
            Estimate unavailable
          </h1>
          <p className="text-sm text-gray-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  const finished =
    project.estimateStatus === "accepted" ||
    project.estimateStatus === "declined";

  return (
    <div
      className="min-h-screen bg-gray-100 p-3 sm:p-8"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="no-print max-w-[850px] mx-auto mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">
            {project.estimateNumber}
          </p>
          <p className="text-xs text-gray-500 capitalize">
            Status: {project.estimateStatus}
          </p>
        </div>
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

      <section className="no-print max-w-[850px] mx-auto mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm p-5 sm:p-7">
        {finished ? (
          <div
            className={`rounded-xl border p-5 ${
              project.estimateStatus === "accepted"
                ? "border-green-200 bg-green-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            <div className="flex items-start gap-3">
              {project.estimateStatus === "accepted" ? (
                <CheckCircle2 className="text-green-700 shrink-0" size={24} />
              ) : (
                <XCircle className="text-red-700 shrink-0" size={24} />
              )}
              <div>
                <h2 className="font-bold text-gray-900 capitalize">
                  Estimate {project.estimateStatus}
                </h2>
                <p className="text-sm text-gray-600 mt-1">
                  Response recorded for {project.responseName || "the client"}.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Respond to this estimate
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Review the estimate, enter your name, then accept and sign or
                decline it.
              </p>
            </div>

            {responseError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {responseError}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Your full name
                </label>
                <input
                  value={responseName}
                  onChange={(event) => setResponseName(event.target.value)}
                  className="w-full min-h-11 px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  autoComplete="name"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Optional message
                </label>
                <textarea
                  rows={3}
                  value={responseMessage}
                  onChange={(event) => setResponseMessage(event.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-300 bg-white text-gray-900 text-base focus:outline-none focus:ring-2 focus:ring-green-500/30"
                  placeholder="Questions, requested changes, or notes..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Signature required to accept
                </label>
                <SignaturePad onChange={setSignature} />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                disabled={responding}
                onClick={() => void respond("declined")}
                className="inline-flex justify-center items-center gap-2 px-5 py-3 rounded-lg border border-red-200 bg-white text-red-700 font-semibold cursor-pointer disabled:opacity-60"
              >
                <XCircle size={17} /> Decline Estimate
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => void respond("accepted")}
                className="inline-flex justify-center items-center gap-2 px-5 py-3 rounded-lg bg-green-700 text-white font-semibold cursor-pointer disabled:opacity-60"
              >
                <CheckCircle2 size={17} />
                {responding ? "Saving response..." : "Accept & Sign"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
