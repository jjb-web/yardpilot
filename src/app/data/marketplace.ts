export type MarketplaceBusiness = {
  workspace_id: string;
  display_name: string;
  headline: string;
  description: string;
  services: string[];
  city: string;
  state: string;
  postal_code: string;
  service_radius_miles: number;
  accepting_client_work: boolean;
  hiring: boolean;
  availability_note: string;
  website_url: string;
  public_email: string;
  public_phone: string;
  updated_at: string;
  total_count?: number;
};

export type MarketplaceOpening = {
  id: string;
  workspace_id: string;
  business_name: string;
  business_headline: string;
  title: string;
  description: string;
  employment_type: string;
  compensation_type: string;
  pay_min: number | null;
  pay_max: number | null;
  city: string;
  state: string;
  postal_code: string;
  expires_at: string | null;
  created_at: string;
  total_count?: number;
};

export type ClientJobRequest = {
  id: string;
  client_user_id: string;
  title: string;
  description: string;
  service_type: string;
  city: string;
  state: string;
  postal_code: string;
  budget_min: number | null;
  budget_max: number | null;
  desired_start: string | null;
  bid_deadline: string | null;
  status?: string;
  awarded_bid_id?: string | null;
  created_at: string;
  updated_at?: string;
  client_name?: string;
  client_email?: string;
  client_phone?: string;
  total_count?: number;
};

export type ClientJobBid = {
  id: string;
  request_id: string;
  workspace_id: string;
  submitted_by: string;
  amount: number | null;
  message: string;
  proposed_start: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type WorkerProfile = {
  user_id: string;
  headline: string;
  bio: string;
  city: string;
  state: string;
  postal_code: string;
  years_experience: number;
  skills: string[];
  resume_path: string | null;
  available: boolean;
  created_at?: string;
  updated_at?: string;
};

export type MarketplaceWorkOrder = {
  work_order_id: string;
  request_id: string;
  request_title: string;
  request_description: string;
  service_type: string;
  city: string;
  state: string;
  postal_code: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  bid_amount: number | null;
  work_status: string;
  project_id: string | null;
  invoice_id: string | null;
  updated_at: string;
};
