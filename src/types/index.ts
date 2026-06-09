export type Employee = {
  id: string;
  name: string;
  role: string;
  monthly_salary: number;
  monthly_hours: number;
  created_at: string;
};

export type ServiceStatus = "open" | "completed" | "invoiced";

export type Service = {
  id: string;
  service_no: string | null;
  plate: string | null;
  service_type: string | null;
  service_date: string;
  notes: string | null;
  status: ServiceStatus;
  material_cost: number;
  material_billed: number;
  /** Direct labor revenue. When set, overrides hours × rate calculation. */
  labor_billed: number | null;
  created_at: string;
};

export type TimeEntry = {
  id: string;
  service_id: string;
  employee_id: string;
  entry_date: string;
  hours: number;
  notes: string | null;
  created_at: string;
};

export type FixedExpense = {
  id: string;
  name: string;
  amount_monthly: number;
  created_at: string;
};

export type FixedExpenseHistory = {
  id: string;
  expense_id: string;
  amount: number;
  valid_from: string;
  created_at: string;
};

export type EmployeeSalaryHistory = {
  id: string;
  employee_id: string;
  monthly_salary: number;
  monthly_hours: number;
  valid_from: string;
  created_at: string;
};

export type SettingsHistory = {
  id: string;
  hourly_rate: number;
  valid_from: string;
  created_at: string;
};

export type PeriodType = "day" | "week";

export type FinancialEntry = {
  id: string;
  period_type: PeriodType;
  /** For day entries: the date. For week entries: Monday of the ISO week. */
  date: string;
  revenue: number;
  expenses: number;
  notes: string | null;
  created_at: string;
};

