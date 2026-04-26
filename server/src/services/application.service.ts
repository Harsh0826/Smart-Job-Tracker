import { supabase } from "../config/supabase";
import {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../types/application";

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
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      payload[key] = value;
    }
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