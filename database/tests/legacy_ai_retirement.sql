-- Disposable local database only; every fixture and mutation rolls back.
BEGIN;
SET LOCAL storage.allow_delete_query = 'true';
INSERT INTO auth.users (id, email) VALUES
 ('20900000-0000-4000-8000-000000000001', 'retired-author@example.test'),
 ('20900000-0000-4000-8000-000000000002', 'retired-admin@example.test');
UPDATE public.profiles SET role = CASE WHEN id = '20900000-0000-4000-8000-000000000001' THEN 'author' ELSE 'admin' END
WHERE id IN ('20900000-0000-4000-8000-000000000001','20900000-0000-4000-8000-000000000002');
INSERT INTO auth.mfa_factors (id, user_id, factor_type, status, secret, created_at, updated_at)
SELECT gen_random_uuid(), id, 'totp', 'verified', 'test-only', now(), now() FROM auth.users
WHERE id IN ('20900000-0000-4000-8000-000000000001','20900000-0000-4000-8000-000000000002');
INSERT INTO public.llm_provider_keys(user_id, provider, encrypted_key, key_preview)
SELECT id, 'claude', 'aXY=:dGFn:Y2lwaGVydGV4dA==', 'text' FROM auth.users
WHERE id IN ('20900000-0000-4000-8000-000000000001','20900000-0000-4000-8000-000000000002');
INSERT INTO public.api_keys (user_id,name,key_hash,key_preview) VALUES
 ('20900000-0000-4000-8000-000000000001','Retired','retirement-hash','test');
INSERT INTO public.ai_books(id,user_id,title,file_name,extracted_text) VALUES
 ('20900000-0000-4000-8000-000000000010','20900000-0000-4000-8000-000000000001','History','history.pdf','historical text');
INSERT INTO public.ai_chats(id,user_id,book_id,llm_model) VALUES
 ('20900000-0000-4000-8000-000000000011','20900000-0000-4000-8000-000000000001','20900000-0000-4000-8000-000000000010','historical');
INSERT INTO public.ai_messages(chat_id,role,content) VALUES
 ('20900000-0000-4000-8000-000000000011','assistant','historical response');
INSERT INTO public.posts(id,author_id,title,slug,status,content) VALUES
 ('20900000-0000-4000-8000-000000000012','20900000-0000-4000-8000-000000000001','Historical draft','retirement-history','draft','original');
INSERT INTO public.ai_generated_posts(chat_id,post_id) VALUES
 ('20900000-0000-4000-8000-000000000011','20900000-0000-4000-8000-000000000012');
INSERT INTO storage.objects(bucket_id,name) VALUES ('ai-books','20900000-0000-4000-8000-000000000001/history.pdf');
CREATE FUNCTION pg_temp.check_provider_ownership() RETURNS void LANGUAGE plpgsql AS $$
DECLARE changed bigint;
BEGIN
 ASSERT (SELECT count(*) FROM public.llm_provider_keys) = 1, 'Cross-owner credentials exposed';
 ASSERT (SELECT encrypted_key FROM public.llm_provider_keys WHERE user_id = auth.uid() AND provider = 'claude') = 'aXY=:dGFn:Y2lwaGVydGV4dA==', 'Existing ciphertext changed';
 INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES (auth.uid(),'openai','new-ciphertext','text');
 UPDATE public.llm_provider_keys SET encrypted_key = 'replacement' WHERE user_id = auth.uid() AND provider = 'openai';
 ASSERT FOUND, 'Own replacement denied';
 UPDATE public.llm_provider_keys SET encrypted_key = 'stolen' WHERE user_id <> auth.uid();
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Cross-owner replacement allowed';
 DELETE FROM public.llm_provider_keys WHERE user_id <> auth.uid();
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Cross-owner deletion allowed';
 BEGIN
  UPDATE public.llm_provider_keys SET user_id = CASE WHEN auth.uid() = '20900000-0000-4000-8000-000000000001' THEN '20900000-0000-4000-8000-000000000002'::uuid ELSE '20900000-0000-4000-8000-000000000001'::uuid END WHERE provider = 'openai';
  RAISE EXCEPTION 'Ownership reassignment allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES
  (CASE WHEN auth.uid() = '20900000-0000-4000-8000-000000000001' THEN '20900000-0000-4000-8000-000000000002'::uuid ELSE '20900000-0000-4000-8000-000000000001'::uuid END,'gemini','foreign','text');
  RAISE EXCEPTION 'Foreign credential insert allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 DELETE FROM public.llm_provider_keys WHERE user_id = auth.uid() AND provider = 'openai';
 ASSERT FOUND, 'Own delete denied';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.check_provider_ownership() TO authenticated;
