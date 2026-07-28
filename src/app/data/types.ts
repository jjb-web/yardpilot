export type ProjectStatus = "active" | "completed" | "archived";

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
  status: ProjectStatus;
  projectType: string;
  squareFootage: number;
  laborRate: number;
  laborHours: number;
  lineItems: LineItem[];
  aiEstimate: string | null;
  totalEstimate: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactStatus = "lead" | "active" | "customer" | "inactive";

export type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: ContactStatus;
  source: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type User = {
  name: string;
  email: string;
  company: string;
  phone: string;
};
