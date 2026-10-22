-- Run only on a disposable migrated database. All fixtures roll back.
BEGIN;
-- A profile without a row models an account that predates rollout.
INSERT INTO auth.users(id,email) VALUES
 ('14600000-0000-4000-8000-000000000001','onboarding-a@example.test'),
 ('14600000-0000-4000-8000-000000000002','onboarding-b@example.test'),
 ('14600000-0000-4000-8000-000000000003','onboarding-existing@example.test');
DELETE FROM public.onboarding_progress WHERE user_id = '14600000-0000-4000-8000-000000000003';
INSERT INTO public.tags(id,name,slug) VALUES ('14600000-0000-4000-8000-000000000010','Onboarding SQL topic','onboarding-sql-topic');
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.onboarding_progress WHERE user_id IN ('14600000-0000-4000-8000-000000000001','14600000-0000-4000-8000-000000000002')) = 2, 'Future accounts not eligible';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM * FROM public.onboarding_progress; RAISE EXCEPTION 'Anonymous read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.start_onboarding('/blog'); RAISE EXCEPTION 'Anonymous initialization allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE s jsonb; answers jsonb; BEGIN
 ASSERT (SELECT count(*) FROM public.onboarding_progress) = 1, 'Other users progress exposed';
 BEGIN UPDATE public.onboarding_progress SET completed_at = now(); RAISE EXCEPTION 'Direct completion allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.onboarding_progress; RAISE EXCEPTION 'Direct exemption allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 s := public.start_onboarding('/blog/article#comments');
 ASSERT s->>'return_to' = '/blog/article#comments', 'Destination lost';
 s := public.start_onboarding('/dashboard/admin');
 ASSERT s->>'return_to' = '/blog/article#comments', 'Original destination overwritten';
 answers := '{"full_name":"Jane","original_name":null,"experience":"1-3","profession":"software-engineer","referral":"","interests":[],"step":1,"revision":0,"complete":false}';
 BEGIN PERFORM public.save_onboarding(answers || '{"profession":"admin"}'); RAISE EXCEPTION 'Invalid profession accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.save_onboarding(answers || '{"step":2}'); RAISE EXCEPTION 'Step bypass accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 s := public.save_onboarding(answers);
 ASSERT s->>'revision' = '1' AND s->>'step' = '1', 'Progress not saved';
 BEGIN PERFORM public.save_onboarding(answers); RAISE EXCEPTION 'Stale save accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 s := public.save_onboarding(answers || '{"step":2,"revision":1}');
 BEGIN PERFORM public.save_onboarding(answers || '{"step":2,"revision":2,"complete":true}'); RAISE EXCEPTION 'Empty interests accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.save_onboarding(answers || '{"step":2,"revision":2,"complete":true,"interests":["14600000-0000-4000-8000-000000000099"]}'); RAISE EXCEPTION 'Unknown topic accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 ASSERT (SELECT full_name IS NULL FROM public.profiles WHERE id = auth.uid()), 'Failed completion overwrote profile';
 s := public.save_onboarding(answers || '{"step":2,"revision":2,"complete":true,"interests":["14600000-0000-4000-8000-000000000010"]}');
 ASSERT s->>'completed_at' IS NOT NULL, 'Completion missing';
 ASSERT (SELECT full_name = 'Jane' AND role = 'author' FROM public.profiles WHERE id = auth.uid()), 'Name or permission role incorrect';
 BEGIN PERFORM public.save_onboarding(answers || '{"revision":3}'); RAISE EXCEPTION 'Completion overwritten'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.start_onboarding('/blog') IS NULL, 'Existing account enrolled';
 BEGIN PERFORM public.save_onboarding('{}'); RAISE EXCEPTION 'Existing account enrolled by save'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 ('14600000-0000-4000-8000-000000000090','14600000-0000-4000-8000-000000000002','Test','totp','verified','test',now(),now());
SELECT set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.onboarding_progress) = 0, 'MFA private read bypass';
 BEGIN PERFORM public.start_onboarding('/blog'); RAISE EXCEPTION 'MFA bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.save_onboarding('{}'); RAISE EXCEPTION 'MFA save bypass'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT public.start_onboarding('//evil.test')->>'return_to' = '/dashboard', 'Unsafe destination accepted';
 ASSERT (SELECT count(*) FROM public.onboarding_progress) = 1, 'MFA owner access missing';
 ASSERT public.save_onboarding('{"full_name":"Second","original_name":null,"experience":"learning","profession":"student","referral":"","interests":["14600000-0000-4000-8000-000000000099"],"step":1,"revision":0,"complete":false}')->'interests' = '[]'::jsonb, 'Unavailable topics trapped navigation';
END $$;
DO $$ DECLARE answers jsonb; BEGIN
 answers := '{"full_name":"Second","original_name":null,"experience":"learning","profession":"student","referral":"","interests":["14600000-0000-4000-8000-000000000010"],"step":2,"revision":1,"complete":false}';
 PERFORM public.save_onboarding(answers);
 UPDATE public.profiles SET full_name = 'Edited elsewhere' WHERE id = auth.uid();
 BEGIN PERFORM public.save_onboarding(answers || '{"revision":2,"complete":true}'); RAISE EXCEPTION 'Concurrent profile edit overwritten'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 ASSERT (SELECT completed_at IS NULL AND revision = 2 FROM public.onboarding_progress WHERE user_id = auth.uid()), 'Failed completion changed progress';
 ASSERT (SELECT full_name = 'Edited elsewhere' FROM public.profiles WHERE id = auth.uid()), 'Failed completion changed profile';
END $$;
RESET ROLE;
-- Disposable fixture taxonomy only; this block and all modifications roll back.
DELETE FROM public.tags;
INSERT INTO auth.users(id,email) VALUES ('14600000-0000-4000-8000-000000000004','onboarding-empty@example.test');
SELECT set_config('request.jwt.claims','{"sub":"14600000-0000-4000-8000-000000000004","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE answers jsonb; result jsonb; BEGIN
 answers := '{"full_name":"Empty Topics","original_name":null,"experience":"learning","profession":"student","referral":"","interests":[],"step":1,"revision":0,"complete":false}';
 PERFORM public.save_onboarding(answers);
 PERFORM public.save_onboarding(answers || '{"step":2,"revision":1}');
 result := public.save_onboarding(answers || '{"step":2,"revision":2,"complete":true}');
 ASSERT result->>'completed_at' IS NOT NULL AND result->'interests' = '[]'::jsonb, 'Empty taxonomy blocked completion';
END $$;
RESET ROLE;
ROLLBACK;
