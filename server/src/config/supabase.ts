import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

export const supabase = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey
);

if (!env.supabaseUrl || !env.supabaseServiceRoleKey) {
  throw new Error(
    "Supabase URL and Service Role Key must be set in environment variables"
  );
}