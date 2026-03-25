import dotenv from "dotenv";

dotenv.config();

export const env = {
  port: process.env.PORT || "5000",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  openAIApiKey: process.env.OPENAI_API_KEY || "",
  awsRegion: process.env.AWS_REGION || "",
  awsS3ResumeBucket: process.env.AWS_S3_RESUME_BUCKET || "",
};

if (!env.supabaseUrl) {
  throw new Error("Missing SUPABASE_URL");
}

if (!env.supabaseServiceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

if (!env.awsRegion) {
  throw new Error("Missing AWS_REGION");
}

if (!env.awsS3ResumeBucket) {
  throw new Error("Missing AWS_S3_RESUME_BUCKET");
}
if (!env.openAIApiKey) {
  throw new Error("Missing OPENAI_API_KEY");
}