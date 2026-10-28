-- database/policies/comments.sql
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous) can read comments
CREATE POLICY "Public can read comments"
  ON public.comments FOR SELECT USING (true);

-- Creates must use public.create_comment (migration 20261028082621), which
-- enforces identity/MFA, publication, normalization, budgets and retry receipts.
-- No direct inserts/upserts/updates from untrusted Data API clients.
REVOKE ALL ON public.comments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.comments TO anon, authenticated;
GRANT DELETE ON public.comments TO authenticated;

-- Any authenticated user can delete their own comment
CREATE POLICY "Users can delete own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = author_id);

-- Admins can delete any comment
CREATE POLICY "Admins can delete any comment"
  ON public.comments FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
