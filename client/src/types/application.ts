export const APPLICATION_STATUSES = [
  "SAVED",
  "APPLIED",
  "PHONE_SCREEN",
  "INTERVIEW",
  "TECHNICAL",
  "OFFER",
  "ACCEPTED",
  "REJECTED",
  "WITHDRAWN",
  "GHOSTED",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  user_id: string;
  resume_id: number | null;

  company: string;
  role: string;
  job_description: string;
  job_url: string | null;
  source: string | null;

  status: ApplicationStatus;
  applied_date: string | null;
  follow_up_date: string | null;

  salary_min: number | null;
  salary_max: number | null;

  contact_name: string | null;
  contact_email: string | null;

  notes: string | null;

  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateApplicationPayload {
  resume_id?: number | null;

  company: string;
  role: string;
  job_description: string;
  job_url?: string | null;
  source?: string | null;

  status?: ApplicationStatus;
  applied_date?: string | null;
  follow_up_date?: string | null;

  salary_min?: number | null;
  salary_max?: number | null;

  contact_name?: string | null;
  contact_email?: string | null;

  notes?: string | null;
}

export type UpdateApplicationPayload = Partial<CreateApplicationPayload>;

export interface Resume {
  id: number;
  user_id: string;
  file_name: string;
  file_key: string;
  label: string | null;
  is_active: boolean;
  created_at: string;
}
