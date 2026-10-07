-- PostgreSQL constraint/update-semantics checks, not execution of the TS queries.
-- App query drift is covered by Vitest and Playwright against a migrated test DB.
-- Run only in an isolated migrated database. All fixtures are rolled back.
begin;
do $$
declare
  actor_id constant uuid := '00000000-0000-4000-8000-000000000081';
  test_post_id constant uuid := '00000000-0000-4000-8000-000000000082';
  old_token constant uuid := gen_random_uuid();
  new_token constant uuid := gen_random_uuid();
  pending constant text := 'pending';
  preparing constant text := 'sending';
  failed constant text := 'failed';
  sent constant text := 'sent';
  deadline constant timestamptz := '2026-01-01Z';
  touched integer;
begin
  insert into auth.users (id, email) values (actor_id, 'newsletter-test@example.com');
  insert into public.profiles (id, email, role) values (actor_id, 'newsletter-test@example.com', 'author') on conflict (id) do nothing;
  insert into public.posts (id, title, slug, author_id, status) values (test_post_id, 'Newsletter queue test', 'newsletter-queue-test', actor_id, 'published');

  -- The unique constraint preserves a single queue row and original deadline.
  insert into public.newsletter_sends (post_id, scheduled_at) values (test_post_id, deadline) on conflict (post_id) do nothing;
  insert into public.newsletter_sends (post_id, scheduled_at) values (test_post_id, deadline + interval '1 day') on conflict (post_id) do nothing;
  if (select count(*) from public.newsletter_sends where post_id = test_post_id) <> 1 then raise exception 'Duplicate queue row'; end if;
  if (select scheduled_at from public.newsletter_sends where post_id = test_post_id) <> deadline then raise exception 'Retry changed pending deadline'; end if;

  -- Claimed preparation can be canceled/restored before any provider handoff.
  update public.newsletter_sends set status = preparing, sending_started_at = now(), dispatch_token = old_token where post_id = test_post_id;
  update public.newsletter_sends set status = failed where post_id = test_post_id;
  update public.newsletter_sends set status = pending, scheduled_at = now() + interval '60 minutes', sending_started_at = null, dispatch_token = null
    where post_id = test_post_id and status = failed and delivery_started_at is null and sent_at is null;
  if not exists (select 1 from public.newsletter_sends where post_id = test_post_id and status = pending and scheduled_at > now() and dispatch_token is null) then raise exception 'Undelivered send not restored'; end if;

  -- A revoked worker cannot record handoff against the new worker's claim.
  update public.newsletter_sends set status = preparing, sending_started_at = now(), dispatch_token = new_token where post_id = test_post_id;
  update public.newsletter_sends set delivery_started_at = now() where post_id = test_post_id and status = preparing and dispatch_token = old_token;
  get diagnostics touched = row_count;
  if touched <> 0 then raise exception 'Revoked worker recorded handoff'; end if;

  -- Possible provider handoff forbids replay; cancellation survives completion.
  update public.newsletter_sends set delivery_started_at = now() where post_id = test_post_id and dispatch_token = new_token;
  update public.newsletter_sends set status = failed where post_id = test_post_id;
  update public.newsletter_sends set status = pending where post_id = test_post_id and status = failed and delivery_started_at is null and sent_at is null;
  update public.newsletter_sends set status = sent, sent_at = now() where post_id = test_post_id and status = preparing and dispatch_token = new_token;
  if not exists (select 1 from public.newsletter_sends where post_id = test_post_id and status = failed and sent_at is null and delivery_started_at is not null) then raise exception 'Possible delivery replayed or cancellation overwritten'; end if;
end $$;
rollback;
