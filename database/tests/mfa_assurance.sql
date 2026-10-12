-- Disposable/local database only. All fixtures and mutations roll back.
BEGIN;
-- Permit metadata-only DELETE assertions in this rolled-back fixture.
SET LOCAL storage.allow_delete_query = 'true';
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('10300000-0000-4000-8000-000000000001', 'mfa-enrolled@example.test', '{"full_name":"MFA Author"}'),
 ('10300000-0000-4000-8000-000000000002', 'mfa-unenrolled@example.test', '{"full_name":"Other Author"}');
UPDATE public.profiles SET role = 'admin' WHERE id = '10300000-0000-4000-8000-000000000001';
INSERT INTO auth.mfa_factors (id, user_id, friendly_name, factor_type, status, secret, created_at, updated_at) VALUES
 ('10300000-0000-4000-8000-000000000090', '10300000-0000-4000-8000-000000000001', 'Verified', 'totp', 'verified', 'test-only', now(), now()),
 ('10300000-0000-4000-8000-000000000091', '10300000-0000-4000-8000-000000000002', 'Unverified', 'totp', 'unverified', 'test-only', now(), now());
INSERT INTO public.posts (id, title, slug, content, status, author_id) VALUES
 ('10300000-0000-4000-8000-000000000010', 'Private', 'mfa-private', 'private', 'draft', '10300000-0000-4000-8000-000000000001'),
 ('10300000-0000-4000-8000-000000000011', 'Public', 'mfa-public', 'public', 'published', '10300000-0000-4000-8000-000000000001');
INSERT INTO public.tags (id, name, slug) VALUES ('10300000-0000-4000-8000-000000000020', 'MFA fixture', 'mfa-fixture');
INSERT INTO public.post_tags (post_id, tag_id) VALUES
 ('10300000-0000-4000-8000-000000000010', '10300000-0000-4000-8000-000000000020'),
 ('10300000-0000-4000-8000-000000000011', '10300000-0000-4000-8000-000000000020');
INSERT INTO public.ai_books (id, user_id, title, file_name, extracted_text) VALUES
 ('10300000-0000-4000-8000-000000000030', '10300000-0000-4000-8000-000000000001', 'Private book', 'private.pdf', 'private text');
INSERT INTO public.ai_chats (id, user_id, book_id, llm_model) VALUES
 ('10300000-0000-4000-8000-000000000040', '10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000030', 'test');
INSERT INTO public.ai_messages (chat_id, role, content) VALUES
 ('10300000-0000-4000-8000-000000000040', 'user', 'private message');
INSERT INTO public.ai_generated_posts (chat_id, post_id) VALUES
 ('10300000-0000-4000-8000-000000000040', '10300000-0000-4000-8000-000000000010');
INSERT INTO public.api_keys (name, key_hash, key_preview, user_id) VALUES
 ('MFA fixture', 'mfa-test-hash', 'test', '10300000-0000-4000-8000-000000000001');
INSERT INTO public.llm_provider_keys (user_id, provider, encrypted_key, key_preview) VALUES
 ('10300000-0000-4000-8000-000000000001', 'claude', 'test-only', 'test');
INSERT INTO public.post_working_copies (user_id, document_id, values, revision) VALUES
 ('10300000-0000-4000-8000-000000000001', '10300000-0000-4000-8000-000000000050', '{}', gen_random_uuid());
INSERT INTO storage.objects (bucket_id, name) VALUES ('ai-books', '10300000-0000-4000-8000-000000000001/private.pdf');

