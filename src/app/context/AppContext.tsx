import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type User as SupabaseAuthUser,
} from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { assertSafeValues } from "../lib/contentSafety";
import type {
  AccountType,
  Contact,
  ContactActivity,
  ContactType,
  EstimateJob,
  EstimateStatus,
  FollowUp,
  FollowUpChannel,
  FollowUpStatus,
  FollowUpType,
  Invoice,
  InvoiceSnapshot,
  InvoiceStatus,
  InvoicePaymentStatus,
  JobRequest,
  JobRequestStatus,
  LaborAssignment,
  LineItem,
  Project,
  ProjectContactDetails,
  ProjectPropertyDetails,
  ProjectBillingMethod,
  ProjectStatus,
  Property,
  PropertyPhoto,
  ScheduleEvent,
  ScheduleEventStatus,
  ScheduleSourceType,
  StripeConnectionStatus,
  StripeRequirementError,
  User,
  Workspace,
  WorkspaceInvite,
  WorkspaceMember,
  WorkspaceRole,
} from "../data/types";

type AppContextType = {
  user: User | null;
  authUserId: string | null;
  authLoading: boolean;

  workspaces: Workspace[];
  activeWorkspace: Workspace | null;
  activeWorkspaceId: string | null;
  role: WorkspaceRole | null;
  workspaceMembers: WorkspaceMember[];
  workspaceInvites: WorkspaceInvite[];
  workspaceLoading: boolean;
  workspaceError: string;

  projects: Project[];
  projectsLoading: boolean;
  projectsError: string;

  contacts: Contact[];
  contactsLoading: boolean;
  contactsError: string;

  properties: Property[];
  propertyPhotos: PropertyPhoto[];
  propertiesLoading: boolean;
  propertiesError: string;

  invoices: Invoice[];
  invoicesLoading: boolean;
  invoicesError: string;

  scheduleEvents: ScheduleEvent[];
  scheduleLoading: boolean;
  scheduleError: string;

  followUps: FollowUp[];
  followUpsLoading: boolean;
  followUpsError: string;

  jobRequests: JobRequest[];
  jobRequestsLoading: boolean;
  jobRequestsError: string;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  register: (user: User, password: string) => Promise<boolean>;
  updateProfile: (details: Pick<User, "name" | "company" | "phone" | "city" | "state">) => Promise<User>;

  switchWorkspace: (workspaceId: string) => Promise<void>;
  refreshWorkspaces: () => Promise<void>;
  createCompanyWorkspace: (name: string) => Promise<string>;
  createWorkgroupWorkspace: (name: string) => Promise<string>;
  createWorkspaceInvite: (
    email: string,
    role: Exclude<WorkspaceRole, "owner">,
    customCode?: string
  ) => Promise<WorkspaceInvite>;
  revokeWorkspaceInvite: (id: string) => Promise<void>;
  acceptWorkspaceInvite: (code: string) => Promise<string>;
  updateWorkspaceMember: (
    membershipId: string,
    role: Exclude<WorkspaceRole, "owner">,
    positionTitle: string,
    hourlyRate: number
  ) => Promise<void>;
  removeWorkspaceMember: (membershipId: string) => Promise<void>;
  leaveWorkspace: (workspaceId: string) => Promise<void>;
  startStripeOnboarding: () => Promise<string>;
  refreshStripeConnection: () => Promise<StripeConnectionStatus>;
  disconnectStripe: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateMyWorkspaceRate: (
    positionTitle: string,
    hourlyRate: number
  ) => Promise<void>;

  refreshProjects: () => Promise<void>;
  addProject: (project: Project) => Promise<Project>;
  updateProject: (project: Project) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  setProjectSharing: (id: string, enabled: boolean) => Promise<Project>;
  assignSelfToProject: (projectId: string) => Promise<void>;
  completeProject: (projectId: string) => Promise<string>;
  bulkDeleteProjects: (projectIds: string[]) => Promise<void>;

  refreshContacts: () => Promise<void>;
  addContact: (contact: Contact) => Promise<Contact>;
  updateContact: (contact: Contact) => Promise<Contact>;
  deleteContact: (id: string) => Promise<void>;

  refreshProperties: () => Promise<void>;
  addProperty: (property: Property) => Promise<Property>;
  updateProperty: (property: Property) => Promise<Property>;
  deleteProperty: (id: string) => Promise<void>;
  uploadPropertyPhoto: (
    propertyId: string,
    file: File,
    caption?: string
  ) => Promise<PropertyPhoto>;
  deletePropertyPhoto: (photo: PropertyPhoto) => Promise<void>;

  refreshInvoices: () => Promise<void>;
  addInvoice: (invoice: Invoice) => Promise<Invoice>;
  updateInvoice: (invoice: Invoice) => Promise<Invoice>;
  deleteInvoice: (id: string) => Promise<void>;
  setInvoiceSharing: (id: string, enabled: boolean) => Promise<Invoice>;
  completeInvoice: (id: string) => Promise<void>;
  voidInvoice: (id: string) => Promise<void>;
  markInvoicePaid: (id: string, method?: string) => Promise<void>;

  refreshSchedule: () => Promise<void>;
  addScheduleEvent: (event: ScheduleEvent) => Promise<ScheduleEvent>;
  updateScheduleEvent: (event: ScheduleEvent) => Promise<ScheduleEvent>;
  deleteScheduleEvent: (id: string) => Promise<void>;

  refreshFollowUps: () => Promise<void>;
  addFollowUp: (followUp: FollowUp) => Promise<FollowUp>;
  updateFollowUp: (followUp: FollowUp) => Promise<FollowUp>;
  deleteFollowUp: (id: string) => Promise<void>;

  refreshJobRequests: () => Promise<void>;
  addJobRequest: (request: JobRequest) => Promise<JobRequest>;
  updateJobRequest: (request: JobRequest) => Promise<JobRequest>;
  approveJobRequest: (id: string) => Promise<string>;
  declineJobRequest: (id: string, notes?: string) => Promise<void>;
  deleteJobRequest: (id: string) => Promise<void>;
};

type ProfileRow = {
  account_type: AccountType | null;
  email: string | null;
  phone: string | null;
  full_name: string | null;
  company: string | null;
  city: string | null;
  state: string | null;
};

type WorkspaceRow = {
  id: string;
  name: string;
  slug: string;
  kind: Workspace["kind"];
  is_personal: boolean;
  created_by: string;
  role: WorkspaceRole;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean | null;
  stripe_charges_enabled: boolean | null;
  stripe_payouts_enabled: boolean | null;
  stripe_currently_due: string[] | null;
  stripe_eventually_due: string[] | null;
  stripe_past_due: string[] | null;
  stripe_pending_verification: string[] | null;
  stripe_disabled_reason: string | null;
  stripe_requirement_errors: StripeRequirementError[] | null;
  stripe_future_currently_due: string[] | null;
  stripe_future_eventually_due: string[] | null;
  stripe_future_past_due: string[] | null;
  stripe_future_pending_verification: string[] | null;
  stripe_future_disabled_reason: string | null;
  stripe_status_synced_at: string | null;
  created_at: string;
};

type WorkspaceMemberRow = {
  id: string;
  workspace_id: string;
  user_id: string;
  role: WorkspaceRole;
  full_name: string;
  email: string;
  company: string;
  phone: string;
  position_title: string;
  hourly_rate: number | string;
  created_at: string;
};

type WorkspaceInviteRow = {
  id: string;
  workspace_id: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  token: string;
  code: string | null;
  status: WorkspaceInvite["status"];
  expires_at: string;
  created_at: string;
};

type ProjectRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  created_by: string | null;
  name: string;
  client: string;
  address: string;
  city: string | null;
  contact_id: string | null;
  property_id: string | null;
  status: ProjectStatus;
  estimate_status: EstimateStatus;
  estimate_number: string;
  issue_date: string;
  valid_until: string | null;
  invoice_due_date: string | null;
  project_type: string;
  job_sections: unknown;
  billing_method: ProjectBillingMethod | null;
  square_footage: number | string;
  labor_rate: number | string;
  labor_hours: number | string;
  line_items: unknown;
  estimate_summary: string | null;
  scope_description: string;
  client_notes: string;
  terms: string;
  tax_rate: number | string;
  discount_amount: number | string;
  total_estimate: number | string;
  notes: string;
  share_token: string;
  share_enabled: boolean;
  sent_at: string | null;
  viewed_at: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  declined_at: string | null;
  response_name: string;
  response_message: string;
  signature_data: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  follow_up_at: string | null;
  assigned_member_ids?: string[] | null;
  contact_details?: unknown;
  property_details?: unknown;
  created_at: string;
  updated_at: string;
};

type ProjectAssignmentRow = {
  project_id: string;
  user_id: string;
  hours: number | string;
  hourly_rate_snapshot: number | string;
};

type ContactRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact_type: ContactType;
  activity_status: ContactActivity;
  source: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

type PropertyRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  contact_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  internal_notes: string;
  client_notes: string;
  created_at: string;
  updated_at: string;
};

type PropertyPhotoRow = {
  id: string;
  user_id: string;
  workspace_id: string;
  property_id: string;
  storage_path: string;
  caption: string;
  created_at: string;
};

type InvoiceRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  project_id: string | null;
  contact_id: string | null;
  property_id: string | null;
  invoice_number: string;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  amount: number | string;
  notes: string;
  estimate_snapshot: unknown;
  share_token: string;
  share_enabled: boolean;
  sent_at: string | null;
  viewed_at: string | null;
  payment_status: InvoicePaymentStatus | null;
  payment_method: string | null;
  stripe_checkout_url: string | null;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  paid_at: string | null;
  completed_at: string | null;
  voided_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

type ScheduleEventRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  source_type: ScheduleSourceType;
  project_id: string | null;
  invoice_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  status: ScheduleEventStatus;
  auto_key: string | null;
  created_at: string;
  updated_at: string;
};

type FollowUpRow = {
  id: string;
  workspace_id: string;
  created_by: string;
  title: string;
  notes: string;
  due_at: string;
  type: FollowUpType;
  status: FollowUpStatus;
  channel: FollowUpChannel;
  contact_id: string | null;
  project_id: string | null;
  invoice_id: string | null;
  assigned_user_id: string | null;
  auto_key: string | null;
  created_at: string;
  updated_at: string;
};

type JobRequestRow = {
  id: string;
  workspace_id: string;
  requested_by: string;
  title: string;
  client: string;
  address: string;
  city: string | null;
  project_type: string | null;
  scope_description: string;
  proposed_start: string | null;
  status: JobRequestStatus;
  manager_notes: string;
  created_project_id: string | null;
  created_at: string;
  updated_at: string;
};

async function edgeFunctionErrorMessage(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    const response = error.context;

    try {
      const payload = (await response.clone().json()) as Record<string, unknown>;
      const message = payload.error ?? payload.message;
      if (typeof message === "string" && message.trim()) return message;
    } catch {
      try {
        const message = await response.clone().text();
        if (message.trim()) return message;
      } catch {
        // Fall through to the status-based message below.
      }
    }

    return `The payment service returned HTTP ${response.status}.`;
  }

  if (error instanceof FunctionsRelayError) {
    return `Supabase could not relay the payment request: ${error.message}`;
  }

  if (error instanceof FunctionsFetchError) {
    return `The browser could not reach the payment service: ${error.message}`;
  }

  return error instanceof Error
    ? error.message
    : "The payment service returned an unknown error.";
}

const AppContext = createContext<AppContextType | null>(null);

function userFromAuth(authUser: SupabaseAuthUser): User {
  const metadata = authUser.user_metadata ?? {};
  return {
    id: authUser.id,
    accountType: metadata.account_type === "client" ? "client" : "landscaper",
    name:
      metadata.full_name ??
      metadata.name ??
      authUser.email?.split("@")[0] ??
      "YardPilot User",
    email: authUser.email ?? "",
    company: metadata.company ?? "",
    phone: metadata.phone ?? authUser.phone ?? "",
    city: metadata.city ?? "",
    state: metadata.state ?? "",
  };
}

function userFromProfile(
  authUser: SupabaseAuthUser,
  profile: ProfileRow
): User {
  const fallback = userFromAuth(authUser);
  return {
    id: authUser.id,
    accountType: profile.account_type === "client" ? "client" : "landscaper",
    name: profile.full_name || fallback.name,
    email: profile.email || fallback.email,
    company: profile.company || fallback.company,
    phone: profile.phone || fallback.phone,
    city: profile.city || fallback.city,
    state: profile.state || fallback.state,
  };
}

function normalizeLineItems(value: unknown): LineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const candidate =
      typeof item === "object" && item !== null
        ? (item as Partial<LineItem>)
        : {};
    return {
      id:
        typeof candidate.id === "string"
          ? candidate.id
          : `line-${index}`,
      description:
        typeof candidate.description === "string"
          ? candidate.description
          : "",
      qty: Number(candidate.qty ?? 0),
      unit:
        typeof candidate.unit === "string" ? candidate.unit : "each",
      itemType:
        candidate.itemType === "fuel" ||
        candidate.itemType === "service" ||
        candidate.itemType === "material"
          ? candidate.itemType
          : "material",
      unitCost: Number(candidate.unitCost ?? 0),
    };
  });
}

function normalizeLaborAssignments(value: unknown): LaborAssignment[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const candidate =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    return {
      userId: String(candidate.userId ?? candidate.user_id ?? ""),
      name: String(candidate.name ?? "Team member"),
      hours: Number(candidate.hours ?? 0),
      hourlyRate: Number(candidate.hourlyRate ?? candidate.hourly_rate ?? 0),
    };
  });
}

function normalizeJobSections(value: unknown): EstimateJob[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const candidate =
      typeof item === "object" && item !== null
        ? (item as Record<string, unknown>)
        : {};
    return {
      id: String(candidate.id ?? `job-${index + 1}`),
      title: String(candidate.title ?? `Job ${index + 1}`),
      projectType: String(candidate.projectType ?? candidate.project_type ?? ""),
      scopeDescription: String(
        candidate.scopeDescription ?? candidate.scope_description ?? ""
      ),
      internalNotes: String(
        candidate.internalNotes ?? candidate.internal_notes ?? ""
      ),
      squareFootage: Number(
        candidate.squareFootage ?? candidate.square_footage ?? 0
      ),
      pricePerSquareFoot: Number(
        candidate.pricePerSquareFoot ?? candidate.price_per_square_foot ?? 0
      ),
      scheduledStart:
        typeof (candidate.scheduledStart ?? candidate.scheduled_start) === "string"
          ? String(candidate.scheduledStart ?? candidate.scheduled_start)
          : null,
      scheduledEnd:
        typeof (candidate.scheduledEnd ?? candidate.scheduled_end) === "string"
          ? String(candidate.scheduledEnd ?? candidate.scheduled_end)
          : null,
      laborRate: Number(candidate.laborRate ?? candidate.labor_rate ?? 0),
      laborHours: Number(candidate.laborHours ?? candidate.labor_hours ?? 0),
      laborAssignments: normalizeLaborAssignments(
        candidate.laborAssignments ?? candidate.labor_assignments
      ),
      lineItems: normalizeLineItems(candidate.lineItems ?? candidate.line_items),
      photoIds: Array.isArray(candidate.photoIds ?? candidate.photo_ids)
        ? ((candidate.photoIds ?? candidate.photo_ids) as unknown[]).map(String)
        : [],
    };
  });
}

function rowToWorkspace(row: WorkspaceRow): Workspace {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    kind: row.kind,
    isPersonal: Boolean(row.is_personal),
    createdBy: row.created_by,
    role: row.role,
    stripeAccountId: row.stripe_account_id ?? null,
    stripeOnboardingComplete: Boolean(row.stripe_onboarding_complete),
    stripeChargesEnabled: Boolean(row.stripe_charges_enabled),
    stripePayoutsEnabled: Boolean(row.stripe_payouts_enabled),
    stripeCurrentlyDue: row.stripe_currently_due ?? [],
    stripeEventuallyDue: row.stripe_eventually_due ?? [],
    stripePastDue: row.stripe_past_due ?? [],
    stripePendingVerification: row.stripe_pending_verification ?? [],
    stripeDisabledReason: row.stripe_disabled_reason ?? null,
    stripeRequirementErrors: row.stripe_requirement_errors ?? [],
    stripeFutureCurrentlyDue: row.stripe_future_currently_due ?? [],
    stripeFutureEventuallyDue: row.stripe_future_eventually_due ?? [],
    stripeFuturePastDue: row.stripe_future_past_due ?? [],
    stripeFuturePendingVerification:
      row.stripe_future_pending_verification ?? [],
    stripeFutureDisabledReason: row.stripe_future_disabled_reason ?? null,
    stripeStatusSyncedAt: row.stripe_status_synced_at ?? null,
    createdAt: row.created_at,
  };
}

function rowToWorkspaceMember(row: WorkspaceMemberRow): WorkspaceMember {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    role: row.role,
    name: row.full_name || row.email.split("@")[0] || "Team member",
    email: row.email,
    company: row.company,
    phone: row.phone,
    positionTitle: row.position_title ?? "",
    hourlyRate: Number(row.hourly_rate ?? 0),
    createdAt: row.created_at,
  };
}

function rowToWorkspaceInvite(row: WorkspaceInviteRow): WorkspaceInvite {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    email: row.email,
    role: row.role,
    token: row.token,
    code: row.code || row.token.slice(0, 8).toUpperCase(),
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function normalizeContactDetails(value: unknown): ProjectContactDetails | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  return {
    id,
    name: String(row.name ?? ""),
    email: String(row.email ?? ""),
    phone: String(row.phone ?? ""),
    address: String(row.address ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    notes: String(row.notes ?? ""),
  };
}

function normalizePropertyDetails(value: unknown): ProjectPropertyDetails | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "");
  if (!id) return null;
  return {
    id,
    name: String(row.name ?? ""),
    address: String(row.address ?? ""),
    city: String(row.city ?? ""),
    state: String(row.state ?? ""),
    zip: String(row.zip ?? ""),
    description: String(row.description ?? ""),
    internalNotes: String(row.internalNotes ?? row.internal_notes ?? ""),
    clientNotes: String(row.clientNotes ?? row.client_notes ?? ""),
  };
}

function contactDetailsFromContact(contact: Contact | undefined): ProjectContactDetails | null {
  return contact
    ? { id: contact.id, name: contact.name, email: contact.email, phone: contact.phone, address: contact.address, city: contact.city, state: contact.state, zip: contact.zip, notes: contact.notes }
    : null;
}

function propertyDetailsFromProperty(property: Property | undefined): ProjectPropertyDetails | null {
  return property
    ? { id: property.id, name: property.name, address: property.address, city: property.city, state: property.state, zip: property.zip, description: property.description, internalNotes: property.internalNotes, clientNotes: property.clientNotes }
    : null;
}

function enrichProjectOperationalDetails(project: Project, contacts: Contact[], properties: Property[]): Project {
  return {
    ...project,
    contactDetails:
      project.contactDetails ?? contactDetailsFromContact(contacts.find((item) => item.id === project.contactId)),
    propertyDetails:
      project.propertyDetails ?? propertyDetailsFromProperty(properties.find((item) => item.id === project.propertyId)),
  };
}

