import { supabase } from "../config/supabase";
import {
  APPLICATION_STATUSES,
  ApplicationStatus,
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../types/application";
import { ApiError } from "../utils/apiError";

const UPDATABLE_FIELDS = [
  "resume_id",
  "company",
  "role",
  "job_description",
  "job_url",
  "source",
  "status",
  "applied_date",
  "follow_up_date",
  "salary_min",
  "salary_max",
  "contact_name",
  "contact_email",
  "notes",
] as const;

const TABLE = "applications";
const ACTIVE_VIEW = "active_applications";

export async function createApplication(data: CreateApplicationInput) {
  const { data: result, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: data.user_id,
      resume_id: data.resume_id ?? null,

      company: data.company,
      role: data.role,
      job_description: data.job_description,
      job_url: data.job_url ?? null,
      source: data.source ?? null,

      status: data.status ?? "APPLIED",
      applied_date: data.applied_date ?? null,
      follow_up_date: data.follow_up_date ?? null,

      salary_min: data.salary_min ?? null,
      salary_max: data.salary_max ?? null,

      contact_name: data.contact_name ?? null,
      contact_email: data.contact_email ?? null,

      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function getAllApplications(userId: string) {
  const { data, error } = await supabase
    .from(ACTIVE_VIEW)
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getApplicationById(id: string, userId: string) {
  const { data, error } = await supabase
    .from(ACTIVE_VIEW)
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (error) throw error;
  return data;
}

export async function updateApplication(
  id: string,
  userId: string,
  updates: UpdateApplicationInput
) {
  // Only whitelisted fields are copied, so a client cannot overwrite user_id, id or deleted_at.
  const payload: Record<string, unknown> = {};

  for (const key of UPDATABLE_FIELDS) {
    const value = (updates as Record<string, unknown>)[key];
    if (value !== undefined) {
      payload[key] = value;
    }
  }

  const status = payload.status;

  if (status !== undefined && !APPLICATION_STATUSES.includes(status as ApplicationStatus)) {
    throw new ApiError(400, `Invalid status "${String(status)}"`);
  }

  if (Object.keys(payload).length === 0) {
    throw new ApiError(400, "No updatable fields provided");
  }

  const { data, error } = await supabase
    .from(TABLE)
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteApplication(id: string, userId: string) {
  const { error } = await supabase
    .from(TABLE)
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;

  return { message: "Application deleted successfully" };
}