export type ProjectStatus = "active" | "completed" | "archived";

export type EstimateStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined";

export type LineItem = {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
};

export type Project = {
  id: string;
  name: string;
  client: string;
  address: string;
  contactId: string | null;
  propertyId: string | null;
  status: ProjectStatus;
  estimateStatus: EstimateStatus;
  estimateNumber: string;
  issueDate: string;
  validUntil: string | null;
  projectType: string;
  squareFootage: number;
  laborRate: number;
  laborHours: number;
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
  createdAt: string;
  updatedAt: string;
};

export type ContactType = "lead" | "customer";

export type ContactActivity = "active" | "inactive";

export type Contact = {
  id: string;
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
  propertyId: string;
  storagePath: string;
  caption: string;
  url: string;
  createdAt: string;
};

export type User = {
  name: string;
  email: string;
  company: string;
  phone: string;
};
