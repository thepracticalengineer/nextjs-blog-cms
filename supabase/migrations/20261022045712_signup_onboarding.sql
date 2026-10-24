BEGIN;
-- No backfill: profiles already present at migration time are exempt.
CREATE TABLE public.onboarding_progress (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version = 1),
  step integer NOT NULL DEFAULT 0 CHECK (step BETWEEN 0 AND 2),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  full_name text,
  profile_name text,
  experience text NOT NULL DEFAULT '',
  profession text NOT NULL DEFAULT '',
  referral text NOT NULL DEFAULT '',
  interests uuid[] NOT NULL DEFAULT '{}',
  return_to text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.onboarding_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.onboarding_progress TO authenticated;
CREATE POLICY "Read own onboarding with assurance" ON public.onboarding_progress
  FOR SELECT TO authenticated USING (
    user_id = (SELECT auth.uid()) AND (SELECT auth_private.has_required_assurance())
  );

CREATE FUNCTION auth_private.create_onboarding_progress() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.onboarding_progress(user_id, profile_name) VALUES (NEW.id, NEW.full_name);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION auth_private.create_onboarding_progress() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER create_onboarding_progress AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION auth_private.create_onboarding_progress();

CREATE FUNCTION auth_private.start_onboarding(p_destination text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result public.onboarding_progress;
BEGIN
  IF auth.uid() IS NULL OR NOT auth_private.has_required_assurance() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- This is a preference, never authority. Application revalidates on every use.
  IF p_destination IS NULL OR length(p_destination) > 2048
    OR p_destination !~ '^/(dashboard|blog)(/|[?#]|$)'
    OR p_destination ~ '^/dashboard/onboarding(/|[?#]|$)'
    OR p_destination ~ '[[:cntrl:]\\]' THEN p_destination := '/dashboard'; END IF;
  UPDATE public.onboarding_progress SET return_to = p_destination
    WHERE user_id = auth.uid() AND completed_at IS NULL AND return_to IS NULL;
  SELECT * INTO result FROM public.onboarding_progress WHERE user_id = auth.uid();
  RETURN CASE WHEN result.user_id IS NULL THEN NULL ELSE to_jsonb(result) END;
END;
$$;
REVOKE ALL ON FUNCTION auth_private.start_onboarding(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_private.start_onboarding(text) TO authenticated;
CREATE FUNCTION public.start_onboarding(p_destination text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth_private.start_onboarding(p_destination);
$$;
REVOKE ALL ON FUNCTION public.start_onboarding(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_onboarding(text) TO authenticated;

CREATE FUNCTION auth_private.save_onboarding(p_answers jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
<<saved_answers>>
DECLARE
  progress public.onboarding_progress;
  target_step integer;
  expected_revision integer;
  finish boolean;
  answer_name text;
  original_name text;
  current_name text;
  experience text;
  profession text;
  referral text;
  selected uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT auth_private.has_required_assurance() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO progress FROM public.onboarding_progress WHERE user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Onboarding unavailable' USING ERRCODE = '42501'; END IF;
  expected_revision := (p_answers->>'revision')::integer;
  IF expected_revision IS NULL OR expected_revision <> progress.revision OR progress.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Progress changed. Reload to continue.' USING ERRCODE = '40001';
  END IF;
  target_step := (p_answers->>'step')::integer;
  finish := (p_answers->>'complete')::boolean;
  answer_name := btrim(p_answers->>'full_name');
  original_name := p_answers->>'original_name';
  experience := p_answers->>'experience';
  profession := p_answers->>'profession';
  referral := p_answers->>'referral';
  IF target_step IS NULL OR target_step NOT BETWEEN 0 AND 2 OR target_step > progress.step + 1
    OR finish IS NULL OR (finish AND (target_step <> 2 OR progress.step <> 2))
    OR answer_name IS NULL OR length(answer_name) > 120
    OR experience IS NULL OR experience NOT IN ('', 'learning', 'under-1', '1-3', '3-5', '5-10', '10-plus')
    OR profession IS NULL OR profession NOT IN ('', 'software-engineer', 'engineering-manager', 'founder', 'devops-engineer', 'ai-engineer', 'data-engineer', 'student', 'product-manager', 'designer', 'other')
    OR referral IS NULL OR referral NOT IN ('', 'linkedin', 'github', 'search', 'friend', 'newsletter', 'other', 'unknown')
    OR jsonb_typeof(p_answers->'interests') IS DISTINCT FROM 'array'
    THEN RAISE EXCEPTION 'Invalid onboarding answers' USING ERRCODE = '22023'; END IF;
  IF (target_step > 0 OR finish) AND (answer_name = '' OR experience = '' OR profession = '') THEN
    RAISE EXCEPTION 'Name, experience and profession are required' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_answers->'interests') > 32 THEN
    RAISE EXCEPTION 'Choose at most 32 interests' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT value::uuid), '{}') INTO selected FROM jsonb_array_elements_text(p_answers->'interests');
  IF finish AND EXISTS (SELECT 1 FROM unnest(selected) AS chosen(id) WHERE NOT EXISTS (SELECT 1 FROM public.tags t WHERE t.id = chosen.id AND t.merged_into IS NULL)) THEN
    RAISE EXCEPTION 'Topics changed. Reload available topics.' USING ERRCODE = '22023';
  END IF;
  -- A topic can disappear while the user is on an earlier step. Prune it on
  -- navigation so they can always reach Interests and make a fresh choice.
  IF NOT finish THEN
    SELECT coalesce(array_agg(t.id), '{}') INTO selected FROM public.tags t
      WHERE t.id = ANY(selected) AND t.merged_into IS NULL;
  END IF;
  IF finish AND cardinality(selected) = 0 AND EXISTS (SELECT 1 FROM public.tags WHERE merged_into IS NULL) THEN
    RAISE EXCEPTION 'Choose at least one interest' USING ERRCODE = '22023';
  END IF;
  IF finish THEN
    SELECT full_name INTO current_name FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
    IF current_name IS DISTINCT FROM original_name AND current_name IS DISTINCT FROM answer_name THEN
      RAISE EXCEPTION 'Profile changed. Reload to continue.' USING ERRCODE = '40001';
    END IF;
    UPDATE public.profiles SET full_name = answer_name WHERE id = auth.uid();
  END IF;
  UPDATE public.onboarding_progress SET
    step = target_step, revision = revision + 1, full_name = answer_name, profile_name = original_name,
    experience = saved_answers.experience, profession = saved_answers.profession,
    referral = saved_answers.referral, interests = selected,
    completed_at = CASE WHEN finish THEN now() ELSE NULL END, updated_at = now()
    WHERE user_id = auth.uid() RETURNING * INTO progress;
  RETURN to_jsonb(progress);
END;
$$;
REVOKE ALL ON FUNCTION auth_private.save_onboarding(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auth_private.save_onboarding(jsonb) TO authenticated;
CREATE FUNCTION public.save_onboarding(p_answers jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT auth_private.save_onboarding(p_answers);
$$;
REVOKE ALL ON FUNCTION public.save_onboarding(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_onboarding(jsonb) TO authenticated;
COMMIT;
