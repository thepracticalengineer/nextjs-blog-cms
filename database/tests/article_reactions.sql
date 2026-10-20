-- Run only against a migrated disposable database. All fixtures roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('15300000-0000-4000-8000-000000000001','article-a@example.test'),
 ('15300000-0000-4000-8000-000000000002','article-b@example.test');
INSERT INTO public.posts(id,title,slug,content,status,author_id) VALUES
 ('15300000-0000-4000-8000-000000000010','Public','article-reaction-public','body','published','15300000-0000-4000-8000-000000000001'),
 ('15300000-0000-4000-8000-000000000011','Draft','article-reaction-draft','body','draft','15300000-0000-4000-8000-000000000001');
SET LOCAL ROLE anon;
DO $$ DECLARE s jsonb; BEGIN
 s := public.get_article_reactions('15300000-0000-4000-8000-000000000010');
 ASSERT s = '{"counts":{"love":0,"unicorn":0,"mind_blown":0,"celebrate":0,"fire":0},"selections":[]}'::jsonb, 'Public zero state incorrect';
 ASSERT public.get_article_reactions('15300000-0000-4000-8000-000000000011') IS NULL, 'Draft exposed';
 ASSERT public.get_article_reactions('15300000-0000-4000-8000-000000000099') IS NULL, 'Missing article has counts';
 BEGIN
  PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',true);
  RAISE EXCEPTION 'Guest write allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM * FROM public.article_reactions; RAISE EXCEPTION 'Guest reactor list exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15300000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE s jsonb; BEGIN
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',true);
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',true);
 ASSERT s->'counts'->>'love'='1' AND s->'selections'='["love"]'::jsonb, 'Retry duplicated or toggled';
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','fire',true);
 ASSERT s->'selections' @> '["love","fire"]'::jsonb AND jsonb_array_length(s->'selections')=2, 'Independent types replaced each other';
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000011','love',true); RAISE EXCEPTION 'Draft write allowed';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','invalid',true); RAISE EXCEPTION 'Invalid type accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010',NULL,true); RAISE EXCEPTION 'Null type accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',NULL); RAISE EXCEPTION 'Null desired accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN PERFORM * FROM public.article_reactions; RAISE EXCEPTION 'Reactor list exposed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.article_reactions(post_id,user_id,reaction) VALUES('15300000-0000-4000-8000-000000000010','15300000-0000-4000-8000-000000000002','love'); RAISE EXCEPTION 'Spoofed insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.article_reactions SET reaction='unicorn'; RAISE EXCEPTION 'Direct update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.article_reactions; RAISE EXCEPTION 'Direct delete allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15300000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE s jsonb; BEGIN
 s := public.get_article_reactions('15300000-0000-4000-8000-000000000010');
 ASSERT s->'selections'='[]'::jsonb AND s->'counts'->>'love'='1', 'Own selection privacy failed';
 ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s) k)=ARRAY['counts','selections'], 'Unexpected private fields';
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',true);
 ASSERT s->'counts'->>'love'='2', 'Shared totals incorrect';
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',false);
 s := public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',false);
 ASSERT s->'counts'->>'love'='1' AND s->'selections'='[]'::jsonb, 'Removal/retry changed another reader';
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('15300000-0000-4000-8000-000000000090','15300000-0000-4000-8000-000000000001','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"15300000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.get_article_reactions('15300000-0000-4000-8000-000000000010')->'selections'='[]'::jsonb, 'AAL1 selection leaked';
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','unicorn',true); RAISE EXCEPTION 'MFA bypass';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15300000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.set_article_reaction('15300000-0000-4000-8000-000000000010','unicorn',true);
RESET ROLE;
UPDATE auth_private.article_reaction_budgets SET changes=30 WHERE user_id='15300000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','unicorn',true);
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','mind_blown',true); RAISE EXCEPTION 'Budget bypass';
 EXCEPTION WHEN raise_exception THEN ASSERT SQLERRM='REACTION_RATE_LIMIT', 'Wrong limit error'; END;
END $$;
RESET ROLE;
UPDATE auth_private.article_reaction_budgets SET window_start=now()-interval '2 minutes' WHERE user_id='15300000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.set_article_reaction('15300000-0000-4000-8000-000000000010','mind_blown',true);
SELECT public.set_article_reaction('15300000-0000-4000-8000-000000000010','celebrate',true);
RESET ROLE;
UPDATE public.posts SET status='draft' WHERE id='15300000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.get_article_reactions('15300000-0000-4000-8000-000000000010') IS NULL, 'Unpublished counts exposed';
 BEGIN PERFORM public.set_article_reaction('15300000-0000-4000-8000-000000000010','love',false); RAISE EXCEPTION 'Unpublished removal allowed';
 EXCEPTION WHEN no_data_found THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.posts SET status='published' WHERE id='15300000-0000-4000-8000-000000000010';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT jsonb_array_length(public.get_article_reactions('15300000-0000-4000-8000-000000000010')->'selections')=5, 'Republishing lost reactions';
END $$;
RESET ROLE;
DELETE FROM auth.users WHERE id='15300000-0000-4000-8000-000000000002';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT FROM auth_private.article_reaction_budgets WHERE user_id='15300000-0000-4000-8000-000000000002'), 'Account budget survived';
END $$;
DELETE FROM public.posts WHERE id='15300000-0000-4000-8000-000000000010';
DO $$ BEGIN
 ASSERT NOT EXISTS(SELECT FROM public.article_reactions WHERE post_id='15300000-0000-4000-8000-000000000010'), 'Post cascade failed';
END $$;
ROLLBACK;
