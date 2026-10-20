-- Disposable local database only; every fixture and mutation rolls back.
BEGIN;
SET LOCAL storage.allow_delete_query = 'true';
CREATE FUNCTION pg_temp.retirement_fixture() RETURNS TABLE (
 author_id uuid, admin_id uuid, book_id uuid, chat_id uuid, post_id uuid,
 ciphertext text, key_hash text, bucket_id text
) LANGUAGE sql IMMUTABLE AS $$
 SELECT '20900000-0000-4000-8000-000000000001'::uuid,
        '20900000-0000-4000-8000-000000000002'::uuid,
        '20900000-0000-4000-8000-000000000010'::uuid,
        '20900000-0000-4000-8000-000000000011'::uuid,
        '20900000-0000-4000-8000-000000000012'::uuid,
        'aXY=:dGFn:Y2lwaGVydGV4dA==', 'retirement-hash', 'ai-books';
$$;
DO $$ DECLARE fixture record; BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 INSERT INTO auth.users (id, email) VALUES
  (fixture.author_id, 'retired-author@example.test'),
  (fixture.admin_id, 'retired-admin@example.test');
 UPDATE public.profiles SET role = CASE WHEN id = fixture.author_id THEN 'author' ELSE 'admin' END
 WHERE id IN (fixture.author_id, fixture.admin_id);
 INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, secret, created_at, updated_at)
 SELECT gen_random_uuid(), id, 'totp', 'verified', 'test-only', now(), now()
 FROM auth.users WHERE id IN (fixture.author_id, fixture.admin_id);
 INSERT INTO public.llm_provider_keys(user_id, provider, encrypted_key, key_preview)
 SELECT id, 'claude', fixture.ciphertext, 'text' FROM auth.users
 WHERE id IN (fixture.author_id, fixture.admin_id);
 INSERT INTO public.api_keys (user_id,name,key_hash,key_preview) VALUES
  (fixture.author_id,'Retired',fixture.key_hash,'test');
 INSERT INTO public.ai_books(id,user_id,title,file_name,extracted_text) VALUES
  (fixture.book_id,fixture.author_id,'History','history.pdf','historical text');
 INSERT INTO public.ai_chats(id,user_id,book_id,llm_model) VALUES
  (fixture.chat_id,fixture.author_id,fixture.book_id,'historical');
 INSERT INTO public.ai_messages(chat_id,role,content) VALUES
  (fixture.chat_id,'assistant','historical response');
 INSERT INTO public.posts(id,author_id,title,slug,status,content) VALUES
  (fixture.post_id,fixture.author_id,'Historical draft','retirement-history','draft','original');
 INSERT INTO public.ai_generated_posts(chat_id,post_id) VALUES (fixture.chat_id,fixture.post_id);
 INSERT INTO storage.objects(bucket_id,name) VALUES (fixture.bucket_id,fixture.author_id::text || '/history.pdf');
END $$;
-- END RETIREMENT FIXTURES

