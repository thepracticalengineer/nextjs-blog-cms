-- Autosave is isolated from posts: no background write changes public content,
-- taxonomy or publication status. Each editor has their own private working copy.
create table public.post_working_copies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  document_id uuid not null,
  post_id uuid references public.posts(id) on delete cascade,
  values jsonb not null check (jsonb_typeof(values) = 'object' and octet_length(values::text) <= 2000000),
  revision uuid not null,
  base_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, document_id),
  check (post_id is null or document_id = post_id)
);
create index post_working_copies_post_id_idx on public.post_working_copies(post_id);
alter table public.post_working_copies enable row level security;
revoke all on public.post_working_copies from public, anon;
grant select, insert, update, delete on public.post_working_copies to authenticated, service_role;

create policy "Editors manage their own working copies"
on public.post_working_copies for all to authenticated
using (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role in ('author', 'admin'))
  and (post_id is null or exists (
    select 1 from public.posts p where p.id = post_id and
      (p.author_id = (select auth.uid()) or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'admin'))
  ))
)
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role in ('author', 'admin'))
  and (post_id is null or exists (
    select 1 from public.posts p where p.id = post_id and
      (p.author_id = (select auth.uid()) or exists (select 1 from public.profiles me where me.id = (select auth.uid()) and me.role = 'admin'))
  ))
);
