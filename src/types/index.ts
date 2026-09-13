export interface Profile {
  id: string;
  tenant_id: string;
  role_id: string;
  branch_id: string | null;
  full_name: string;
  email: string;
  is_active: boolean;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  permissions: string[];
  is_system: boolean;
}

export interface Customer {
  id: string;
  name: string;
  customer_type: string;
  tax_id: string | null;
  phone: string | null;
  billing_address: string | null;
  credit_limit: number | null;
  payment_terms_days: number;
  tags: string[] | null;
  notes: string | null;
  is_active: boolean;
}

export interface EquipmentCategory {
  id: string;
  name: string;
  parent_id: string | null;
  default_meter_type: string;
  default_billing_unit: string;
  custom_fields_schema: CustomFieldDef[] | null;
  is_active: boolean;
}

export interface CustomFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "select";
  options?: string[];
}

export interface Asset {
  id: string;
  category_id: string;
  branch_id: string | null;
  internal_code: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  serial_number: string | null;
  registration_number: string | null;
  status: string;
  current_meter_reading: number;
  meter_type: string;
  custom_fields: Record<string, unknown> | null;
  is_active: boolean;
}

export interface Site {
  id: string;
  customer_id: string | null;
  name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

export interface Operator {
  id: string;
  tenant_id?: string;
  name: string;
  phone: string | null;
  email?: string | null;
  license_number: string | null;
  driving_license_number?: string | null;
  aadhaar_number?: string | null;
  employee_role?: string | null;
  designation?: string | null;
  salary_amount?: number | null;
  salary_frequency?: string | null;
  advance_balance?: number | null;
  join_date?: string | null;
  notes?: string | null;
  license_expiry: string | null;
  skill_categories: string | null;
  daily_rate: number | null;
  is_active: boolean;
}

export interface EmployeeRole {
  id: string;
  tenant_id: string;
  name: string;
  base_salary: number | null;
  is_active: boolean;
}

export interface RentalContract {
  id: string;
  contract_number: string;
  customer_id: string;
  site_id: string | null;
  asset_id: string;
  operator_id: string | null;
  contract_type: string;
  billing_unit: string;
  rate: number;
  start_date: string;
  end_date: string | null;
  diesel_included: boolean;
  status: string;
}

export interface DailyEntry {
  id: string;
  entry_date: string;
  due_date: string;
  asset_id: string;
  contract_id: string | null;
  customer_name_freeform: string | null;
  customer_id: string | null;
  customer_phone: string | null;
  site_name: string | null;
  billing_type: string;
  hours_worked: number | null;
  start_time: string | null;
  end_time: string | null;
  rate: number | null;
  amount: number;
  amount_paid: number;
  diesel_included: boolean;
  diesel_liters: number | null;
  diesel_cost: number | null;
  payment_status: string;
  notes: string | null;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: string;
  asset_id: string | null;
  vendor: string | null;
  amount: number;
  payment_method: string;
  notes: string | null;
  receipt_url: string | null;
}

export interface SalaryPayment {
  id: string;
  operator_id: string | null;
  staff_name: string;
  pay_period_start: string;
  pay_period_end: string;
  amount: number;
  gross_amount?: number | null;
  advance_adjustment?: number | null;
  net_amount?: number | null;
  paid_date: string | null;
  payment_method: string;
  notes: string | null;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  customer_id: string;
  contract_id: string | null;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total: number;
  amount_paid: number;
  status: string;
}

export interface Setting {
  id: string;
  namespace: string;
  key: string;
  value: Record<string, unknown>;
}

export interface FeatureFlag {
  id: string;
  key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
}