SELECT set_config('request.jwt.claim.sub','20900000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"20900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_provider_ownership();
DO $$ BEGIN
 IF auth.uid() = '20900000-0000-4000-8000-000000000002' THEN
  ASSERT (SELECT count(*) FROM public.api_keys WHERE key_hash = 'retirement-hash') = 0, 'Admin saw foreign retired key';
  ASSERT (SELECT count(*) FROM public.ai_books) = 0, 'Admin saw foreign books';
  ASSERT (SELECT count(*) FROM public.ai_chats) = 0, 'Admin saw foreign chats';
  ASSERT (SELECT count(*) FROM public.ai_messages) = 0, 'Admin saw foreign messages';
  ASSERT (SELECT count(*) FROM public.ai_generated_posts) = 0, 'Admin saw foreign provenance';
 END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','20900000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"20900000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_provider_ownership();
DO $$ BEGIN
 IF auth.uid() = '20900000-0000-4000-8000-000000000002' THEN
  ASSERT (SELECT count(*) FROM public.api_keys WHERE key_hash = 'retirement-hash') = 0, 'Admin saw foreign retired key';
  ASSERT (SELECT count(*) FROM public.ai_books) = 0, 'Admin saw foreign books';
  ASSERT (SELECT count(*) FROM public.ai_chats) = 0, 'Admin saw foreign chats';
  ASSERT (SELECT count(*) FROM public.ai_messages) = 0, 'Admin saw foreign messages';
  ASSERT (SELECT count(*) FROM public.ai_generated_posts) = 0, 'Admin saw foreign provenance';
 END IF;
END $$;
RESET ROLE;
-- An enrolled AAL1 token cannot read or mutate provider credentials.
SELECT set_config('request.jwt.claims','{"sub":"20900000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 ASSERT (SELECT count(*) FROM public.llm_provider_keys) = 0, 'MFA credentials bypass';
 BEGIN
  INSERT INTO public.llm_provider_keys(user_id,provider,encrypted_key,key_preview) VALUES (auth.uid(),'openai','bad','test');
  RAISE EXCEPTION 'MFA insert bypass';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','20900000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"20900000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE relation_name text; operation text; changed bigint; BEGIN
 ASSERT (SELECT count(*) FROM public.api_keys WHERE key_hash = 'retirement-hash' AND is_active = false) = 1, 'Revoked key owner export failed';
 FOREACH relation_name IN ARRAY ARRAY['ai_books','ai_chats','ai_messages','ai_generated_posts'] LOOP
  EXECUTE format('SELECT count(*) FROM public.%I',relation_name) INTO changed;
  ASSERT changed = 1, 'Historical owner export failed: ' || relation_name;
 END LOOP;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE relation_name text; BEGIN
 BEGIN DELETE FROM public.api_keys; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.api_keys SET name = name; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.api_keys DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_books; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_books SET title = title; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_books DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_chats; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_chats SET title = title; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_chats DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_messages; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_messages SET content = content; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_messages DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_generated_posts; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_generated_posts SET id = id; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_generated_posts DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ DECLARE relation_name text; BEGIN
 BEGIN DELETE FROM public.api_keys; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.api_keys SET name = name; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.api_keys DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: api_keys'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_books; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_books SET title = title; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_books DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_books'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_chats; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_chats SET title = title; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_chats DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_chats'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_messages; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_messages SET content = content; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_messages DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_messages'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN DELETE FROM public.ai_generated_posts; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.ai_generated_posts SET id = id; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN INSERT INTO public.ai_generated_posts DEFAULT VALUES; RAISE EXCEPTION 'Retired write allowed: ai_generated_posts'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ DECLARE changed bigint; BEGIN
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES ('ai-books',auth.uid()::text || '/new.pdf');
  RAISE EXCEPTION 'Retired storage upload allowed';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE storage.objects SET name = auth.uid()::text || '/renamed.pdf' WHERE bucket_id = 'ai-books';
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Retired storage update allowed';
 DELETE FROM storage.objects WHERE bucket_id = 'ai-books';
 GET DIAGNOSTICS changed = ROW_COUNT;
 ASSERT changed = 0, 'Retired storage delete allowed';
END $$;
RESET ROLE;
DO $$ BEGIN
 ASSERT NOT has_table_privilege('anon', 'public.llm_provider_keys', 'SELECT'), 'Anonymous credential grant remains';
 ASSERT NOT has_table_privilege('anon', 'public.llm_provider_keys', 'INSERT'), 'Anonymous credential mutation grant remains';
 ASSERT NOT has_table_privilege('authenticated', 'public.llm_provider_keys', 'TRUNCATE'), 'Browser credential truncate grant remains';
 ASSERT NOT EXISTS(SELECT 1 FROM public.api_keys WHERE is_active IS DISTINCT FROM false), 'Active developer keys remain';
 BEGIN
  UPDATE public.api_keys SET is_active = true WHERE key_hash = 'retirement-hash';
  RAISE EXCEPTION 'Privileged key reactivation allowed';
 EXCEPTION WHEN check_violation THEN NULL; END;
 ASSERT (SELECT count(*) FROM public.ai_generated_posts WHERE post_id = '20900000-0000-4000-8000-000000000012') = 1, 'Provenance lost';
END $$;
SET LOCAL ROLE service_role;
DO $$ DECLARE p public.posts; BEGIN
 SELECT * INTO p FROM public.posts WHERE id = '20900000-0000-4000-8000-000000000012';
 PERFORM public.save_post_atomic(p.author_id, '{"title":"Manually edited historical draft"}', p.id, p.updated_at, p.status);
 ASSERT (SELECT title FROM public.posts WHERE id = p.id) = 'Manually edited historical draft', 'Manual atomic editing broken';
 ASSERT (SELECT count(*) FROM public.ai_generated_posts WHERE post_id = p.id) = 1, 'Manual save lost provenance';
END $$;
RESET ROLE;
ROLLBACK;
