export type ProjectStatus = "active" | "completed" | "archived";

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined";

export type InternalApprovalStatus =
  | "draft"
  | "pending"
  | "approved"
  | "changes_requested";

export type ProjectBillingMethod = "fixed" | "hourly";

export type AccountType = "landscaper" | "client";

export type WorkspaceRole =
  | "owner"
  | "co_owner"
  | "manager"
  | "employee";

export type WorkspaceKind = "personal" | "company" | "workgroup";

export type StripeRequirementError = {
  code: string;
  reason: string;
  requirement: string;
};

export type StripeConnectionStatus = {
  connected: boolean;
  accountExists: boolean;
  onboardingComplete: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  currentlyDue: string[];
  eventuallyDue: string[];
  pastDue: string[];
  pendingVerification: string[];
  disabledReason: string | null;
  errors: StripeRequirementError[];
  futureCurrentlyDue: string[];
  futureEventuallyDue: string[];
  futurePastDue: string[];
  futurePendingVerification: string[];
  futureDisabledReason: string | null;
  syncedAt: string | null;
};

export type LineItemType = "material" | "service" | "fuel";

export type LineItem = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  itemType?: LineItemType;
  /** Customer-facing price per unit. */
  unitCost: number;
};

export type EstimateJob = {
  id: string;
  title: string;
  projectType: string;
  scopeDescription: string;
  internalNotes: string;
  squareFootage: number;
  pricePerSquareFoot: number;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  laborRate: number;
  laborHours: number;
  laborAssignments: LaborAssignment[];
  lineItems: LineItem[];
  photoIds: string[];
};


export type ProjectContactDetails = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
};

export type ProjectPropertyDetails = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  internalNotes: string;
  clientNotes: string;
};

export type LaborAssignment = {
  userId: string;
  name: string;
  hours: number;
  hourlyRate: number;
};

export type Project = {
  id: string;
  workspaceId: string;
  createdBy: string;
  name: string;
  client: string;
  address: string;
  city: string;
  contactId: string | null;
  propertyId: string | null;
  contactDetails?: ProjectContactDetails | null;
  propertyDetails?: ProjectPropertyDetails | null;
  status: ProjectStatus;
  estimateStatus: EstimateStatus;
  estimateNumber: string;
  issueDate: string;
  validUntil: string | null;
  invoiceDueDate: string | null;
  projectType: string;
  jobSections: EstimateJob[];
  billingMethod: ProjectBillingMethod;
  squareFootage: number;
  laborRate: number;
  laborHours: number;
  laborAssignments: LaborAssignment[];
  lineItems: LineItem[];
  aiEstimate: string | null;
  scopeDescription: string;
  clientNotes: string;
  terms: string;
  taxRate: number;
  discountAmount: number;
  totalEstimate: number;
  notes: string;
  shareToken: string;
  shareEnabled: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  respondedAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  responseName: string;
  responseMessage: string;
  signatureData: string;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  followUpAt: string | null;
  assignedMemberIds: string[];
  internalApprovalStatus: InternalApprovalStatus;
  submittedForApprovalAt: string | null;
  submittedForApprovalBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactType = "lead" | "customer";
export type ContactActivity = "active" | "inactive";

export type Contact = {
  id: string;
  workspaceId: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contactType: ContactType;
  activityStatus: ContactActivity;
  source: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type Property = {
  id: string;
  workspaceId: string;
  contactId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  description: string;
  internalNotes: string;
  clientNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type PropertyPhoto = {
  id: string;
  workspaceId: string;
  propertyId: string;
  storagePath: string;
  caption: string;
  url: string;
  createdAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  kind: WorkspaceKind;
  isPersonal: boolean;
  createdBy: string;
  role: WorkspaceRole;
  stripeAccountId: string | null;
  stripeOnboardingComplete: boolean;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeCurrentlyDue: string[];
  stripeEventuallyDue: string[];
  stripePastDue: string[];
  stripePendingVerification: string[];
  stripeDisabledReason: string | null;
  stripeRequirementErrors: StripeRequirementError[];
  stripeFutureCurrentlyDue: string[];
  stripeFutureEventuallyDue: string[];
  stripeFuturePastDue: string[];
  stripeFuturePendingVerification: string[];
  stripeFutureDisabledReason: string | null;
  stripeStatusSyncedAt: string | null;
  createdAt: string;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  name: string;
  email: string;
  company: string;
  phone: string;
  positionTitle: string;
  hourlyRate: number;
  createdAt: string;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: Exclude<WorkspaceRole, "owner">;
  token: string;
  code: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
};

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type InvoicePaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type InvoiceSnapshot = {
  estimateNumber: string;
  name: string;
  client: string;
  address: string;
  city: string;
  projectType: string;
  jobSections: EstimateJob[];
  billingMethod: ProjectBillingMethod;
  lineItems: LineItem[];
  laborAssignments: LaborAssignment[];
  laborHours: number;
  laborRate: number;
  aiEstimate: string | null;
  scopeDescription: string;
  clientNotes: string;
  terms: string;
  taxRate: number;
  discountAmount: number;
  totalEstimate: number;
  responseName: string;
  signatureData: string;
  acceptedAt: string | null;
};

export type Invoice = {
  id: string;
  workspaceId: string;
  createdBy: string;
  projectId: string | null;
  contactId: string | null;
  propertyId: string | null;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  amount: number;
  notes: string;
  estimateSnapshot: InvoiceSnapshot | null;
  shareToken: string;
  shareEnabled: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  paymentStatus: InvoicePaymentStatus;
  paymentMethod: string;
  stripeCheckoutUrl: string | null;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
  paidAt: string | null;
  completedAt: string | null;
  voidedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScheduleEventStatus = "scheduled" | "completed" | "cancelled";
export type ScheduleSourceType = "manual" | "project" | "invoice";

export type ScheduleEvent = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  sourceType: ScheduleSourceType;
  projectId: string | null;
  invoiceId: string | null;
  contactId: string | null;
  assignedUserId: string | null;
  status: ScheduleEventStatus;
  autoKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FollowUpType =
  | "general"
  | "estimate"
  | "appointment"
  | "payment"
  | "customer";

export type FollowUpStatus = "pending" | "completed" | "dismissed";
export type FollowUpChannel = "email" | "sms" | "phone" | "none";

export type FollowUp = {
  id: string;
  workspaceId: string;
  createdBy: string;
  title: string;
  notes: string;
  dueAt: string;
  type: FollowUpType;
  status: FollowUpStatus;
  channel: FollowUpChannel;
  contactId: string | null;
  projectId: string | null;
  invoiceId: string | null;
  assignedUserId: string | null;
  autoKey: string | null;
  createdAt: string;
  updatedAt: string;
};

export type JobRequestStatus = "pending" | "approved" | "declined";

export type JobRequest = {
  id: string;
  workspaceId: string;
  requestedBy: string;
  requestedByName: string;
  title: string;
  client: string;
  address: string;
  city: string;
  projectType: string;
  scopeDescription: string;
  proposedStart: string | null;
  status: JobRequestStatus;
  managerNotes: string;
  createdProjectId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  accountType: AccountType;
  availableModes?: AccountType[];
  id?: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  city: string;
  state: string;
};
