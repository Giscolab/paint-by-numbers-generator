-- Harden access to legacy tables. The current image-processing UI does not
-- query image_jobs or profiles; anonymous reads are not required.
-- Keep authenticated users' access scoped to their own rows.
BEGIN;

ALTER TABLE public.image_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view jobs" ON public.image_jobs;
DROP POLICY IF EXISTS "Anyone can create jobs" ON public.image_jobs;
DROP POLICY IF EXISTS "Anonymous users can view unowned jobs" ON public.image_jobs;

DROP POLICY IF EXISTS "Users can view own jobs" ON public.image_jobs;
CREATE POLICY "Users can view own jobs"
  ON public.image_jobs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own jobs" ON public.image_jobs;
CREATE POLICY "Users can insert own jobs"
  ON public.image_jobs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own jobs" ON public.image_jobs;
CREATE POLICY "Users can update own jobs"
  ON public.image_jobs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own jobs" ON public.image_jobs;
CREATE POLICY "Users can delete own jobs"
  ON public.image_jobs FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Profiles: Select own" ON public.profiles;
CREATE POLICY "Profiles: Select own"
  ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles: Update own" ON public.profiles;
CREATE POLICY "Profiles: Update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Explicit revocation is defense-in-depth; RLS also prevents anonymous access.
REVOKE ALL ON TABLE public.image_jobs FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;

COMMIT;
