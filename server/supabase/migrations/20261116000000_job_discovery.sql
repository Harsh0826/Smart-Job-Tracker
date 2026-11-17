-- Job discovery, master resume, tailored resumes and application audit trail.
--
-- Additive only: no existing column, row or view is changed or dropped, except that the
-- applications.status allowed-value list is extended with new lifecycle values.
-- Written defensively because the live schema is managed in Supabase, not in this repo:
--   * applications.status may be a Postgres enum or text with a CHECK constraint
--   * applications.id may be uuid or bigint — new FKs copy its actual type
-- Safe to re-run.

-- 1. Extend the application lifecycle --------------------------------------------------------------
DO $$
DECLARE
  col_type text;
  col_udt  text;
  con      record;
  v        text;
  all_vals text[] := ARRAY[
    -- existing values (server/src/types/application.ts)
    'SAVED','APPLIED','PHONE_SCREEN','INTERVIEW','TECHNICAL','OFFER','ACCEPTED','REJECTED','WITHDRAWN','GHOSTED',
    -- legacy value still referenced by the old analytics code
    'SCREENING',
    -- new lifecycle values
    'DISCOVERED','UNDER_REVIEW','READY_TO_APPLY','ASSESSMENT','FINAL_INTERVIEW','EXPIRED'
  ];
BEGIN
  SELECT data_type, udt_name INTO col_type, col_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'applications' AND column_name = 'status';

  IF col_type IS NULL THEN
    RAISE EXCEPTION 'public.applications.status not found — is this the Smart Job Tracker database?';
  END IF;

  IF col_type = 'USER-DEFINED' THEN
    FOREACH v IN ARRAY all_vals LOOP
      EXECUTE format('ALTER TYPE public.%I ADD VALUE IF NOT EXISTS %L', col_udt, v);
    END LOOP;
  ELSE
    FOR con IN
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = 'applications' AND c.contype = 'c'
        AND pg_get_constraintdef(c.oid) ILIKE '%status%'
    LOOP
      EXECUTE format('ALTER TABLE public.applications DROP CONSTRAINT %I', con.conname);
    END LOOP;
    EXECUTE format(
      'ALTER TABLE public.applications ADD CONSTRAINT applications_status_check CHECK (status IN (%s)) NOT VALID',
      (SELECT string_agg(quote_literal(x), ',') FROM unnest(all_vals) x)
    );
    BEGIN
      ALTER TABLE public.applications VALIDATE CONSTRAINT applications_status_check;
    EXCEPTION WHEN check_violation THEN
      RAISE NOTICE 'Some existing applications have a status outside the list; constraint left NOT VALID (applies to new writes only).';
    END;
  END IF;
END $$;

-- 2. Master resume (source of truth) ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.master_profiles (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version          integer NOT NULL,
  profile          jsonb NOT NULL,          -- career-copilot CareerProfile JSON
  source_file_name text,
  is_current       boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS master_profiles_one_current
  ON public.master_profiles (user_id) WHERE is_current;

-- 3. Discovery runs --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovery_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trigger           text NOT NULL CHECK (trigger IN ('manual','scheduled','cli')),
  status            text NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed')),
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  window_hours      integer NOT NULL DEFAULT 24,
  threshold         integer NOT NULL DEFAULT 70,
  boards_queried    integer,
  postings_fetched  integer,
  shortlisted_count integer,
  rejected_counts   jsonb,
  board_errors      jsonb,
  error             text
);
CREATE INDEX IF NOT EXISTS discovery_runs_user_started ON public.discovery_runs (user_id, started_at DESC);

-- 4. Discovered jobs -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.discovered_jobs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_run_id              uuid REFERENCES public.discovery_runs(id) ON DELETE SET NULL,
  provider                 text NOT NULL CHECK (provider IN ('greenhouse','lever','ashby')),
  board_token              text NOT NULL,
  external_id              text NOT NULL,
  requisition_id           text,
  title                    text NOT NULL,
  company                  text NOT NULL,
  company_website          text,
  location                 text,
  locations                text[] NOT NULL DEFAULT '{}',
  country                  text,
  work_arrangement         text NOT NULL DEFAULT 'unknown' CHECK (work_arrangement IN ('remote','hybrid','onsite','unknown')),
  employment_type          text,
  posted_at                timestamptz,        -- original publish time; NULL = unverified
  posted_at_source         text,               -- which provider field it came from
  source_updated_at        timestamptz,        -- provider last-modified; never used as posting date
  first_seen_at            timestamptz NOT NULL DEFAULT now(),
  last_seen_at             timestamptz NOT NULL DEFAULT now(),
  last_verified_at         timestamptz NOT NULL DEFAULT now(),
  salary_min               numeric,
  salary_max               numeric,
  salary_currency          text,
  description              text,               -- exact text that was scored (kept for tailoring)
  source_url               text NOT NULL,
  apply_url                text NOT NULL,
  canonical_url            text NOT NULL,
  canonical_apply_url      text,
  fingerprint              text NOT NULL,
  applicant_count          integer,            -- NULL = unknown; public APIs never expose it
  freshness_status         text NOT NULL CHECK (freshness_status IN ('fresh','stale','unverified','invalid')),
  age_hours_at_discovery   numeric,
  match_score              integer CHECK (match_score BETWEEN 0 AND 100),
  score_breakdown          jsonb,
  required_skills          text[] NOT NULL DEFAULT '{}',
  preferred_skills         text[] NOT NULL DEFAULT '{}',
  matched_skills           text[] NOT NULL DEFAULT '{}',
  missing_required_skills  text[] NOT NULL DEFAULT '{}',
  missing_preferred_skills text[] NOT NULL DEFAULT '{}',
  work_auth_flags          text[] NOT NULL DEFAULT '{}',
  rejection_reason         text,
  rejection_detail         text,
  shortlisted              boolean NOT NULL DEFAULT false,
  listing_status           text NOT NULL DEFAULT 'open' CHECK (listing_status IN ('open','closed')),
  archived_at              timestamptz,
  UNIQUE (user_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS discovered_jobs_fingerprint ON public.discovered_jobs (user_id, fingerprint);
CREATE INDEX IF NOT EXISTS discovered_jobs_url ON public.discovered_jobs (user_id, canonical_url);
CREATE INDEX IF NOT EXISTS discovered_jobs_shortlist ON public.discovered_jobs (user_id, shortlisted, posted_at DESC);

-- application_id uses whatever type applications.id actually has.
DO $$
DECLARE id_type text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'discovered_jobs' AND column_name = 'application_id') THEN
    SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.applications'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
    EXECUTE format('ALTER TABLE public.discovered_jobs ADD COLUMN application_id %s REFERENCES public.applications(id) ON DELETE SET NULL', id_type);
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS discovered_jobs_application ON public.discovered_jobs (application_id) WHERE application_id IS NOT NULL';
  END IF;
