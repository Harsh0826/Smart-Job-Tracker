export const APPLICATION_STATUSES = [
  "APPLIED",
  "SCREENING",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "GHOSTED",
  "WITHDRAWN",
] as const;

export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application {
  id: string;
  company: string;
  role: string;
  job_description: string;
  job_url: string | null;

  status: ApplicationStatus;
  applied_date: string | null;
  follow_up_date: string | null;

  salary_min: number | null;
  salary_max: number | null;

  source: string | null;
  contact_name: string | null;
  contact_email: string | null;

  resume_version: string | null;

  required_skills: string[] | null;
  missing_skills: string[] | null;
  suggestions: string[] | null;

  notes: string | null;

  created_at: string;
  updated_at: string;
}

export interface CreateApplicationPayload {
  company: string;
  role: string;
  job_description: string;
  job_url?: string | null;

  status?: ApplicationStatus;
  applied_date?: string | null;
  follow_up_date?: string | null;

  salary_min?: number | null;
  salary_max?: number | null;

  source?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;

  resume_version?: string | null;

  required_skills?: string[] | null;
  missing_skills?: string[] | null;
  suggestions?: string[] | null;

  notes?: string | null;
}

export interface UpdateApplicationPayload {
  company?: string;
  role?: string;
  job_description?: string;
  job_url?: string | null;

  status?: ApplicationStatus;
  applied_date?: string | null;
  follow_up_date?: string | null;

  salary_min?: number | null;
  salary_max?: number | null;

  source?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;

  resume_version?: string | null;

  required_skills?: string[] | null;
  missing_skills?: string[] | null;
  suggestions?: string[] | null;

  notes?: string | null;
}