-- Invoker helpers keep the actual authenticated/anonymous permissions under test.
CREATE FUNCTION pg_temp.expect_denied(statement text, reason text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN
  EXECUTE statement;
  RAISE EXCEPTION '%', reason;
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
CREATE FUNCTION pg_temp.retirement_session(actor uuid, assurance text DEFAULT 'aal2') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub', actor::text, true);
 PERFORM set_config('request.jwt.claims', jsonb_build_object('sub',actor,'role','authenticated','aal',assurance)::text, true);
END $$;
CREATE FUNCTION pg_temp.check_provider_ownership() RETURNS void LANGUAGE plpgsql AS $$
DECLARE changed bigint; fixture record; other_owner uuid; provider_name constant text := 'openai';
BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 other_owner := CASE WHEN auth.uid() = fixture.author_id THEN fixture.admin_id ELSE fixture.author_id END;
 ASSERT (SELECT count(*) FROM public.llm_provider_keys) = 1, 'Cross-owner credentials exposed';
 ASSERT (SELECT encrypted_key FROM public.llm_provider_keys WHERE user_id = auth.uid() AND provider = 'claude') = fixture.ciphertext, 'Existing ciphertext changed';
 INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES (auth.uid(),provider_name,'new-ciphertext','text');
 UPDATE public.llm_provider_keys SET encrypted_key = 'replacement' WHERE user_id = auth.uid() AND provider = provider_name;
 ASSERT FOUND, 'Own replacement denied';
 UPDATE public.llm_provider_keys SET encrypted_key = 'stolen' WHERE user_id <> auth.uid();
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Cross-owner replacement allowed';
 DELETE FROM public.llm_provider_keys WHERE user_id <> auth.uid();
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Cross-owner deletion allowed';
 PERFORM pg_temp.expect_denied(format(
  'UPDATE public.llm_provider_keys SET user_id = %L WHERE provider = %L',other_owner,provider_name
 ),'Ownership reassignment allowed');
 PERFORM pg_temp.expect_denied(format(
  'INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES (%L,%L,%L,%L)',
  other_owner,'gemini','foreign','text'
 ),'Foreign credential insert allowed');
 DELETE FROM public.llm_provider_keys WHERE user_id = auth.uid() AND provider = provider_name;
 ASSERT FOUND, 'Own delete denied';
END $$;
CREATE FUNCTION pg_temp.check_retired_exports(expected_count bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE relation_name text; visible bigint; fixture record;
BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 ASSERT (SELECT count(*) FROM public.api_keys WHERE key_hash = fixture.key_hash AND is_active = false) = expected_count, 'Revoked key owner export failed';
 FOREACH relation_name IN ARRAY ARRAY['ai_books','ai_chats','ai_messages','ai_generated_posts'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',relation_name) INTO visible;
  ASSERT visible = expected_count, 'Unexpected retired history visibility: ' || relation_name;
 END LOOP;
END $$;
CREATE FUNCTION pg_temp.check_retired_writes() RETURNS void LANGUAGE plpgsql AS $$
DECLARE target record; statement text;
BEGIN
 FOR target IN SELECT * FROM (VALUES
  ('api_keys','name'), ('ai_books','title'), ('ai_chats','title'),
  ('ai_messages','content'), ('ai_generated_posts','id')
 ) AS targets(relation_name,column_name) LOOP
  FOREACH statement IN ARRAY ARRAY[
   format('DELETE FROM public.%I',target.relation_name),
   format('UPDATE public.%I SET %I = %I',target.relation_name,target.column_name,target.column_name),
   format('INSERT INTO public.%I DEFAULT VALUES',target.relation_name)
  ] LOOP
   PERFORM pg_temp.expect_denied(statement,'Retired write allowed: ' || statement);
  END LOOP;
 END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.retirement_fixture(), pg_temp.expect_denied(text,text),
 pg_temp.retirement_session(uuid,text), pg_temp.check_provider_ownership(),
 pg_temp.check_retired_exports(bigint), pg_temp.check_retired_writes() TO authenticated, anon;

-- Both author and admin have owner-scoped CRUD; admin gets no foreign exports.
DO $$ DECLARE fixture record; actor uuid; BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 FOREACH actor IN ARRAY ARRAY[fixture.author_id,fixture.admin_id] LOOP
  PERFORM pg_temp.retirement_session(actor);
  SET LOCAL ROLE authenticated;
  PERFORM pg_temp.check_provider_ownership();
  PERFORM pg_temp.check_retired_exports(CASE WHEN actor = fixture.author_id THEN 1 ELSE 0 END);
  RESET ROLE;
 END LOOP;
END $$;
-- An enrolled AAL1 token cannot read or mutate provider credentials.
SELECT pg_temp.retirement_session(admin_id,'aal1') FROM pg_temp.retirement_fixture();
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.llm_provider_keys) = 0, 'MFA credentials bypass';
 PERFORM pg_temp.expect_denied(format(
  'INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES (%L,%L,%L,%L)',
  auth.uid(),'openai','bad','test'
 ),'MFA insert bypass');
END $$;
RESET ROLE;
SELECT pg_temp.retirement_session(author_id) FROM pg_temp.retirement_fixture();
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_retired_writes();
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.check_retired_writes();
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE changed bigint; fixture record; BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 PERFORM pg_temp.expect_denied(format(
  'INSERT INTO storage.objects(bucket_id,name) VALUES (%L,%L)',fixture.bucket_id,auth.uid()::text || '/new.pdf'
 ),'Retired storage upload allowed');
 UPDATE storage.objects SET name = auth.uid()::text || '/renamed.pdf' WHERE bucket_id = fixture.bucket_id;
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Retired storage update allowed';
 DELETE FROM storage.objects WHERE bucket_id = fixture.bucket_id;
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Retired storage delete allowed';
END $$;
RESET ROLE;
DO $$ DECLARE fixture record; relation_name constant text := 'public.llm_provider_keys'; BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 ASSERT NOT has_table_privilege('anon', relation_name, 'SELECT'), 'Anonymous credential grant remains';
 ASSERT NOT has_table_privilege('anon', relation_name, 'INSERT'), 'Anonymous credential mutation grant remains';
 ASSERT NOT has_table_privilege('authenticated', relation_name, 'TRUNCATE'), 'Browser credential truncate grant remains';
 ASSERT NOT EXISTS(SELECT 1 FROM public.api_keys WHERE is_active IS DISTINCT FROM false), 'Active developer keys remain';
 BEGIN
  UPDATE public.api_keys SET is_active = true WHERE key_hash = fixture.key_hash;
  RAISE EXCEPTION 'Privileged key reactivation allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT count(*) FROM public.ai_generated_posts WHERE post_id = fixture.post_id) = 1, 'Provenance lost';
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE p public.posts; fixture record; edited_title constant text := 'Manually edited historical draft'; BEGIN
 SELECT * INTO fixture FROM pg_temp.retirement_fixture();
 SELECT * INTO p FROM public.posts WHERE id = fixture.post_id;
 PERFORM public.save_post_atomic(p.author_id, jsonb_build_object('title',edited_title), p.id, p.updated_at, p.status);
 ASSERT (SELECT title FROM public.posts WHERE id = p.id) = edited_title, 'Manual atomic editing broken';
 ASSERT (SELECT count(*) FROM public.ai_generated_posts WHERE post_id = p.id) = 1, 'Manual save lost provenance';
END $$;
RESET ROLE;
ROLLBACK;
