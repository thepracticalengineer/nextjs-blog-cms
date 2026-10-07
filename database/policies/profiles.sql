-- ============================================
-- RLS Policies: profiles
-- ============================================

-- Private account details are readable only by their owner. Public consumers
-- use public.public_author_profiles (see the public_author_profiles migration).
create policy "Users can read own private profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Administrative profile edits/deletes use the server-only service client.
-- Column grants and the public author projection are defined by the migration.
