-- Designated disposable migrated database only; all fixtures roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('15700000-0000-4000-8000-000000000001','comment-a@example.test'),
 ('15700000-0000-4000-8000-000000000002','comment-b@example.test');
INSERT INTO public.posts(id,title,slug,content,status,author_id) VALUES
 ('15700000-0000-4000-8000-000000000010','Public','comment-public','body','published','15700000-0000-4000-8000-000000000001'),
 ('15700000-0000-4000-8000-000000000011','Draft','comment-draft','body','draft','15700000-0000-4000-8000-000000000001');
DO $$ BEGIN
 ASSERT NOT has_table_privilege('anon','public.comments','TRUNCATE'), 'Guest truncate grant';
 ASSERT NOT has_table_privilege('authenticated','public.comments','TRUNCATE'), 'Authenticated truncate grant';
 ASSERT NOT has_table_privilege('authenticated','public.comments','TRIGGER'), 'Authenticated trigger grant';
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','hello',gen_random_uuid());
  RAISE EXCEPTION 'Guest RPC allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.comments(post_id,author_id,content) VALUES('15700000-0000-4000-8000-000000000010','15700000-0000-4000-8000-000000000001','bypass');
  RAISE EXCEPTION 'Guest insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15700000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE first_id text; result jsonb; detail text; BEGIN
 BEGIN
  INSERT INTO public.comments(post_id,author_id,content) VALUES('15700000-0000-4000-8000-000000000010','15700000-0000-4000-8000-000000000001','bypass');
  RAISE EXCEPTION 'Direct insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE public.comments SET content='bypass';
  RAISE EXCEPTION 'Direct update allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM auth_private.comment_write_receipts;
  RAISE EXCEPTION 'Private receipts readable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010',U&'\0009\00A0\FEFF',gen_random_uuid());
  RAISE EXCEPTION 'Whitespace accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010',repeat('a',2001),gen_random_uuid());
  RAISE EXCEPTION 'Overlength accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','hello',NULL);
  RAISE EXCEPTION 'Null ID accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000011','hello',gen_random_uuid());
  RAISE EXCEPTION 'Draft accepted';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 result := public.create_comment('15700000-0000-4000-8000-000000000010',E' \r\nhello\rworld\t','15700000-0000-4000-8000-000000000020');
 first_id := result->>'id';
 ASSERT (SELECT content=E'hello\nworld' AND author_id=auth.uid() FROM public.comments WHERE id=first_id::uuid), 'Normalization or identity mismatch';
 ASSERT public.create_comment('15700000-0000-4000-8000-000000000010',E'hello\nworld','15700000-0000-4000-8000-000000000020')->>'id'=first_id, 'Retry duplicated';
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','changed','15700000-0000-4000-8000-000000000020');
  RAISE EXCEPTION 'Payload conflict accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='COMMENT_REQUEST_CONFLICT'; END;
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000011',E'hello\nworld','15700000-0000-4000-8000-000000000020');
  RAISE EXCEPTION 'Post conflict accepted';
 EXCEPTION WHEN check_violation THEN ASSERT SQLERRM='COMMENT_REQUEST_CONFLICT'; END;
 ASSERT public.create_comment('15700000-0000-4000-8000-000000000010',E'hello\nworld',gen_random_uuid())->>'id'<>first_id, 'Intentional identical text blocked';
 PERFORM public.create_comment('15700000-0000-4000-8000-000000000010',repeat('😀',2000),gen_random_uuid());
 PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','four',gen_random_uuid());
 PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','five',gen_random_uuid());
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','six',gen_random_uuid());
  RAISE EXCEPTION 'Minute limit bypass';
 EXCEPTION WHEN raise_exception THEN
  ASSERT SQLERRM='COMMENT_RATE_LIMIT';
  GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
  ASSERT detail::integer BETWEEN 1 AND 60, 'Missing retry guidance';
 END;
 ASSERT public.create_comment('15700000-0000-4000-8000-000000000010',E'hello\nworld','15700000-0000-4000-8000-000000000020')->>'id'=first_id, 'Retry at limit blocked';
 DELETE FROM public.comments WHERE id=first_id::uuid;
 PERFORM public.create_comment('15700000-0000-4000-8000-000000000010',E'hello\nworld','15700000-0000-4000-8000-000000000020');
 ASSERT NOT EXISTS(SELECT FROM public.comments WHERE id=first_id::uuid), 'Retry resurrected deleted comment';
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT (SELECT bool_and(created_at >= transaction_timestamp() AND created_at <= clock_timestamp()) FROM auth_private.comment_write_receipts WHERE user_id='15700000-0000-4000-8000-000000000001'), 'Receipt timestamp missing or invalid';
 ASSERT (SELECT minute_used=5 AND hour_used=5 FROM auth_private.comment_write_budgets WHERE user_id='15700000-0000-4000-8000-000000000001'), 'Failed/replayed operations charged';
 BEGIN
  INSERT INTO public.comments(post_id,author_id,content) VALUES('15700000-0000-4000-8000-000000000010','15700000-0000-4000-8000-000000000001',E' \t');
  RAISE EXCEPTION 'Privileged invalid content accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
-- Recovery, then the independent hour cap.
UPDATE auth_private.comment_write_budgets SET minute_start=now()-interval '2 minutes' WHERE user_id='15700000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.create_comment('15700000-0000-4000-8000-000000000010','recovered',gen_random_uuid());
RESET ROLE;
UPDATE auth_private.comment_write_budgets SET hour_used=30 WHERE user_id='15700000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
DO $$ DECLARE detail text; BEGIN
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','hour limit',gen_random_uuid());
  RAISE EXCEPTION 'Hour limit bypass';
 EXCEPTION WHEN raise_exception THEN
  ASSERT SQLERRM='COMMENT_RATE_LIMIT';
  GET STACKED DIAGNOSTICS detail = PG_EXCEPTION_DETAIL;
  ASSERT detail::integer BETWEEN 1 AND 3600;
 END;
END $$;
RESET ROLE;
UPDATE auth_private.comment_write_budgets SET hour_start=now()-interval '2 hours' WHERE user_id='15700000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT public.create_comment('15700000-0000-4000-8000-000000000010','hour recovery',gen_random_uuid());
RESET ROLE;
-- Same request ID is independent for another actor; cannot delete their comment.
SELECT set_config('request.jwt.claims','{"sub":"15700000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
SELECT public.create_comment('15700000-0000-4000-8000-000000000010','another actor','15700000-0000-4000-8000-000000000020');
DO $$ DECLARE removed integer; BEGIN
 DELETE FROM public.comments WHERE author_id='15700000-0000-4000-8000-000000000001';
 GET DIAGNOSTICS removed=ROW_COUNT;
 ASSERT removed=0, 'Cross-owner deletion allowed';
END $$;
RESET ROLE;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,secret,created_at,updated_at) VALUES
 (gen_random_uuid(),'15700000-0000-4000-8000-000000000002','Test','totp','verified','test',now(),now());
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.create_comment('15700000-0000-4000-8000-000000000010','MFA bypass',gen_random_uuid());
  RAISE EXCEPTION 'MFA bypass allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"15700000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT public.create_comment('15700000-0000-4000-8000-000000000010','MFA success',gen_random_uuid());
RESET ROLE;
ROLLBACK;
