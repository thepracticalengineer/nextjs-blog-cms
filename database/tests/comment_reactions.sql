-- Disposable migrated database only. Fixtures and mutations roll back.
BEGIN;
INSERT INTO auth.users (id, email) VALUES
 ('15900000-0000-4000-8000-000000000001', 'reaction-a@example.test'),
 ('15900000-0000-4000-8000-000000000002', 'reaction-b@example.test');
INSERT INTO public.posts (id,title,slug,content,status,author_id) VALUES
 ('15900000-0000-4000-8000-000000000010','Public','reaction-public','body','published','15900000-0000-4000-8000-000000000001'),
 ('15900000-0000-4000-8000-000000000011','Hidden','reaction-hidden','body','draft','15900000-0000-4000-8000-000000000001');
INSERT INTO public.comments (id,post_id,author_id,content) VALUES
 ('15900000-0000-4000-8000-000000000020','15900000-0000-4000-8000-000000000010','15900000-0000-4000-8000-000000000001','comment'),
 ('15900000-0000-4000-8000-000000000021','15900000-0000-4000-8000-000000000011','15900000-0000-4000-8000-000000000001','hidden');
SET LOCAL ROLE anon;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010')) = 1, 'Zero state missing';
 ASSERT NOT EXISTS (SELECT FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000011')), 'Hidden comment exposed';
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
  RAISE EXCEPTION 'Guest write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
 ASSERT result->>'selection' = 'like' AND result->'counts'->>'like' = '1', 'Add failed';
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
 ASSERT result->'counts'->>'like' = '1', 'Retry duplicated/toggled';
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','love');
 ASSERT result->>'selection' = 'love' AND result->'counts'->>'like' = '0', 'Replace failed';
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000021','like');
  RAISE EXCEPTION 'Hidden comment writable';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000020','invalid');
  RAISE EXCEPTION 'Invalid reaction accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM * FROM public.comment_reactions;
  RAISE EXCEPTION 'Reactor list exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.comment_reactions(comment_id,user_id,reaction) VALUES ('15900000-0000-4000-8000-000000000020','15900000-0000-4000-8000-000000000002','like');
  RAISE EXCEPTION 'Direct spoofed write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15900000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 ASSERT (SELECT selection IS NULL FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010')), 'Another user selection exposed';
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','love');
 ASSERT result->'counts'->>'love' = '2', 'Other reader aggregate incorrect';
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020',NULL);
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020',NULL);
 ASSERT result->>'selection' IS NULL AND result->'counts'->>'love' = '1', 'Remove/retry changed another user';
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('15900000-0000-4000-8000-000000000090','15900000-0000-4000-8000-000000000001','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"15900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT selection IS NULL FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010')), 'AAL1 private selection exposed';
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
  RAISE EXCEPTION 'MFA bypass';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','insightful');
 ASSERT result->>'selection' = 'insightful', 'AAL2 denied';
END $$;
RESET ROLE;
-- State persists between independent calls; exceeding the shared budget cannot
-- change it, and a no-op retry remains safe at the limit.
UPDATE auth_private.comment_reaction_budgets SET changes=30 WHERE user_id='15900000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; BEGIN
 result := public.set_comment_reaction('15900000-0000-4000-8000-000000000020','insightful');
 ASSERT result->>'selection'='insightful', 'No-op retry at limit failed';
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
  RAISE EXCEPTION 'Budget bypass';
 EXCEPTION WHEN raise_exception THEN
  ASSERT SQLERRM='REACTION_RATE_LIMIT', 'Unexpected rate failure';
 END;
END $$;
RESET ROLE;
UPDATE auth_private.comment_reaction_budgets SET window_start=now()-interval '2 minutes' WHERE user_id='15900000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.set_comment_reaction('15900000-0000-4000-8000-000000000020','celebrate');
RESET ROLE;
-- Unpublication must hide previously collected counts even from its owner.
UPDATE public.posts SET status='draft' WHERE id='15900000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010')), 'Unpublished counts exposed';
END $$;
RESET ROLE;
UPDATE public.posts SET status='published' WHERE id='15900000-0000-4000-8000-000000000010';
DELETE FROM public.comments WHERE id = '15900000-0000-4000-8000-000000000020';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.set_comment_reaction('15900000-0000-4000-8000-000000000020','like');
  RAISE EXCEPTION 'Deleted comment accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT FROM public.comment_reactions WHERE comment_id='15900000-0000-4000-8000-000000000020'), 'Deleted reactions survived';
 ASSERT (SELECT role='author' FROM public.profiles WHERE id='15900000-0000-4000-8000-000000000002'), 'Reacting changed permissions';
END $$;
-- More than PostgREST's maximum must select the same oldest-first window.
INSERT INTO public.comments(id,post_id,author_id,content,created_at)
SELECT ('15900000-0000-4000-8001-' || lpad(i::text,12,'0'))::uuid,
 '15900000-0000-4000-8000-000000000010','15900000-0000-4000-8000-000000000001','window',
 '2020-01-01'::timestamptz + i*interval '1 second' FROM generate_series(1,1005) i;
SET LOCAL ROLE anon;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010'))=1000, 'Unbounded reaction window';
 ASSERT EXISTS(SELECT FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010') WHERE comment_id='15900000-0000-4000-8001-000000000001'), 'Oldest comment missing';
 ASSERT NOT EXISTS(SELECT FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010') WHERE comment_id='15900000-0000-4000-8001-000000001001'), 'Comment windows disagree';
 ASSERT EXISTS(SELECT FROM public.get_comment_reactions('15900000-0000-4000-8000-000000000010','15900000-0000-4000-8001-000000001005')), 'Single comment lookup truncated';
END $$;
RESET ROLE;
ROLLBACK;
