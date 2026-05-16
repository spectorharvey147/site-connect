export type Role = "user" | "admin" | "manager" | "accounts" | "super_admin";

export type Language = "en" | "hi" | "ta" | "te";

export type ThemeMode = "light" | "dark" | "system";

export type ClaimStatus =
  | "draft"
  | "submitted"
  | "verified"
  | "approved"
  | "rejected"
  | "returned"
  | "withdrawn"
  | "settled";

export type ExpenseType =
  | "Travel"
  | "Fuel"
  | "Food & Beverage"
  | "Accommodation"
  | "Material"
  | "Equipment"
  | "Other";

export type PaymentMode =
  | "Cash"
  | "Card"
  | "UPI"
  | "Bank Transfer"
  | "Cheque";

export interface Profile {
  id: string;
  email: string;
  employee_id: string;
  first_name: string;
  last_name: string;
  mobile_number: string | null;
  designation: string | null;
  department_id: string | null;
  role: Role;
  status: "active" | "inactive";
  language: Language;
  theme: ThemeMode;
  last_login_at: string | null;
}

export interface Department {
  id: string;
  department_name: string;
  department_code: string;
  head_name: string | null;
  head_email: string | null;
  status: "active" | "inactive";
}

export interface Project {
  id: string;
  project_name: string;
  project_code: string;
  location: string;
  city: string | null;
  state: string | null;
  status: "active" | "inactive";
  project_manager_id: string | null;
}

export interface CostCode {
  id: string;
  project_id: string;
  cost_code: string;
  description: string;
  expense_type: ExpenseType;
  budget_allocated: number;
  budget_spent: number;
  status: "active" | "inactive";
}

export interface ExpenseCategory {
  id: string;
  category_name: string;
  category_code: string;
  description: string | null;
  category_type: "Client" | "Internal" | "Project";
  requires_receipt: boolean;
  maximum_amount_limit: number | null;
  status: "active" | "inactive";
}

export interface Vendor {
  id: string;
  vendor_name: string;
  vendor_code: string;
  vendor_type: string;
  contact_person_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  status: "active" | "inactive";
}

export interface Customer {
  id: string;
  customer_name: string;
  customer_code: string;
  contact_person_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: "active" | "inactive";
}

export interface Claim {
  id: string;
  claim_number: string;
  user_id: string;
  claim_date: string;
  project_id: string;
  cost_code_id: string;
  expense_category_id: string;
  expense_type: ExpenseType;
  amount: number;
  verified_amount: number | null;
  approved_amount: number | null;
  settlement_amount: number | null;
  currency: string;
  description: string;
  vendor_id: string | null;
  payment_mode: PaymentMode | null;
  payment_reference: string | null;
  remarks: string | null;
  status: ClaimStatus;
  admin_comments: string | null;
  manager_comments: string | null;
  settlement_reference: string | null;
  settlement_payment_mode: PaymentMode | null;
  settlement_remarks: string | null;
  settlement_date: string | null;
  rejection_reason: string | null;
  returned_reason: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Pick<Profile, "first_name" | "last_name" | "employee_id" | "email">;
  projects?: Pick<Project, "project_name" | "project_code">;
  expense_categories?: Pick<ExpenseCategory, "category_name">;
}

export interface ClaimReceipt {
  id: string;
  claim_id: string;
  file_name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  public_url?: string;
}

export interface ClaimEvent {
  id: string;
  claim_id: string;
  actor_id: string | null;
  action: string;
  from_status: ClaimStatus | null;
  to_status: ClaimStatus | null;
  comments: string | null;
  created_at: string;
  profiles?: Pick<Profile, "first_name" | "last_name">;
}

export interface CompanySettings {
  id: string;
  company_name: string;
  support_email: string;
  support_phone: string;
  currency: string;
  timezone: string;
  address: string | null;
}

export interface WorkflowSettings {
  id: string;
  require_admin_verification: boolean;
  require_manager_approval: boolean;
  require_super_admin_final_approval: boolean;
  auto_approve_below_threshold: boolean;
  threshold_amount: number;
  email_claim_submission: boolean;
  email_claim_verification: boolean;
  email_claim_approval: boolean;
  email_claim_rejection: boolean;
  push_claim_status_updates: boolean;
  notification_email_recipient: string | null;
  email_frequency: "Immediate" | "Daily Digest" | "Weekly";
}
