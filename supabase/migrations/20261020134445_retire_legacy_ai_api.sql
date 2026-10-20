-- Retire browser/developer API writes without deleting credentials or AI history.
BEGIN;
UPDATE public.api_keys SET is_active = false WHERE is_active IS DISTINCT FROM false;
ALTER TABLE public.api_keys ALTER COLUMN is_active SET DEFAULT false;
-- Also prevents accidentally re-enabling old keys through privileged old code.
ALTER TABLE public.api_keys ADD CONSTRAINT api_keys_retired CHECK (is_active IS FALSE);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.api_keys FROM PUBLIC, anon, authenticated;
DROP POLICY "Admins can manage own api keys" ON public.api_keys;
CREATE POLICY "Owners can export retired api keys" ON public.api_keys
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
GRANT SELECT ON public.api_keys TO authenticated;

-- Encryption format and existing ciphertext are deliberately untouched.
DROP POLICY "Admins can manage own llm keys" ON public.llm_provider_keys;
CREATE POLICY "Authors manage own provider keys" ON public.llm_provider_keys
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('author', 'admin')
  ))
  WITH CHECK ((SELECT auth.uid()) = user_id AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role IN ('author', 'admin')
  ));
REVOKE ALL ON public.llm_provider_keys FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.llm_provider_keys FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.llm_provider_keys TO authenticated;

DROP POLICY "Users can manage own books" ON public.ai_books;
DROP POLICY "Users can manage own chats" ON public.ai_chats;
DROP POLICY "Users can manage own messages" ON public.ai_messages;
DROP POLICY "Users can manage own generated posts" ON public.ai_generated_posts;
CREATE POLICY "Owners can export retired books" ON public.ai_books FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners can export retired chats" ON public.ai_chats FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "Owners can export retired messages" ON public.ai_messages FOR SELECT TO authenticated
  USING (chat_id IN (SELECT id FROM public.ai_chats WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "Owners can export retired provenance" ON public.ai_generated_posts FOR SELECT TO authenticated
  USING (chat_id IN (SELECT id FROM public.ai_chats WHERE user_id = (SELECT auth.uid())));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_books, public.ai_chats,
  public.ai_messages, public.ai_generated_posts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ai_books, public.ai_chats, public.ai_messages, public.ai_generated_posts TO authenticated;
-- Existing restrictive MFA policies remain in force on every private relation.
-- Keep the owner download policy and all unrelated bucket policies.
DROP POLICY "Users can upload own PDFs" ON storage.objects;
DROP POLICY "Users can delete own PDFs" ON storage.objects;
-- Restrictive bucket-specific guards also block writes through broader policies.
CREATE POLICY "Retired AI books reject inserts" ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id <> 'ai-books');
CREATE POLICY "Retired AI books reject updates" ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated
  USING (bucket_id <> 'ai-books') WITH CHECK (bucket_id <> 'ai-books');
CREATE POLICY "Retired AI books reject deletes" ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated
  USING (bucket_id <> 'ai-books');
-- Preserve save_post_atomic and its provenance dependencies for manual editing.
-- service_role retains privileged maintenance access and still bypasses RLS.
NOTIFY pgrst, 'reload schema';
COMMIT;
