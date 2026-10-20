-- Disposable/local database only. Run after all migrations; roll back fixtures.
BEGIN;
INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES
 ('22300000-0000-4000-8000-000000000001', 'bulk-owner@example.test', '{"full_name":"Bulk Owner"}'),
 ('22300000-0000-4000-8000-000000000002', 'bulk-other@example.test', '{"full_name":"Bulk Other"}');
INSERT INTO public.posts (id, title, slug, author_id, status, content) VALUES
 ('22300000-0000-4000-8000-000000000010', 'Bulk retention', 'bulk-retention-223', '22300000-0000-4000-8000-000000000001', 'draft', 'Keep content until deleted');
INSERT INTO public.ai_books (id, user_id, title, file_name, extracted_text) VALUES
 ('22300000-0000-4000-8000-000000000020', '22300000-0000-4000-8000-000000000001', 'Retained book', 'test.pdf', 'Retained text');
INSERT INTO public.ai_chats (id, book_id, user_id, llm_model) VALUES
 ('22300000-0000-4000-8000-000000000030', '22300000-0000-4000-8000-000000000020', '22300000-0000-4000-8000-000000000001', 'retired');
INSERT INTO public.ai_generated_posts (id, chat_id, post_id) VALUES
 ('22300000-0000-4000-8000-000000000040', '22300000-0000-4000-8000-000000000030', '22300000-0000-4000-8000-000000000010');
INSERT INTO public.post_working_copies (user_id, document_id, post_id, values, revision) VALUES
 ('22300000-0000-4000-8000-000000000001', '22300000-0000-4000-8000-000000000010', '22300000-0000-4000-8000-000000000010', '{"content":"Private working copy"}', gen_random_uuid());
SELECT set_config('request.jwt.claim.sub', '22300000-0000-4000-8000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 DELETE FROM public.posts WHERE id = '22300000-0000-4000-8000-000000000010';
 ASSERT NOT FOUND, 'Another author must not delete the selected post';
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '22300000-0000-4000-8000-000000000001', true);
SET LOCAL ROLE authenticated;
DELETE FROM public.posts WHERE id = '22300000-0000-4000-8000-000000000010';
RESET ROLE;
DO $$ BEGIN
 ASSERT EXISTS (SELECT 1 FROM public.ai_generated_posts WHERE id = '22300000-0000-4000-8000-000000000040' AND post_id IS NULL), 'Deleting a post must retain retired provenance';
 ASSERT EXISTS (SELECT 1 FROM public.ai_chats WHERE id = '22300000-0000-4000-8000-000000000030'), 'Deleting a post must retain its chat';
 ASSERT NOT EXISTS (SELECT 1 FROM public.post_working_copies WHERE post_id = '22300000-0000-4000-8000-000000000010'), 'Linked working copies follow existing deletion semantics';
END $$;
ROLLBACK;