function rowToProject(
  row: ProjectRow,
  laborAssignments: LaborAssignment[] = (row.assigned_member_ids ?? []).map(
    (userId) => ({ userId, name: "Team member", hours: 0, hourlyRate: 0 })
  )
): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by ?? row.user_id,
    name: row.name,
    client: row.client,
    address: row.address,
    city: row.city ?? "",
    contactId: row.contact_id,
    propertyId: row.property_id,
    contactDetails: normalizeContactDetails(row.contact_details),
    propertyDetails: normalizePropertyDetails(row.property_details),
    status: row.status,
    estimateStatus: row.estimate_status ?? "draft",
    estimateNumber: row.estimate_number ?? `EST-${row.id.slice(0, 8)}`,
    issueDate: row.issue_date ?? row.created_at.slice(0, 10),
    validUntil: row.valid_until,
    invoiceDueDate: row.invoice_due_date ?? null,
    projectType: row.project_type,
    jobSections: normalizeJobSections(row.job_sections),
    billingMethod: row.billing_method ?? "fixed",
    squareFootage: Number(row.square_footage),
    laborRate: Number(row.labor_rate),
    laborHours: Number(row.labor_hours),
    laborAssignments,
    lineItems: normalizeLineItems(row.line_items),
    aiEstimate: row.estimate_summary,
    scopeDescription: row.scope_description ?? "",
    clientNotes: row.client_notes ?? "",
    terms: row.terms ?? "",
    taxRate: Number(row.tax_rate ?? 0),
    discountAmount: Number(row.discount_amount ?? 0),
    totalEstimate: Number(row.total_estimate ?? 0),
    notes: row.notes ?? "",
    shareToken: row.share_token,
    shareEnabled: Boolean(row.share_enabled),
    sentAt: row.sent_at ?? null,
    viewedAt: row.viewed_at ?? null,
    respondedAt: row.responded_at ?? null,
    acceptedAt: row.accepted_at ?? null,
    declinedAt: row.declined_at ?? null,
    responseName: row.response_name ?? "",
    responseMessage: row.response_message ?? "",
    signatureData: row.signature_data ?? "",
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    followUpAt: row.follow_up_at,
    assignedMemberIds: laborAssignments.map((assignment) => assignment.userId),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    contactType: row.contact_type,
    activityStatus: row.activity_status,
    source: row.source,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToProperty(row: PropertyRow): Property {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    contactId: row.contact_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    zip: row.zip,
    description: row.description,
    internalNotes: row.internal_notes,
    clientNotes: row.client_notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function rowToPropertyPhoto(
  row: PropertyPhotoRow
): Promise<PropertyPhoto> {
  const { data, error } = await supabase.storage
    .from("property-photos")
    .createSignedUrl(row.storage_path, 60 * 60);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    propertyId: row.property_id,
    storagePath: row.storage_path,
    caption: row.caption,
    url: error ? "" : data.signedUrl,
    createdAt: row.created_at,
  };
}

function normalizeInvoiceSnapshot(value: unknown): InvoiceSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  return {
    estimateNumber: String(candidate.estimate_number ?? candidate.estimateNumber ?? ""),
    name: String(candidate.name ?? ""),
    client: String(candidate.client ?? ""),
    address: String(candidate.address ?? ""),
    city: String(candidate.city ?? ""),
    projectType: String(candidate.project_type ?? candidate.projectType ?? ""),
    jobSections: normalizeJobSections(
      candidate.job_sections ?? candidate.jobSections
    ),
    billingMethod: (candidate.billing_method ?? candidate.billingMethod) === "hourly" ? "hourly" : "fixed",
    lineItems: normalizeLineItems(candidate.line_items ?? candidate.lineItems),
    laborAssignments: Array.isArray(candidate.labor_assignments ?? candidate.laborAssignments)
      ? ((candidate.labor_assignments ?? candidate.laborAssignments) as Array<Record<string, unknown>>).map((item) => ({
          userId: String(item.user_id ?? item.userId ?? ""),
          name: String(item.name ?? "Team member"),
          hours: Number(item.hours ?? 0),
          hourlyRate: Number(item.hourly_rate ?? item.hourlyRate ?? 0),
        }))
      : [],
    laborHours: Number(candidate.labor_hours ?? candidate.laborHours ?? 0),
    laborRate: Number(candidate.labor_rate ?? candidate.laborRate ?? 0),
    aiEstimate:
      typeof (candidate.estimate_summary ?? candidate.aiEstimate) === "string"
        ? String(candidate.estimate_summary ?? candidate.aiEstimate)
        : null,
    scopeDescription: String(candidate.scope_description ?? candidate.scopeDescription ?? ""),
    clientNotes: String(candidate.client_notes ?? candidate.clientNotes ?? ""),
    terms: String(candidate.terms ?? ""),
    taxRate: Number(candidate.tax_rate ?? candidate.taxRate ?? 0),
    discountAmount: Number(candidate.discount_amount ?? candidate.discountAmount ?? 0),
    totalEstimate: Number(candidate.total_estimate ?? candidate.totalEstimate ?? 0),
    responseName: String(candidate.response_name ?? candidate.responseName ?? ""),
    signatureData: String(candidate.signature_data ?? candidate.signatureData ?? ""),
    acceptedAt:
      typeof (candidate.accepted_at ?? candidate.acceptedAt) === "string"
        ? String(candidate.accepted_at ?? candidate.acceptedAt)
        : null,
  };
}

function rowToInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    projectId: row.project_id,
    contactId: row.contact_id,
    propertyId: row.property_id,
    invoiceNumber: row.invoice_number,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    status: row.status,
    amount: Number(row.amount),
    notes: row.notes,
    estimateSnapshot: normalizeInvoiceSnapshot(row.estimate_snapshot),
    shareToken: row.share_token,
    shareEnabled: Boolean(row.share_enabled),
    sentAt: row.sent_at,
    viewedAt: row.viewed_at,
    paymentStatus: row.payment_status ?? (row.status === "paid" ? "paid" : "unpaid"),
    paymentMethod: row.payment_method ?? "",
    stripeCheckoutUrl: row.stripe_checkout_url ?? null,
    stripeCheckoutSessionId: row.stripe_checkout_session_id ?? null,
    stripePaymentIntentId: row.stripe_payment_intent_id ?? null,
    paidAt: row.paid_at ?? null,
    completedAt: row.completed_at ?? null,
    voidedAt: row.voided_at ?? null,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToScheduleEvent(row: ScheduleEventRow): ScheduleEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    title: row.title,
    description: row.description,
    startAt: row.start_at,
    endAt: row.end_at,
    allDay: row.all_day,
    sourceType: row.source_type,
    projectId: row.project_id,
    invoiceId: row.invoice_id,
    contactId: row.contact_id,
    assignedUserId: row.assigned_user_id,
    status: row.status,
    autoKey: row.auto_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToFollowUp(row: FollowUpRow): FollowUp {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    createdBy: row.created_by,
    title: row.title,
    notes: row.notes,
    dueAt: row.due_at,
    type: row.type,
    status: row.status,
    channel: row.channel,
    contactId: row.contact_id,
    projectId: row.project_id,
    invoiceId: row.invoice_id,
    assignedUserId: row.assigned_user_id,
    autoKey: row.auto_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToJobRequest(
  row: JobRequestRow,
  members: WorkspaceMember[]
): JobRequest {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    requestedBy: row.requested_by,
    requestedByName:
      members.find((member) => member.userId === row.requested_by)?.name ??
      "Team member",
    title: row.title,
    client: row.client,
    address: row.address,
    city: row.city ?? "",
    projectType: row.project_type ?? "Other job type",
    scopeDescription: row.scope_description,
    proposedStart: row.proposed_start,
    status: row.status,
    managerNotes: row.manager_notes,
    createdProjectId: row.created_project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getFileExtension(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension && /^[a-z0-9]+$/.test(extension)) return extension;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "jpg";
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(
    null
  );
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>(
    []
  );
  const [workspaceInvites, setWorkspaceInvites] = useState<WorkspaceInvite[]>(
    []
  );
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState("");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [contactsError, setContactsError] = useState("");

  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyPhotos, setPropertyPhotos] = useState<PropertyPhoto[]>([]);
  const [propertiesLoading, setPropertiesLoading] = useState(false);
  const [propertiesError, setPropertiesError] = useState("");

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesError, setInvoicesError] = useState("");

  const [scheduleEvents, setScheduleEvents] = useState<ScheduleEvent[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleError, setScheduleError] = useState("");

  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [followUpsLoading, setFollowUpsLoading] = useState(false);
  const [followUpsError, setFollowUpsError] = useState("");

  const [jobRequests, setJobRequests] = useState<JobRequest[]>([]);
  const [jobRequestsLoading, setJobRequestsLoading] = useState(false);
  const [jobRequestsError, setJobRequestsError] = useState("");

  const authUserIdRef = useRef<string | null>(null);
  const activeWorkspaceIdRef = useRef<string | null>(null);
  const workspaceRequestRef = useRef(0);

  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const role = activeWorkspace?.role ?? null;

  function clearWorkspaceData() {
    setWorkspaceMembers([]);
    setWorkspaceInvites([]);
    setProjects([]);
    setContacts([]);
    setProperties([]);
    setPropertyPhotos([]);
    setInvoices([]);
    setScheduleEvents([]);
    setFollowUps([]);
    setJobRequests([]);
    setProjectsError("");
    setContactsError("");
    setPropertiesError("");
    setInvoicesError("");
    setScheduleError("");
    setFollowUpsError("");
    setJobRequestsError("");
  }

  function clearAccount() {
    workspaceRequestRef.current += 1;
    authUserIdRef.current = null;
    activeWorkspaceIdRef.current = null;
    setAuthUserId(null);
    setUser(null);
    setWorkspaces([]);
    setActiveWorkspaceId(null);
    clearWorkspaceData();
    setAuthLoading(false);
    setWorkspaceLoading(false);
    localStorage.removeItem("ls_projects");
    localStorage.removeItem("ls_user");
    localStorage.removeItem("ls_registered");
  }

  function currentWorkspaceOrThrow() {
    const workspaceId = activeWorkspaceIdRef.current;
    if (!workspaceId) throw new Error("Choose a workspace first.");
    return workspaceId;
  }

  function currentUserOrThrow() {
    const userId = authUserIdRef.current;
    if (!userId) throw new Error("You must be signed in.");
    return userId;
  }

  function ensureManager() {
    if (role !== "owner" && role !== "co_owner" && role !== "manager") {
      throw new Error("Only an owner, co-owner, or manager can do that.");
    }
  }

  function ensureAdmin() {
    if (role !== "owner" && role !== "co_owner") {
      throw new Error("Only an owner or co-owner can manage payment settings.");
    }
  }

  async function loadProfile(authUser: SupabaseAuthUser) {
    const { data, error } = await supabase
      .from("profiles")
      .select("email, phone, full_name, company, city, state, account_type")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) {
      console.error("Could not load profile:", error.message);
      setUser(userFromAuth(authUser));
      return;
    }

    setUser(data ? userFromProfile(authUser, data as ProfileRow) : userFromAuth(authUser));
  }

  async function fetchWorkspaces(): Promise<Workspace[]> {
    const { data, error } = await supabase.rpc("get_my_workspaces");
    if (error) throw new Error(error.message);
    return ((data ?? []) as WorkspaceRow[]).map(rowToWorkspace);
  }

  async function loadMembers(workspaceId: string): Promise<WorkspaceMember[]> {
    const { data, error } = await supabase.rpc("get_workspace_members", {
      requested_workspace_id: workspaceId,
    });
    if (error) throw new Error(error.message);
    return ((data ?? []) as WorkspaceMemberRow[]).map(rowToWorkspaceMember);
  }

  async function loadWorkspaceBundle(
    workspaceId: string,
    workspaceRole: WorkspaceRole
  ) {
    const requestId = ++workspaceRequestRef.current;
    setWorkspaceLoading(true);
    setWorkspaceError("");
    setProjectsLoading(true);
    setContactsLoading(workspaceRole !== "employee");
    setPropertiesLoading(workspaceRole !== "employee");
    setInvoicesLoading(workspaceRole !== "employee");
    setScheduleLoading(true);
    setFollowUpsLoading(true);
    setJobRequestsLoading(true);
    clearWorkspaceData();

    try {
      const members = await loadMembers(workspaceId);
      if (requestId !== workspaceRequestRef.current) return;
      setWorkspaceMembers(members);

      const manager = workspaceRole !== "employee";

      const projectPromise = manager
        ? Promise.all([
            supabase
              .from("projects")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("updated_at", { ascending: false }),
            supabase.rpc("get_project_labor_assignments", {
              requested_workspace_id: workspaceId,
            }),
          ])
        : Promise.all([
            supabase.rpc("get_employee_projects", {
              requested_workspace_id: workspaceId,
            }),
            supabase.rpc("get_employee_project_operational_details", {
              requested_workspace_id: workspaceId,
            }),
          ]);

      const [
        projectResult,
        contactResult,
        propertyResult,
        photoResult,
        invoiceResult,
        scheduleResult,
        followUpResult,
        requestResult,
        inviteResult,
      ] = await Promise.all([
        projectPromise,
        manager
          ? supabase
              .from("contacts")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        manager
          ? supabase
              .from("properties")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("property_photos")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: true }),
        manager
          ? supabase
              .from("invoices")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("due_date", { ascending: true })
          : Promise.resolve({ data: [], error: null }),
        supabase
          .from("schedule_events")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("start_at", { ascending: true }),
        supabase
          .from("follow_ups")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("due_at", { ascending: true }),
        supabase
          .from("job_requests")
          .select("*")
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false }),
        manager
          ? supabase
              .from("workspace_invites")
              .select("*")
              .eq("workspace_id", workspaceId)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (requestId !== workspaceRequestRef.current) return;

      const loadedContacts = contactResult.error
        ? []
        : ((contactResult.data ?? []) as ContactRow[]).map(rowToContact);
      const loadedProperties = propertyResult.error
        ? []
        : ((propertyResult.data ?? []) as PropertyRow[]).map(rowToProperty);

      if (manager) {
        const [projectsQuery, assignmentsQuery] = projectResult as [
          { data: unknown[] | null; error: { message: string } | null },
          { data: unknown[] | null; error: { message: string } | null }
        ];
        if (projectsQuery.error) throw new Error(projectsQuery.error.message);
        if (assignmentsQuery.error) throw new Error(assignmentsQuery.error.message);
        const assignmentMap = new Map<string, LaborAssignment[]>();
        for (const row of assignmentsQuery.data ?? []) {
          const candidate = row as ProjectAssignmentRow;
          const member = members.find((item) => item.userId === candidate.user_id);
          assignmentMap.set(candidate.project_id, [
            ...(assignmentMap.get(candidate.project_id) ?? []),
            {
              userId: candidate.user_id,
              name: member?.name ?? "Team member",
              hours: Number(candidate.hours ?? 0),
              hourlyRate: Number(candidate.hourly_rate_snapshot ?? member?.hourlyRate ?? 0),
            },
          ]);
        }
        setProjects(
          ((projectsQuery.data ?? []) as ProjectRow[]).map((row) =>
            enrichProjectOperationalDetails(
              rowToProject(row, assignmentMap.get(row.id) ?? []),
              loadedContacts,
              loadedProperties
            )
          )
        );
      } else {
        const [employeeResult, operationalResult] = projectResult as [
          { data: unknown[] | null; error: { message: string } | null },
          { data: unknown[] | null; error: { message: string } | null }
        ];
        if (employeeResult.error) throw new Error(employeeResult.error.message);
        if (operationalResult.error) throw new Error(operationalResult.error.message);
        const operationalMap = new Map(
          ((operationalResult.data ?? []) as Array<Record<string, unknown>>).map(
            (row) => [String(row.project_id ?? ""), row] as const
          )
        );
        setProjects(
          ((employeeResult.data ?? []) as ProjectRow[]).map((row) => {
            const details = operationalMap.get(row.id);
            return rowToProject({
              ...row,
              contact_details: details?.contact_details,
              property_details: details?.property_details,
            });
          })
        );
      }

      if (contactResult.error) setContactsError(contactResult.error.message);
      else setContacts(loadedContacts);

      if (propertyResult.error) setPropertiesError(propertyResult.error.message);
      else setProperties(loadedProperties);

      if (photoResult.error) {
        setPropertiesError(photoResult.error.message);
      } else {
        const loadedPhotos = await Promise.all(
          ((photoResult.data ?? []) as PropertyPhotoRow[]).map(rowToPropertyPhoto)
        );
        if (requestId !== workspaceRequestRef.current) return;
        setPropertyPhotos(loadedPhotos);
      }

      if (invoiceResult.error) setInvoicesError(invoiceResult.error.message);
      else setInvoices(((invoiceResult.data ?? []) as InvoiceRow[]).map(rowToInvoice));

      if (scheduleResult.error) setScheduleError(scheduleResult.error.message);
      else
        setScheduleEvents(
          ((scheduleResult.data ?? []) as ScheduleEventRow[]).map(rowToScheduleEvent)
        );

      if (followUpResult.error) setFollowUpsError(followUpResult.error.message);
      else setFollowUps(((followUpResult.data ?? []) as FollowUpRow[]).map(rowToFollowUp));

      if (requestResult.error) setJobRequestsError(requestResult.error.message);
      else
        setJobRequests(
          ((requestResult.data ?? []) as JobRequestRow[]).map((row) =>
            rowToJobRequest(row, members)
          )
        );

      if (inviteResult.error) setWorkspaceError(inviteResult.error.message);
      else
        setWorkspaceInvites(
          ((inviteResult.data ?? []) as WorkspaceInviteRow[]).map(rowToWorkspaceInvite)
        );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not load workspace.";
      setWorkspaceError(message);
      setProjectsError(message);
    } finally {
      if (requestId === workspaceRequestRef.current) {
        setWorkspaceLoading(false);
        setProjectsLoading(false);
        setContactsLoading(false);
        setPropertiesLoading(false);
        setInvoicesLoading(false);
        setScheduleLoading(false);
        setFollowUpsLoading(false);
        setJobRequestsLoading(false);
      }
    }
  }

  async function loadAccount(authUser: SupabaseAuthUser) {
    setAuthLoading(true);
    authUserIdRef.current = authUser.id;
    setAuthUserId(authUser.id);
    setUser(userFromAuth(authUser));
    await loadProfile(authUser);

    try {
      const loadedWorkspaces = await fetchWorkspaces();
      setWorkspaces(loadedWorkspaces);
      const saved = localStorage.getItem("yardpilot-workspace");
      const selected =
        loadedWorkspaces.find((workspace) => workspace.id === saved) ??
        loadedWorkspaces[0] ??
        null;

      if (selected) {
        activeWorkspaceIdRef.current = selected.id;
        setActiveWorkspaceId(selected.id);
        localStorage.setItem("yardpilot-workspace", selected.id);
        await loadWorkspaceBundle(selected.id, selected.role);
      } else {
        setWorkspaceError("No YardPilot workspace was found for this account.");
      }
    } catch (error) {
      setWorkspaceError(
        error instanceof Error ? error.message : "Could not load workspaces."
      );
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        clearAccount();
        return;
      }
      if (session?.user) await loadAccount(session.user);
      else clearAccount();
    }

    void initializeAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        clearAccount();
        return;
      }
      if (
        event === "INITIAL_SESSION" ||
        event === "SIGNED_IN" ||
        event === "USER_UPDATED"
      ) {
        window.setTimeout(() => {
          if (mounted) void loadAccount(session.user);
        }, 0);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!activeWorkspaceId || role === "employee") return;

    const channel = supabase
      .channel(`yardpilot-projects-${activeWorkspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "projects",
          filter: `workspace_id=eq.${activeWorkspaceId}`,
        },
        () => {
          window.setTimeout(() => {
            void refreshCurrentBundle();
          }, 0);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `workspace_id=eq.${activeWorkspaceId}`,
        },
        () => {
          window.setTimeout(() => {
            void refreshCurrentBundle();
          }, 0);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [activeWorkspaceId, role]);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    return !error;
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    clearAccount();
  }

  async function register(newUser: User, password: string) {
    const { error } = await supabase.auth.signUp({
      email: newUser.email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=true`,
        data: {
          full_name: newUser.name,
          company: newUser.company,
          phone: newUser.phone,
          account_type: newUser.accountType,
        },
      },
    });
    return !error;
  }

  async function updateProfile(
    details: Pick<User, "name" | "company" | "phone" | "city" | "state">
  ): Promise<User> {
    assertSafeValues([
      { value: details.name, label: "Profile name" },
      { value: details.company, label: "Business name" },
    ]);
    const { data, error } = await supabase.rpc("update_my_profile", {
      requested_full_name: details.name.trim(),
      requested_phone: details.phone.trim(),
      requested_company: details.company.trim(),
      requested_city: details.city.trim(),
      requested_state: details.state.trim(),
    });
    if (error) throw new Error(error.message);
    const row = (data ?? {}) as Record<string, unknown>;
    const updated: User = {
      accountType: user?.accountType ?? "landscaper",
      id: authUserIdRef.current ?? user?.id,
      name: String(row.full_name ?? details.name.trim()),
      email: user?.email ?? "",
      company: String(row.company ?? details.company.trim()),
      phone: String(row.phone ?? details.phone.trim()),
      city: String(row.city ?? details.city.trim()),
      state: String(row.state ?? details.state.trim()),
    };
    setUser(updated);
    await supabase.auth.updateUser({
      data: {
        full_name: updated.name,
        company: updated.company,
        phone: updated.phone,
        city: updated.city,
        state: updated.state,
        account_type: updated.accountType,
      },
    });
    return updated;
  }

  async function refreshWorkspaces() {
    const loaded = await fetchWorkspaces();
    setWorkspaces(loaded);
  }

  async function createCompanyWorkspace(name: string) {
    assertSafeValues([{ value: name, label: "Company name" }]);
    const { data, error } = await supabase.rpc("create_company_workspace", {
      requested_name: name.trim(),
    });
    if (error) throw new Error(error.message);
    const workspaceId = String(data);
    const loaded = await fetchWorkspaces();
    setWorkspaces(loaded);
    const created = loaded.find((workspace) => workspace.id === workspaceId);
    if (created) {
      activeWorkspaceIdRef.current = created.id;
      setActiveWorkspaceId(created.id);
      localStorage.setItem("yardpilot-workspace", created.id);
      await loadWorkspaceBundle(created.id, created.role);
    }
    return workspaceId;
  }

  async function createWorkgroupWorkspace(name: string) {
    assertSafeValues([{ value: name, label: "Workgroup name" }]);
    const { data, error } = await supabase.rpc("create_workgroup_workspace", {
      requested_name: name.trim(),
    });
    if (error) throw new Error(error.message);
    const workspaceId = String(data);
    const loaded = await fetchWorkspaces();
    setWorkspaces(loaded);
    const created = loaded.find((workspace) => workspace.id === workspaceId);
    if (created) {
      activeWorkspaceIdRef.current = created.id;
      setActiveWorkspaceId(created.id);
      localStorage.setItem("yardpilot-workspace", created.id);
      await loadWorkspaceBundle(created.id, created.role);
    }
    return workspaceId;
  }

  async function switchWorkspace(workspaceId: string) {
    const workspace = workspaces.find((item) => item.id === workspaceId);
    if (!workspace) throw new Error("Workspace not found.");
    activeWorkspaceIdRef.current = workspaceId;
    setActiveWorkspaceId(workspaceId);
    localStorage.setItem("yardpilot-workspace", workspaceId);
    await loadWorkspaceBundle(workspaceId, workspace.role);
  }

  async function refreshCurrentBundle() {
    const workspace = workspaces.find(
      (item) => item.id === activeWorkspaceIdRef.current
    );
    if (workspace) await loadWorkspaceBundle(workspace.id, workspace.role);
  }

  async function createWorkspaceInvite(
    email: string,
    inviteRole: Exclude<WorkspaceRole, "owner">,
    customCode = ""
  ) {
    ensureManager();
    const workspaceId = currentWorkspaceOrThrow();
    const userId = currentUserOrThrow();
    const cleanedEmail = email.trim().toLowerCase();
    if (!cleanedEmail) throw new Error("Enter an email address.");
    if (cleanedEmail === user?.email.trim().toLowerCase()) {
      throw new Error("You are already a member of this workspace and cannot invite yourself.");
    }
    if (workspaceMembers.some((member) => member.email.trim().toLowerCase() === cleanedEmail)) {
      throw new Error("That email already belongs to a member of this workspace.");
    }
    const insertValues: Record<string, unknown> = {
      workspace_id: workspaceId,
      email: cleanedEmail,
      role: inviteRole,
      invited_by: userId,
    };
    const cleanedCode = customCode.trim().toUpperCase();
    if (cleanedCode) insertValues.code = cleanedCode;

    const { data, error } = await supabase
      .from("workspace_invites")
      .insert(insertValues)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const invite = rowToWorkspaceInvite(data as WorkspaceInviteRow);
    setWorkspaceInvites((previous) => [invite, ...previous]);
    return invite;
  }

  async function revokeWorkspaceInvite(id: string) {
    ensureManager();
    const workspaceId = currentWorkspaceOrThrow();
    const { error } = await supabase
      .from("workspace_invites")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("workspace_id", workspaceId);
    if (error) throw new Error(error.message);
    setWorkspaceInvites((previous) =>
      previous.map((invite) =>
        invite.id === id ? { ...invite, status: "revoked" } : invite
      )
    );
  }

  async function acceptWorkspaceInvite(code: string) {
    const { data, error } = await supabase.rpc("accept_workspace_invite", {
      invite_code: code.trim(),
    });
    if (error) throw new Error(error.message);
    const workspaceId = String(data);
    const loaded = await fetchWorkspaces();
    setWorkspaces(loaded);
    const joined = loaded.find((workspace) => workspace.id === workspaceId);
    if (joined) {
      activeWorkspaceIdRef.current = joined.id;
      setActiveWorkspaceId(joined.id);
      localStorage.setItem("yardpilot-workspace", joined.id);
      await loadWorkspaceBundle(joined.id, joined.role);
    }
    return workspaceId;
  }

  async function updateWorkspaceMember(
    membershipId: string,
    memberRole: Exclude<WorkspaceRole, "owner">,
    positionTitle: string,
    hourlyRate: number
  ) {
    ensureManager();
    const { error } = await supabase.rpc("update_workspace_member", {
      requested_membership_id: membershipId,
      requested_role: memberRole,
      requested_position_title: positionTitle.trim(),
      requested_hourly_rate: Math.max(0, Number(hourlyRate) || 0),
    });
    if (error) throw new Error(error.message);
    setWorkspaceMembers((previous) =>
      previous.map((member) =>
        member.id === membershipId
          ? {
              ...member,
              role: memberRole,
              positionTitle: positionTitle.trim(),
              hourlyRate: Math.max(0, Number(hourlyRate) || 0),
            }
          : member
      )
    );
  }

  async function updateMyWorkspaceRate(
    positionTitle: string,
    hourlyRate: number
  ) {
    const workspaceId = currentWorkspaceOrThrow();
    const { error } = await supabase.rpc("update_my_workspace_rate", {
      requested_workspace_id: workspaceId,
      requested_position_title: positionTitle.trim(),
      requested_hourly_rate: Math.max(0, Number(hourlyRate) || 0),
    });
    if (error) throw new Error(error.message);
    const userId = currentUserOrThrow();
    setWorkspaceMembers((previous) =>
      previous.map((member) =>
        member.userId === userId
          ? {
              ...member,
              positionTitle: positionTitle.trim(),
              hourlyRate: Math.max(0, Number(hourlyRate) || 0),
            }
          : member
      )
    );
  }

  async function removeWorkspaceMember(membershipId: string) {
    ensureManager();
    const { error } = await supabase.rpc("remove_workspace_member", {
      requested_membership_id: membershipId,
    });
    if (error) throw new Error(error.message);
    setWorkspaceMembers((previous) =>
      previous.filter((member) => member.id !== membershipId)
    );
  }

  async function leaveWorkspace(workspaceId: string) {
    const { error } = await supabase.rpc("leave_workspace", {
      requested_workspace_id: workspaceId,
    });
    if (error) throw new Error(error.message);

    const remaining = workspaces.filter((workspace) => workspace.id !== workspaceId);
    setWorkspaces(remaining);
    const next = remaining.find((workspace) => workspace.isPersonal) ?? remaining[0] ?? null;
    if (next) {
      await switchWorkspace(next.id);
    } else {
      setActiveWorkspaceId(null);
      clearWorkspaceData();
    }
  }

  async function startStripeOnboarding() {
    ensureAdmin();

    const { data, error } = await supabase.functions.invoke(
      "stripe-connect-account",
      {
        body: {
          workspaceId: currentWorkspaceOrThrow(),
          action: "onboard",
          returnUrl: `${window.location.origin}/app/account?stripe=return`,
          refreshUrl: `${window.location.origin}/app/account?stripe=refresh`,
        },
      }
    );

    if (error) {
      throw new Error(await edgeFunctionErrorMessage(error));
    }

    if (typeof data?.error === "string" && data.error.trim()) {
      throw new Error(data.error);
    }

    const url = typeof data?.url === "string" ? data.url : "";
    if (!url) throw new Error("Stripe did not return an onboarding link.");
    return url;
  }

  async function refreshStripeConnection(): Promise<StripeConnectionStatus> {
    ensureAdmin();

    const { data, error } = await supabase.functions.invoke(
      "stripe-connect-account",
      {
        body: {
          workspaceId: currentWorkspaceOrThrow(),
          action: "status",
        },
      }
    );

    if (error) {
      throw new Error(await edgeFunctionErrorMessage(error));
    }

    if (typeof data?.error === "string" && data.error.trim()) {
      throw new Error(data.error);
    }

    const status = data as StripeConnectionStatus;
    await refreshWorkspaces();
    return status;
  }

  async function disconnectStripe() {
    ensureAdmin();
    const { data, error } = await supabase.functions.invoke(
      "stripe-connect-account",
      { body: { workspaceId: currentWorkspaceOrThrow(), action: "disconnect" } }
    );
    if (error) throw new Error(await edgeFunctionErrorMessage(error));
    if (typeof data?.error === "string" && data.error.trim()) throw new Error(data.error);
    await refreshWorkspaces();
  }

  async function deleteAccount() {
    const { error } = await supabase.functions.invoke("delete-account", {
      body: { confirmation: "DELETE" },
    });
    if (error) throw new Error(error.message);
    clearAccount();
  }

  function validateProjectContent(project: Project) {
    assertSafeValues([
      { value: project.name, label: "Estimate name" },
      { value: project.client, label: "Client name" },
      { value: project.projectType, label: "Job type" },
      { value: project.scopeDescription, label: "Scope description" },
      { value: project.clientNotes, label: "Client notes" },
      { value: project.notes, label: "Internal notes" },
      ...(project.jobSections ?? []).flatMap((job, index) => [
        { value: job.title, label: `Job ${index + 1} title` },
        { value: job.projectType, label: `Job ${index + 1} type` },
        { value: job.scopeDescription, label: `Job ${index + 1} scope` },
        { value: job.internalNotes, label: `Job ${index + 1} internal notes` },
        ...job.lineItems.map((item) => ({
          value: item.description,
          label: `Job ${index + 1} material or service`,
        })),
      ]),
    ]);
  }

  function projectToDatabase(project: Project) {
    return {
      id: project.id,
      user_id: currentUserOrThrow(),
      workspace_id: currentWorkspaceOrThrow(),
      created_by: project.createdBy || currentUserOrThrow(),
      name: project.name,
      client: project.client,
      address: project.address,
      city: project.city,
      contact_id: project.contactId,
      property_id: project.propertyId,
      status: project.status,
      estimate_status: project.estimateStatus,
      estimate_number: project.estimateNumber,
      issue_date: project.issueDate,
      valid_until: project.validUntil || null,
      invoice_due_date: project.invoiceDueDate || null,
      project_type: project.projectType,
      job_sections: project.jobSections,
      billing_method: project.billingMethod,
      square_footage: project.squareFootage,
      labor_rate: project.laborRate,
      labor_hours: project.laborHours,
      line_items: project.lineItems,
      estimate_summary: project.aiEstimate,
      scope_description: project.scopeDescription,
      client_notes: project.clientNotes,
      terms: project.terms,
      tax_rate: project.taxRate,
      discount_amount: project.discountAmount,
      total_estimate: project.totalEstimate,
      notes: project.notes,
      share_token: project.shareToken,
      share_enabled: project.shareEnabled,
      scheduled_start: project.scheduledStart,
      scheduled_end: project.scheduledEnd,
      follow_up_at: project.followUpAt,
      created_at: project.createdAt,
      updated_at: project.updatedAt,
    };
  }

  function projectUpdates(project: Project) {
    const {
      id: _id,
      user_id: _userId,
      workspace_id: _workspaceId,
      created_at: _createdAt,
      ...updates
    } = projectToDatabase(project);
    return updates;
  }

  async function syncProjectAssignments(project: Project) {
    const workspaceId = currentWorkspaceOrThrow();
    const userId = currentUserOrThrow();
    const { error: deleteError } = await supabase
      .from("project_assignments")
      .delete()
      .eq("project_id", project.id)
      .eq("workspace_id", workspaceId);
    if (deleteError) throw new Error(deleteError.message);

    const uniqueAssignments = new Map<string, LaborAssignment>();
    const sourceAssignments = project.jobSections?.length
      ? project.jobSections.flatMap((job) => job.laborAssignments ?? [])
      : project.laborAssignments;
    for (const assignment of sourceAssignments) {
      if (!assignment.userId) continue;
      const previous = uniqueAssignments.get(assignment.userId);
      uniqueAssignments.set(assignment.userId, {
        ...assignment,
        hours: Number(previous?.hours ?? 0) + Number(assignment.hours || 0),
      });
    }
    if (!uniqueAssignments.size) return;

    const { error } = await supabase.from("project_assignments").insert(
      [...uniqueAssignments.values()].map((assignment) => ({
        workspace_id: workspaceId,
        project_id: project.id,
        user_id: assignment.userId,
        assigned_by: userId,
        hours: Math.max(0, Number(assignment.hours) || 0),
        hourly_rate_snapshot: Math.max(0, Number(assignment.hourlyRate) || 0),
      }))
    );
    if (error) throw new Error(error.message);
  }

  async function refreshProjects() {
    await refreshCurrentBundle();
  }

  async function addProject(project: Project) {
    ensureManager();
    validateProjectContent(project);
    const { data, error } = await supabase
      .from("projects")
      .insert(projectToDatabase(project))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await syncProjectAssignments(project);
    const saved = enrichProjectOperationalDetails(
      rowToProject(data as ProjectRow, project.laborAssignments),
      contacts,
      properties
    );
    setProjects((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
    return saved;
  }

  async function updateProject(project: Project) {
    ensureManager();
    validateProjectContent(project);
    const workspaceId = currentWorkspaceOrThrow();
    const { data, error } = await supabase
      .from("projects")
      .update(projectUpdates(project))
      .eq("id", project.id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await syncProjectAssignments(project);
    const saved = enrichProjectOperationalDetails(
      rowToProject(data as ProjectRow, project.laborAssignments),
      contacts,
      properties
    );
    setProjects((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
    return saved;
  }

  async function setProjectSharing(id: string, enabled: boolean) {
    ensureManager();
    const workspaceId = currentWorkspaceOrThrow();
    const now = new Date().toISOString();
    const updates: Record<string, unknown> = {
      share_enabled: enabled,
      updated_at: now,
    };

    if (enabled) {
      updates.estimate_status = "sent";
      updates.sent_at = now;
    }

    const { data, error } = await supabase
      .from("projects")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const existing = projects.find((project) => project.id === id);
    const saved = enrichProjectOperationalDetails(
      rowToProject(data as ProjectRow, existing?.laborAssignments ?? []),
      contacts,
      properties
    );
    setProjects((previous) =>
      previous.map((project) => (project.id === id ? saved : project))
    );
    return saved;
  }

  async function deleteProject(id: string) {
    ensureManager();
    const { error } = await supabase.rpc("delete_project_with_connected_data", {
      requested_project_id: id,
    });
    if (error) throw new Error(error.message);
    setProjects((previous) => previous.filter((project) => project.id !== id));
    setInvoices((previous) => previous.filter((invoice) => invoice.projectId !== id));
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
  }

  async function assignSelfToProject(projectId: string) {
    const { error } = await supabase.rpc("employee_claim_project", {
      requested_project_id: projectId,
    });
    if (error) throw new Error(error.message);
    await refreshCurrentBundle();
  }

  function contactToDatabase(contact: Contact) {
    return {
      id: contact.id,
      user_id: currentUserOrThrow(),
      workspace_id: currentWorkspaceOrThrow(),
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      address: contact.address,
      city: contact.city,
      state: contact.state,
      zip: contact.zip,
      contact_type: contact.contactType,
      activity_status: contact.activityStatus,
      source: contact.source,
      notes: contact.notes,
      created_at: contact.createdAt,
      updated_at: contact.updatedAt,
    };
  }

  async function completeProject(projectId: string): Promise<string> {
    ensureManager();
    const { data, error } = await supabase.rpc("complete_project_and_create_invoice", {
      requested_project_id: projectId,
    });
    if (error) throw new Error(error.message);
    await Promise.all([refreshProjects(), refreshInvoices(), refreshSchedule()]);
    return String(data);
  }

  async function bulkDeleteProjects(projectIds: string[]) {
    ensureManager();
    if (!projectIds.length) return;
    const { error } = await supabase.rpc("bulk_delete_projects", {
      requested_project_ids: projectIds,
    });
    if (error) throw new Error(error.message);
    const selected = new Set(projectIds);
    setProjects((previous) => previous.filter((project) => !selected.has(project.id)));
    setInvoices((previous) =>
      previous.filter((invoice) => !invoice.projectId || !selected.has(invoice.projectId))
    );
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
  }

  async function refreshContacts() {
    await refreshCurrentBundle();
  }

  async function addContact(contact: Contact) {
    ensureManager();
    assertSafeValues([
      { value: contact.name, label: "Contact name" },
      { value: contact.source, label: "Contact source" },
      { value: contact.notes, label: "Contact notes" },
    ]);
    const { data, error } = await supabase
      .from("contacts")
      .insert(contactToDatabase(contact))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToContact(data as ContactRow);
    setContacts((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    return saved;
  }

  async function updateContact(contact: Contact) {
    ensureManager();
    assertSafeValues([
      { value: contact.name, label: "Contact name" },
      { value: contact.source, label: "Contact source" },
      { value: contact.notes, label: "Contact notes" },
    ]);
    const { id: _id, user_id: _userId, workspace_id: _workspaceId, created_at: _createdAt, ...updates } =
      contactToDatabase(contact);
    const { data, error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", contact.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToContact(data as ContactRow);
    setContacts((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    return saved;
  }

  async function deleteContact(id: string) {
    ensureManager();
    const propertyIds = properties
      .filter((property) => property.contactId === id)
      .map((property) => property.id);
    const paths = propertyPhotos
      .filter((photo) => propertyIds.includes(photo.propertyId))
      .map((photo) => photo.storagePath);
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("property-photos")
        .remove(paths);
      if (storageError) throw new Error(storageError.message);
    }
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setContacts((previous) => previous.filter((contact) => contact.id !== id));
    setProperties((previous) => previous.filter((property) => property.contactId !== id));
    setPropertyPhotos((previous) =>
      previous.filter((photo) => !propertyIds.includes(photo.propertyId))
    );
  }

  function propertyToDatabase(property: Property) {
    return {
      id: property.id,
      user_id: currentUserOrThrow(),
      workspace_id: currentWorkspaceOrThrow(),
      contact_id: property.contactId,
      name: property.name,
      address: property.address,
      city: property.city,
      state: property.state,
      zip: property.zip,
      description: property.description,
      internal_notes: property.internalNotes,
      client_notes: property.clientNotes,
      created_at: property.createdAt,
      updated_at: property.updatedAt,
    };
  }

  async function refreshProperties() {
    await refreshCurrentBundle();
  }

  async function addProperty(property: Property) {
    ensureManager();
    assertSafeValues([
      { value: property.name, label: "Property name" },
      { value: property.description, label: "Property description" },
      { value: property.internalNotes, label: "Property internal notes" },
      { value: property.clientNotes, label: "Property client notes" },
    ]);
    const { data, error } = await supabase
      .from("properties")
      .insert(propertyToDatabase(property))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToProperty(data as PropertyRow);
    setProperties((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    return saved;
  }

  async function updateProperty(property: Property) {
    ensureManager();
    assertSafeValues([
      { value: property.name, label: "Property name" },
      { value: property.description, label: "Property description" },
      { value: property.internalNotes, label: "Property internal notes" },
      { value: property.clientNotes, label: "Property client notes" },
    ]);
    const {
      id: _id,
      user_id: _userId,
      workspace_id: _workspaceId,
      created_at: _createdAt,
      ...updates
    } = propertyToDatabase(property);
    const { data, error } = await supabase
      .from("properties")
      .update(updates)
      .eq("id", property.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToProperty(data as PropertyRow);
    setProperties((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    return saved;
  }

  async function deleteProperty(id: string) {
    ensureManager();
    const paths = propertyPhotos
      .filter((photo) => photo.propertyId === id)
      .map((photo) => photo.storagePath);
    if (paths.length) {
      const { error: storageError } = await supabase.storage
        .from("property-photos")
        .remove(paths);
      if (storageError) throw new Error(storageError.message);
    }
    const { error } = await supabase
      .from("properties")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setProperties((previous) => previous.filter((property) => property.id !== id));
    setPropertyPhotos((previous) => previous.filter((photo) => photo.propertyId !== id));
  }

  async function uploadPropertyPhoto(
    propertyId: string,
    file: File,
    caption = ""
  ) {
    ensureManager();
    const userId = currentUserOrThrow();
    const workspaceId = currentWorkspaceOrThrow();
    const extension = getFileExtension(file);
    const supportedImageExtension = [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "heic",
      "heif",
    ].includes(extension);
    if (!file.type.startsWith("image/") && !supportedImageExtension) {
      throw new Error("Choose an image file.");
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error("Each photo must be 10 MB or smaller.");
    }
    const photoId = globalThis.crypto.randomUUID();
    const path = `${userId}/${propertyId}/${photoId}.${extension}`;
    const fallbackContentType =
      extension === "heic"
        ? "image/heic"
        : extension === "heif"
          ? "image/heif"
          : "image/jpeg";
    const { error: uploadError } = await supabase.storage
      .from("property-photos")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type || fallbackContentType,
      });
    if (uploadError) throw new Error(uploadError.message);
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("property_photos")
      .insert({
        id: photoId,
        user_id: userId,
        workspace_id: workspaceId,
        property_id: propertyId,
        storage_path: path,
        caption: caption.trim(),
        created_at: now,
      })
      .select("*")
      .single();
    if (error) {
      await supabase.storage.from("property-photos").remove([path]);
      throw new Error(error.message);
    }
    const saved = await rowToPropertyPhoto(data as PropertyPhotoRow);
    setPropertyPhotos((previous) => [...previous, saved]);
    return saved;
  }

  async function deletePropertyPhoto(photo: PropertyPhoto) {
    ensureManager();
    const { error: storageError } = await supabase.storage
      .from("property-photos")
      .remove([photo.storagePath]);
    if (storageError) throw new Error(storageError.message);
    const { error } = await supabase
      .from("property_photos")
      .delete()
      .eq("id", photo.id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setPropertyPhotos((previous) => previous.filter((item) => item.id !== photo.id));
  }

  function invoiceToDatabase(invoice: Invoice) {
    return {
      id: invoice.id,
      workspace_id: currentWorkspaceOrThrow(),
      created_by: invoice.createdBy || currentUserOrThrow(),
      project_id: invoice.projectId,
      contact_id: invoice.contactId,
      property_id: invoice.propertyId,
      invoice_number: invoice.invoiceNumber,
      issue_date: invoice.issueDate,
      due_date: invoice.dueDate,
      status: invoice.status,
      amount: invoice.amount,
      notes: invoice.notes,
      estimate_snapshot: invoice.estimateSnapshot ?? {},
      share_token: invoice.shareToken,
      share_enabled: invoice.shareEnabled,
      sent_at: invoice.sentAt,
      viewed_at: invoice.viewedAt,
      payment_status: invoice.paymentStatus,
      payment_method: invoice.paymentMethod,
      stripe_checkout_url: invoice.stripeCheckoutUrl,
      stripe_checkout_session_id: invoice.stripeCheckoutSessionId,
      stripe_payment_intent_id: invoice.stripePaymentIntentId,
      paid_at: invoice.paidAt,
      completed_at: invoice.completedAt,
      voided_at: invoice.voidedAt,
      archived_at: invoice.archivedAt,
      created_at: invoice.createdAt,
      updated_at: invoice.updatedAt,
    };
  }

  async function refreshInvoices() {
    const workspaceId = currentWorkspaceOrThrow();
    if (role === "employee") {
      setInvoices([]);
      return;
    }
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("due_date", { ascending: true });
    if (error) throw new Error(error.message);
    setInvoices(((data ?? []) as InvoiceRow[]).map(rowToInvoice));
  }

  async function addInvoice(invoice: Invoice) {
    ensureManager();
    assertSafeValues([
      { value: invoice.invoiceNumber, label: "Invoice number" },
      { value: invoice.notes, label: "Invoice notes" },
    ]);
    const { data, error } = await supabase
      .from("invoices")
      .insert(invoiceToDatabase(invoice))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToInvoice(data as InvoiceRow);
    setInvoices((previous) => [saved, ...previous.filter((item) => item.id !== saved.id)]);
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
    return saved;
  }

  async function updateInvoice(invoice: Invoice) {
    ensureManager();
    assertSafeValues([
      { value: invoice.invoiceNumber, label: "Invoice number" },
      { value: invoice.notes, label: "Invoice notes" },
    ]);
    const {
      id: _id,
      workspace_id: _workspaceId,
      created_by: _createdBy,
      created_at: _createdAt,
      ...updates
    } = invoiceToDatabase(invoice);
    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", invoice.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToInvoice(data as InvoiceRow);
    setInvoices((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
    return saved;
  }

  async function deleteInvoice(id: string) {
    ensureManager();
    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setInvoices((previous) => previous.filter((invoice) => invoice.id !== id));
    await Promise.all([refreshSchedule(), refreshFollowUps()]);
  }

  async function setInvoiceSharing(id: string, enabled: boolean): Promise<Invoice> {
    ensureManager();
    const current = invoices.find((invoice) => invoice.id === id);
    const updates: Record<string, unknown> = {
      share_enabled: enabled,
      updated_at: new Date().toISOString(),
    };
    if (enabled) {
      updates.status = current?.status === "draft" ? "sent" : current?.status ?? "sent";
      updates.sent_at = current?.sentAt ?? new Date().toISOString();
    }
    const { data, error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToInvoice(data as InvoiceRow);
    setInvoices((previous) =>
      previous.map((invoice) => (invoice.id === saved.id ? saved : invoice))
    );
    return saved;
  }

  async function completeInvoice(id: string) {
    ensureManager();
    const { error } = await supabase.rpc("complete_invoice", {
      requested_invoice_id: id,
    });
    if (error) throw new Error(error.message);
    await Promise.all([refreshInvoices(), refreshSchedule(), refreshFollowUps()]);
  }

  async function voidInvoice(id: string) {
    ensureManager();
    const { error } = await supabase.rpc("void_invoice", {
      requested_invoice_id: id,
    });
    if (error) throw new Error(error.message);
    await Promise.all([refreshInvoices(), refreshSchedule(), refreshFollowUps()]);
  }

  async function markInvoicePaid(id: string, method = "offline") {
    ensureManager();
    const { error } = await supabase.rpc("mark_invoice_paid", {
      requested_invoice_id: id,
      requested_method: method,
    });
    if (error) throw new Error(error.message);
    await Promise.all([refreshInvoices(), refreshSchedule(), refreshFollowUps()]);
  }

  function scheduleToDatabase(event: ScheduleEvent) {
    return {
      id: event.id,
      workspace_id: currentWorkspaceOrThrow(),
      created_by: event.createdBy || currentUserOrThrow(),
      title: event.title,
      description: event.description,
      start_at: event.startAt,
      end_at: event.endAt,
      all_day: event.allDay,
      source_type: event.sourceType,
      project_id: event.projectId,
      invoice_id: event.invoiceId,
      contact_id: event.contactId,
      assigned_user_id: event.assignedUserId,
      status: event.status,
      auto_key: event.autoKey,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    };
  }

  async function refreshSchedule() {
    const workspaceId = currentWorkspaceOrThrow();
    const { data, error } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("start_at", { ascending: true });
    if (error) throw new Error(error.message);
    setScheduleEvents(((data ?? []) as ScheduleEventRow[]).map(rowToScheduleEvent));
  }

  async function addScheduleEvent(event: ScheduleEvent) {
    assertSafeValues([
      { value: event.title, label: "Schedule title" },
      { value: event.description, label: "Schedule description" },
    ]);
    const { data, error } = await supabase
      .from("schedule_events")
      .insert(scheduleToDatabase(event))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToScheduleEvent(data as ScheduleEventRow);
    setScheduleEvents((previous) => [...previous, saved].sort((a, b) => a.startAt.localeCompare(b.startAt)));
    return saved;
  }

  async function updateScheduleEvent(event: ScheduleEvent) {
    assertSafeValues([
      { value: event.title, label: "Schedule title" },
      { value: event.description, label: "Schedule description" },
    ]);
    const {
      id: _id,
      workspace_id: _workspaceId,
      created_by: _createdBy,
      created_at: _createdAt,
      ...updates
    } = scheduleToDatabase(event);
    const { data, error } = await supabase
      .from("schedule_events")
      .update(updates)
      .eq("id", event.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToScheduleEvent(data as ScheduleEventRow);
    setScheduleEvents((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    return saved;
  }

  async function deleteScheduleEvent(id: string) {
    const { error } = await supabase
      .from("schedule_events")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setScheduleEvents((previous) => previous.filter((event) => event.id !== id));
  }

  function followUpToDatabase(followUp: FollowUp) {
    return {
      id: followUp.id,
      workspace_id: currentWorkspaceOrThrow(),
      created_by: followUp.createdBy || currentUserOrThrow(),
      title: followUp.title,
      notes: followUp.notes,
      due_at: followUp.dueAt,
      type: followUp.type,
      status: followUp.status,
      channel: followUp.channel,
      contact_id: followUp.contactId,
      project_id: followUp.projectId,
      invoice_id: followUp.invoiceId,
      assigned_user_id: followUp.assignedUserId,
      auto_key: followUp.autoKey,
      created_at: followUp.createdAt,
      updated_at: followUp.updatedAt,
    };
  }

  async function refreshFollowUps() {
    const workspaceId = currentWorkspaceOrThrow();
    const { data, error } = await supabase
      .from("follow_ups")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("due_at", { ascending: true });
    if (error) throw new Error(error.message);
    setFollowUps(((data ?? []) as FollowUpRow[]).map(rowToFollowUp));
  }

  async function addFollowUp(followUp: FollowUp) {
    assertSafeValues([
      { value: followUp.title, label: "Follow-up title" },
      { value: followUp.notes, label: "Follow-up notes" },
    ]);
    const { data, error } = await supabase
      .from("follow_ups")
      .insert(followUpToDatabase(followUp))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToFollowUp(data as FollowUpRow);
    setFollowUps((previous) => [...previous, saved].sort((a, b) => a.dueAt.localeCompare(b.dueAt)));
    return saved;
  }

  async function updateFollowUp(followUp: FollowUp) {
    assertSafeValues([
      { value: followUp.title, label: "Follow-up title" },
      { value: followUp.notes, label: "Follow-up notes" },
    ]);
    const {
      id: _id,
      workspace_id: _workspaceId,
      created_by: _createdBy,
      created_at: _createdAt,
      ...updates
    } = followUpToDatabase(followUp);
    const { data, error } = await supabase
      .from("follow_ups")
      .update(updates)
      .eq("id", followUp.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToFollowUp(data as FollowUpRow);
    setFollowUps((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    return saved;
  }

  async function deleteFollowUp(id: string) {
    const { error } = await supabase
      .from("follow_ups")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setFollowUps((previous) => previous.filter((followUp) => followUp.id !== id));
  }

  function jobRequestToDatabase(request: JobRequest) {
    return {
      id: request.id,
      workspace_id: currentWorkspaceOrThrow(),
      requested_by: request.requestedBy || currentUserOrThrow(),
      title: request.title,
      client: request.client,
      address: request.address,
      city: request.city,
      project_type: request.projectType,
      scope_description: request.scopeDescription,
      proposed_start: request.proposedStart,
      status: request.status,
      manager_notes: request.managerNotes,
      created_project_id: request.createdProjectId,
      created_at: request.createdAt,
      updated_at: request.updatedAt,
    };
  }

  async function refreshJobRequests() {
    const workspaceId = currentWorkspaceOrThrow();
    const { data, error } = await supabase
      .from("job_requests")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    setJobRequests(
      ((data ?? []) as JobRequestRow[]).map((row) =>
        rowToJobRequest(row, workspaceMembers)
      )
    );
  }

  async function addJobRequest(request: JobRequest) {
    assertSafeValues([
      { value: request.title, label: "Proposal title" },
      { value: request.client, label: "Client name" },
      { value: request.projectType, label: "Job type" },
      { value: request.scopeDescription, label: "Proposal scope" },
    ]);
    const { data, error } = await supabase
      .from("job_requests")
      .insert(jobRequestToDatabase(request))
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToJobRequest(data as JobRequestRow, workspaceMembers);
    setJobRequests((previous) => [saved, ...previous]);
    return saved;
  }

  async function updateJobRequest(request: JobRequest) {
    assertSafeValues([
      { value: request.title, label: "Proposal title" },
      { value: request.client, label: "Client name" },
      { value: request.projectType, label: "Job type" },
      { value: request.scopeDescription, label: "Proposal scope" },
      { value: request.managerNotes, label: "Manager notes" },
    ]);
    const {
      id: _id,
      workspace_id: _workspaceId,
      requested_by: _requestedBy,
      created_at: _createdAt,
      ...updates
    } = jobRequestToDatabase(request);
    const { data, error } = await supabase
      .from("job_requests")
      .update(updates)
      .eq("id", request.id)
      .eq("workspace_id", currentWorkspaceOrThrow())
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    const saved = rowToJobRequest(data as JobRequestRow, workspaceMembers);
    setJobRequests((previous) =>
      previous.map((item) => (item.id === saved.id ? saved : item))
    );
    return saved;
  }

  async function approveJobRequest(id: string) {
    ensureManager();
    const { data, error } = await supabase.rpc("approve_job_request", {
      requested_job_request_id: id,
    });
    if (error) throw new Error(error.message);
    await refreshCurrentBundle();
    return String(data);
  }

  async function declineJobRequest(id: string, notes = "") {
    ensureManager();
    const { error } = await supabase
      .from("job_requests")
      .update({
        status: "declined",
        manager_notes: notes.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setJobRequests((previous) =>
      previous.map((request) =>
        request.id === id
          ? {
              ...request,
              status: "declined",
              managerNotes: notes.trim(),
              updatedAt: new Date().toISOString(),
            }
          : request
      )
    );
  }

  async function deleteJobRequest(id: string) {
    const { error } = await supabase
      .from("job_requests")
      .delete()
      .eq("id", id)
      .eq("workspace_id", currentWorkspaceOrThrow());
    if (error) throw new Error(error.message);
    setJobRequests((previous) => previous.filter((request) => request.id !== id));
  }

  return (
    <AppContext.Provider
      value={{
        user,
        authUserId,
        authLoading,
        workspaces,
        activeWorkspace,
        activeWorkspaceId,
        role,
        workspaceMembers,
        workspaceInvites,
        workspaceLoading,
        workspaceError,
        projects,
        projectsLoading,
        projectsError,
        contacts,
        contactsLoading,
        contactsError,
        properties,
        propertyPhotos,
        propertiesLoading,
        propertiesError,
        invoices,
        invoicesLoading,
        invoicesError,
        scheduleEvents,
        scheduleLoading,
        scheduleError,
        followUps,
        followUpsLoading,
        followUpsError,
        jobRequests,
        jobRequestsLoading,
        jobRequestsError,
        login,
        logout,
        register,
        updateProfile,
        switchWorkspace,
        refreshWorkspaces,
        createCompanyWorkspace,
        createWorkgroupWorkspace,
        createWorkspaceInvite,
        revokeWorkspaceInvite,
        acceptWorkspaceInvite,
        updateWorkspaceMember,
        removeWorkspaceMember,
        leaveWorkspace,
        startStripeOnboarding,
        refreshStripeConnection,
        disconnectStripe,
        deleteAccount,
        updateMyWorkspaceRate,
        refreshProjects,
        addProject,
        updateProject,
        deleteProject,
        setProjectSharing,
        assignSelfToProject,
        completeProject,
        bulkDeleteProjects,
        refreshContacts,
        addContact,
        updateContact,
        deleteContact,
        refreshProperties,
        addProperty,
        updateProperty,
        deleteProperty,
        uploadPropertyPhoto,
        deletePropertyPhoto,
        refreshInvoices,
        addInvoice,
        updateInvoice,
        deleteInvoice,
        setInvoiceSharing,
        completeInvoice,
        voidInvoice,
        markInvoicePaid,
        refreshSchedule,
        addScheduleEvent,
        updateScheduleEvent,
        deleteScheduleEvent,
        refreshFollowUps,
        addFollowUp,
        updateFollowUp,
        deleteFollowUp,
        refreshJobRequests,
        addJobRequest,
        updateJobRequest,
        approveJobRequest,
        declineJobRequest,
        deleteJobRequest,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