CREATE FUNCTION pg_temp.assert_mfa_access(allowed boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE relation_name text; visible bigint; changed bigint;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['profiles','api_keys','llm_provider_keys','ai_books','ai_chats','ai_messages','ai_generated_posts','post_working_copies'] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', relation_name) INTO visible;
    ASSERT (visible > 0) = allowed, 'Unexpected MFA read access to ' || relation_name;
  END LOOP;
  ASSERT (SELECT count(*) FROM public.posts WHERE slug = 'mfa-private') = CASE WHEN allowed THEN 1 ELSE 0 END, 'Private post visibility';
  ASSERT (SELECT count(*) FROM public.post_tags WHERE post_id = '10300000-0000-4000-8000-000000000010') = CASE WHEN allowed THEN 1 ELSE 0 END, 'Private tag visibility';
  ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'ai-books') = CASE WHEN allowed THEN 1 ELSE 0 END, 'Private storage visibility';
  ASSERT (SELECT count(*) FROM public.posts WHERE slug = 'mfa-public') = 1, 'Published content must stay public';
  ASSERT (SELECT count(*) FROM public.post_tags WHERE post_id = '10300000-0000-4000-8000-000000000011') = 1, 'Published tags must stay public';
  ASSERT (SELECT count(*) FROM public.public_author_profiles WHERE id = auth.uid()) = 1, 'Limited author projection must stay public';
  UPDATE public.profiles SET bio = 'updated' WHERE id = auth.uid();
  GET DIAGNOSTICS changed = ROW_COUNT;
  ASSERT (changed = 1) = allowed, 'Private profile update';
  UPDATE public.posts SET excerpt = 'updated' WHERE slug = 'mfa-public';
  GET DIAGNOSTICS changed = ROW_COUNT;
  ASSERT (changed = 1) = allowed, 'Published content is not publicly writable';
  DELETE FROM storage.objects WHERE bucket_id = 'ai-books' AND name = auth.uid()::text || '/private.pdf';
  GET DIAGNOSTICS changed = ROW_COUNT;
  ASSERT (changed = 1) = allowed, 'Private storage delete';
  BEGIN
    INSERT INTO public.ai_books (user_id, title, file_name, extracted_text) VALUES (auth.uid(), 'new', 'new.pdf', 'private');
    ASSERT allowed, 'AAL1 book insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN ASSERT NOT allowed, 'Authorized book insert denied'; END;
  BEGIN
    INSERT INTO storage.objects (bucket_id, name) VALUES ('ai-books', auth.uid()::text || '/new.pdf');
    ASSERT allowed, 'AAL1 storage insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN ASSERT NOT allowed, 'Authorized storage insert denied'; END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assert_mfa_access(boolean) TO authenticated;

-- A stale token issued before enrollment (no factor metadata) must still deny.
SELECT set_config('request.jwt.claim.sub', '10300000-0000-4000-8000-000000000001', true);
SELECT set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assert_mfa_access(false);
-- Missing assurance must never bypass enrollment.
SELECT set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT pg_temp.assert_mfa_access(false);
SELECT set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}', true);
SELECT pg_temp.assert_mfa_access(true);
-- AAL2 does not turn private ownership into an admin override.
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.profiles WHERE id = '10300000-0000-4000-8000-000000000002') = 0, 'Other profile exposed';
  BEGIN
    INSERT INTO public.ai_books (user_id, title, file_name, extracted_text) VALUES ('10300000-0000-4000-8000-000000000002', 'foreign', 'foreign.pdf', 'private');
    RAISE EXCEPTION 'Foreign ownership insert succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
-- Unverified enrollment is not an MFA requirement.
SELECT set_config('request.jwt.claim.sub', '10300000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claims', '{"sub":"10300000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  ASSERT auth_private.has_required_assurance(), 'Unverified factor blocked AAL1';
  ASSERT (SELECT count(*) FROM public.profiles WHERE id = auth.uid()) = 1, 'Non-enrolled profile blocked';
  ASSERT (SELECT count(*) FROM public.ai_books) = 0, 'Other user books exposed';
  INSERT INTO public.ai_books (user_id, title, file_name, extracted_text) VALUES (auth.uid(), 'new', 'new.pdf', 'private');
  UPDATE public.profiles SET bio = 'non-enrolled update' WHERE id = auth.uid();
  ASSERT FOUND, 'Non-enrolled profile update blocked';
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.posts WHERE slug = 'mfa-public') = 1, 'Anonymous publication blocked';
  ASSERT (SELECT count(*) FROM public.posts WHERE slug = 'mfa-private') = 0, 'Anonymous draft exposed';
  ASSERT (SELECT count(*) FROM public.public_author_profiles WHERE id = '10300000-0000-4000-8000-000000000001') = 1, 'Anonymous author projection blocked';
  ASSERT (SELECT count(*) FROM public.profiles) = 0, 'Anonymous private profile exposed';
END $$;
RESET ROLE;
ROLLBACK;
