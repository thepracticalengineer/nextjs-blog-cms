-- Run against a disposable test database; leave no fixtures behind.
begin;
insert into auth.users(id, email, raw_user_meta_data) values
('00000000-0000-4000-8000-000000000001', 'slug-test@example.com', '{}');
insert into public.posts(id, author_id, title, slug, status) values
('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Published article', 'original-url', 'published'),
('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001', 'Draft article', 'draft-url', 'draft');

-- Exercise the definer trigger as an authorized user, not just a superuser.
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
update public.posts set slug = 'second-url' where slug = 'original-url';
update public.posts set slug = 'third-url' where slug = 'second-url';
update public.posts set slug = 'new-draft-url' where slug = 'draft-url';
reset role;

do $$
begin
  if (select count(*) from public.post_slug_routes where post_id = '00000000-0000-4000-8000-000000000010') <> 3 then
    raise exception 'Published history was lost';
  end if;
  if exists (select 1 from public.post_slug_routes where slug = 'draft-url') then
    raise exception 'Draft-only URL was not released';
  end if;
  begin
    insert into public.posts(title, slug) values ('Hijack', 'original-url');
    raise exception 'Old published URL was stolen';
  exception when unique_violation then null;
  end;
  begin
    update public.posts set slug = 'second-url' where slug = 'new-draft-url';
    raise exception 'Update stole a historical URL';
  exception when unique_violation then null;
  end;
  if not exists (select 1 from public.posts where slug = 'new-draft-url') then
    raise exception 'Conflict did not roll back the post write';
  end if;
  begin
    insert into public.posts(title, slug) values ('Invalid', 'INVALID / slug');
    raise exception 'Invalid slug was accepted';
  exception when check_violation then null;
  end;
end $$;

-- Switching back to an owned historical URL cannot create a redirect cycle.
update public.posts set slug = 'original-url' where slug = 'third-url';
set role anon;
do $$
begin
  if (select count(*) from public.post_slug_routes where post_id in ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011')) <> 3 then raise exception 'Draft route leaked'; end if;
  if not exists (
    select 1 from public.post_slug_routes r join public.posts p on p.id = r.post_id
    where r.slug = 'second-url' and p.slug = 'original-url' and p.status = 'published'
  ) then raise exception 'Old URL did not resolve to the current URL'; end if;
  begin
    insert into public.post_slug_routes(slug, post_id) values ('evil', '00000000-0000-4000-8000-000000000010');
    raise exception 'Anon altered reservations';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
update public.posts set status = 'draft', published_at = null where slug = 'original-url';
set role anon;
do $$
begin
  if exists (select 1 from public.post_slug_routes where post_id in ('00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000011')) then raise exception 'Unpublished redirects leaked'; end if;
end $$;
reset role;
update public.posts set slug = 'republished-url', status = 'published' where slug = 'original-url';
do $$
begin
  if not exists (select 1 from public.post_slug_routes where slug = 'original-url' and was_published) then
    raise exception 'Unpublish/republish lost the old URL';
  end if;
end $$;
-- Deleting the destination removes its redirects and releases reservations.
delete from public.posts where slug = 'republished-url';
do $$
begin
  if exists (select 1 from public.post_slug_routes where was_published and post_id = '00000000-0000-4000-8000-000000000010') then raise exception 'Deleted post routes remained'; end if;
end $$;

rollback;
