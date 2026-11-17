// config/env.ts throws at import time without these. Tests do not contact these services.
process.env.SUPABASE_URL ||= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key";
process.env.AWS_REGION ||= "ca-central-1";
process.env.AWS_S3_RESUME_BUCKET ||= "test-bucket";
process.env.OPENAI_API_KEY ||= "test-key";
