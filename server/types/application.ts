export type ApplicationStatus =
  | "APPLIED"
  | "SCREENING"
  | "INTERVIEW"
  | "OFFER"
  | "REJECTED"
  | "GHOSTED"
  | "WITHDRAWN";

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

export interface CreateApplicationInput {
  company: string;
  role: string;
  job_description: string;
  job_url?: string;

  status?: ApplicationStatus;
  applied_date?: string;
  follow_up_date?: string;

  salary_min?: number;
  salary_max?: number;

  source?: string;
  contact_name?: string;
  contact_email?: string;

  resume_version?: string;

  required_skills?: string[];
  missing_skills?: string[];
  suggestions?: string[];

  notes?: string;
}

export interface UpdateApplicationInput {
  company?: string;
  role?: string;
  job_description?: string;
  job_url?: string;

  status?: ApplicationStatus;
  applied_date?: string;
  follow_up_date?: string;

  salary_min?: number;
  salary_max?: number;

  source?: string;
  contact_name?: string;
  contact_email?: string;

  resume_version?: string;

  required_skills?: string[];
  missing_skills?: string[];
  suggestions?: string[];

  notes?: string;
}