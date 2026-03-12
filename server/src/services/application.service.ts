import { supabase } from "../config/supabase";
import {
  CreateApplicationInput,
  UpdateApplicationInput,
} from "../types/application";

const TABLE = "applications";

export async function createApplication(data: CreateApplicationInput) {
  const { data: result, error } = await supabase
    .from(TABLE)
    .insert({
      company: data.company,
      role: data.role,
      job_description: data.job_description,
      job_url: data.job_url ?? null,

      status: data.status ?? "APPLIED",
      applied_date: data.applied_date ?? null,
      follow_up_date: data.follow_up_date ?? null,

      salary_min: data.salary_min ?? null,
      salary_max: data.salary_max ?? null,

      source: data.source ?? null,
      contact_name: data.contact_name ?? null,
      contact_email: data.contact_email ?? null,

      resume_version: data.resume_version ?? null,

      required_skills: data.required_skills ?? null,
      missing_skills: data.missing_skills ?? null,
      suggestions: data.suggestions ?? null,

      notes: data.notes ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return result;
}

export async function getAllApplications() {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

export async function getApplicationById(id: string) {
  const { data, error } = await supabase
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .single();

  if (error) throw error;
  return data;
}

export async function updateApplication(
  id: string,
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
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteApplication(id: string) {
  const { error } = await supabase.from(TABLE).delete().eq("id", id);

  if (error) throw error;

  return { message: "Application deleted successfully" };
}