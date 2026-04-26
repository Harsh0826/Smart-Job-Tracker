export type ApplicationStatus =
  | "SAVED"
  | "APPLIED"
  | "PHONE_SCREEN"
  | "INTERVIEW"
  | "TECHNICAL"
  | "OFFER"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "GHOSTED";

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

export interface CreateApplicationInput {
  user_id: string;
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

export interface UpdateApplicationInput {
  resume_id?: number | null;

  company?: string;
  role?: string;
  job_description?: string;
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


export interface Resume {
  id: string;
  application_id: string;
  user_id: string;

  version_label: string;        // e.g. "v1", "tailored-jan"
  is_primary: boolean;

  // File storage
  file_name: string;
  file_key: string | null;      // S3 object key
  file_url: string | null;      // pre-signed or public URL
  file_size_bytes: number | null;
  mime_type: string;
  storage_source: "UPLOAD" | "S3" | "GDRIVE" | "URL";

  // Parsed text (populated by background job)
  parsed_text: string | null;
  parsed_at: string | null;

  uploaded_at: string;
  created_at: string;
  updated_at: string;
}
export interface AIFeedback {
  id: string;
  application_id: string;
  resume_id: string | null;     // null if JD-only analysis

  match_score: number | null;   // 0–100

  // Structured AI output
  required_skills: string[] | null;
  missing_skills: string[]  | null;
  matched_skills: string[]  | null;
  suggestions: string[]     | null;
  keyword_gaps: string[]    | null;
  summary: string | null;

  // Model metadata
  model_name: string | null;
  prompt_version: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;

  triggered_by: "user" | "auto" | "webhook" | null;
  run_at: string;
}

// Mirrors the v_applications_latest_feedback DB view
// Use this for dashboard lists and detail pages
export interface ApplicationWithDetails extends Application {
  // Latest AI feedback (null if never analyzed)
  latest_feedback: AIFeedback | null;

  // Primary resume (null if none uploaded)
  primary_resume: Resume | null;
}

export interface CreateResumeInput {
  application_id: string;
  version_label?: string;       // defaults to "v1"
  is_primary?: boolean;         // defaults to true

  file_name: string;
  file_key?: string | null;
  file_url?: string | null;
  file_size_bytes?: number | null;
  mime_type?: string;
  storage_source?: "UPLOAD" | "S3" | "GDRIVE" | "URL";
}