END $$;

-- 5. Tailored resumes (versioned; never overwritten) ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tailored_resumes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  discovered_job_id uuid NOT NULL REFERENCES public.discovered_jobs(id) ON DELETE CASCADE,
  master_profile_id uuid REFERENCES public.master_profiles(id) ON DELETE SET NULL,
  version           integer NOT NULL,
  resume            jsonb NOT NULL,
  markdown          text,
  ats_report        jsonb,
  verification      jsonb,
  file_keys         jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {"md": "...", "docx": "...", "pdf": "..."}
  approved_at       timestamptz,                         -- set only by the user
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (discovered_job_id, version)
);

-- 6. Application audit trail ------------------------------------------------------------------------
DO $$
DECLARE id_type text;
BEGIN
  IF to_regclass('public.application_events') IS NULL THEN
    SELECT format_type(a.atttypid, a.atttypmod) INTO id_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.applications'::regclass AND a.attname = 'id' AND NOT a.attisdropped;
    EXECUTE format($f$
      CREATE TABLE public.application_events (
        id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id %s NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
        user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        event_type     text NOT NULL,     -- created_from_discovery | status_changed | resume_approved | ...
        from_status    text,
        to_status      text,
        detail         jsonb,
        created_at     timestamptz NOT NULL DEFAULT now()
      )$f$, id_type);
    CREATE INDEX application_events_app ON public.application_events (application_id, created_at DESC);
  END IF;
END $$;

-- 7. Row-level security (the API uses the service role; these protect direct client access) ---------
ALTER TABLE public.master_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovery_runs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discovered_jobs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tailored_resumes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['master_profiles','discovery_runs','discovered_jobs','tailored_resumes','application_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_owner') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t || '_owner', t);
    END IF;
  END LOOP;
END $$;

-- 8. Promote a discovered job into the tracker atomically --------------------------------------------
-- Idempotent: returns the existing application if the job is already linked, and links (instead of
-- duplicating) an existing tracker row with the same job URL.
CREATE OR REPLACE FUNCTION public.promote_discovered_job(p_job_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  j      public.discovered_jobs%ROWTYPE;
  app_id public.applications.id%TYPE;
  created boolean := false;
BEGIN
  SELECT * INTO j FROM public.discovered_jobs WHERE id = p_job_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Discovered job not found' USING ERRCODE = 'P0002';
  END IF;

  IF j.application_id IS NOT NULL THEN
    RETURN jsonb_build_object('application_id', j.application_id, 'created', false);
  END IF;

  SELECT a.id INTO app_id
  FROM public.applications a
  WHERE a.user_id = p_user_id AND a.deleted_at IS NULL
    AND a.job_url IS NOT NULL AND a.job_url IN (j.apply_url, j.source_url)
  LIMIT 1;

  IF app_id IS NULL THEN
    INSERT INTO public.applications (user_id, company, role, job_description, job_url, source, status, salary_min, salary_max, notes)
    VALUES (
      p_user_id, j.company, j.title, COALESCE(j.description, ''), j.apply_url, 'discovery:' || j.provider,
      'DISCOVERED', j.salary_min, j.salary_max,
      format('Auto-discovered. Match score %s/100. Posted %s (%s). Applicants: unknown.',
             COALESCE(j.match_score::text, 'n/a'),
             COALESCE(to_char(j.posted_at AT TIME ZONE 'America/Toronto', 'YYYY-MM-DD HH24:MI "ET"'), 'unverified'),
             COALESCE(j.posted_at_source, 'no source date'))
    )
    RETURNING id INTO app_id;
    created := true;
  END IF;

  UPDATE public.discovered_jobs SET application_id = app_id WHERE id = j.id;

  INSERT INTO public.application_events (application_id, user_id, event_type, to_status, detail)
  VALUES (app_id, p_user_id, CASE WHEN created THEN 'created_from_discovery' ELSE 'linked_to_discovery' END,
          CASE WHEN created THEN 'DISCOVERED' END,
          jsonb_build_object('discovered_job_id', j.id, 'match_score', j.match_score));

  RETURN jsonb_build_object('application_id', app_id, 'created', created);
END $$;

REVOKE ALL ON FUNCTION public.promote_discovered_job(uuid, uuid) FROM PUBLIC, anon, authenticated;
