-- Run only in an isolated migrated test database. All fixtures are rolled back.
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000081', 'newsletter-test@example.com');
insert into public.profiles (id, email, role) values ('00000000-0000-4000-8000-000000000081', 'newsletter-test@example.com', 'author') on conflict (id) do nothing;
insert into public.posts (id, title, slug, author_id, status) values ('00000000-0000-4000-8000-000000000082', 'Newsletter queue test', 'newsletter-queue-test', '00000000-0000-4000-8000-000000000081', 'published');

-- Retrying insertion must retain a single row and its original deadline.
insert into public.newsletter_sends (post_id, scheduled_at) values ('00000000-0000-4000-8000-000000000082', '2026-01-01Z') on conflict (post_id) do nothing;
insert into public.newsletter_sends (post_id, scheduled_at) values ('00000000-0000-4000-8000-000000000082', '2026-02-01Z') on conflict (post_id) do nothing;
do $$ begin
  if (select count(*) from public.newsletter_sends where post_id = '00000000-0000-4000-8000-000000000082') <> 1 then raise exception 'Duplicate queue row'; end if;
  if (select scheduled_at from public.newsletter_sends where post_id = '00000000-0000-4000-8000-000000000082') <> '2026-01-01Z'::timestamptz then raise exception 'Retry changed pending deadline'; end if;
end $$;

-- A canceled, never-claimed notification gets a new deadline on republish.
update public.posts set status = 'draft' where id = '00000000-0000-4000-8000-000000000082';
update public.newsletter_sends set status = 'failed' where post_id = '00000000-0000-4000-8000-000000000082' and status in ('pending', 'sending');
update public.posts set status = 'published' where id = '00000000-0000-4000-8000-000000000082';
update public.newsletter_sends set status = 'pending', scheduled_at = now() + interval '60 minutes' where post_id = '00000000-0000-4000-8000-000000000082' and status = 'failed' and sending_started_at is null and sent_at is null;
do $$ begin
  if not exists (select 1 from public.newsletter_sends where post_id = '00000000-0000-4000-8000-000000000082' and status = 'pending' and scheduled_at > now()) then raise exception 'Canceled send not restored'; end if;
end $$;

-- A claimed/canceled send cannot be restarted or overwritten by completion.
update public.newsletter_sends set status = 'sending', sending_started_at = now() where post_id = '00000000-0000-4000-8000-000000000082' and status = 'pending';
update public.newsletter_sends set status = 'failed' where post_id = '00000000-0000-4000-8000-000000000082' and status in ('pending', 'sending');
update public.newsletter_sends set status = 'pending' where post_id = '00000000-0000-4000-8000-000000000082' and status = 'failed' and sending_started_at is null and sent_at is null;
update public.newsletter_sends set status = 'sent', sent_at = now() where post_id = '00000000-0000-4000-8000-000000000082' and status = 'sending';
do $$ begin
  if not exists (select 1 from public.newsletter_sends where post_id = '00000000-0000-4000-8000-000000000082' and status = 'failed' and sent_at is null and sending_started_at is not null) then raise exception 'Claimed cancellation restarted or overwritten'; end if;
end $$;
rollback;
