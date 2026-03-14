export type Employee = {
  id: string;
  name: string;
  role: string;
  monthly_salary: number;
  monthly_hours: number;
  created_at: string;
};

export type Service = {
  id: string;
  service_no: string | null;
  plate: string | null;
  service_type: string | null;
  service_date: string;
  notes: string | null;
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
