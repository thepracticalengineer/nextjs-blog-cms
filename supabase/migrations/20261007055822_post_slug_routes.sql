-- A single unique namespace for current URLs and former published URLs. Keeping
-- the reservation in the post transaction prevents redirect/creation races.
begin;
lock table public.posts in share row exclusive mode;

create table public.post_slug_routes (
  slug text primary key,
  post_id uuid not null references public.posts(id) on delete cascade,
  was_published boolean not null default false
);
create index post_slug_routes_post_id_idx on public.post_slug_routes(post_id);
insert into public.post_slug_routes (slug, post_id, was_published)
select slug, id, status = 'published' or published_at is not null from public.posts;

alter table public.post_slug_routes enable row level security;
revoke all on public.post_slug_routes from anon, authenticated;
grant select on public.post_slug_routes to anon, authenticated;
grant all on public.post_slug_routes to service_role;
create policy "Read routes for published posts" on public.post_slug_routes
for select to anon, authenticated using (
  exists (select 1 from public.posts where id = post_id and status = 'published')
);

-- Privilege is limited to this trigger: API callers cannot edit reservations.
create function public.reserve_post_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if TG_OP = 'INSERT' or new.slug is distinct from old.slug then
    if length(new.slug) > 200 or new.slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise check_violation using message = 'Invalid post slug', constraint = 'posts_slug_format';
    end if;
  end if;

  insert into public.post_slug_routes as routes (slug, post_id, was_published)
  values (new.slug, new.id, new.status = 'published')
  on conflict (slug) do update
    set was_published = routes.was_published or excluded.was_published
    where routes.post_id = excluded.post_id;
  if not found then
    raise unique_violation using message = 'Post slug is already reserved', constraint = 'post_slug_routes_pkey';
  end if;

  if TG_OP = 'UPDATE' and old.slug is distinct from new.slug then
    -- Draft-only URLs may be released; anything that was public stays reserved,
    -- including through unpublish/republish and subsequent URL changes.
    delete from public.post_slug_routes
    where slug = old.slug and post_id = new.id and not was_published;
  end if;
  return new;
end;
$$;
revoke all on function public.reserve_post_slug() from public, anon, authenticated;
create trigger posts_reserve_slug after insert or update of slug, status on public.posts
for each row execute function public.reserve_post_slug();
commit;
