-- Run in an isolated database after migrations. Every fixture is rolled back.
begin;
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000071', 'atomic-test@example.com');
insert into public.profiles (id, email, role) values ('00000000-0000-4000-8000-000000000071', 'atomic-test@example.com', 'author') on conflict (id) do nothing;
insert into public.tags (id, name, slug) values ('00000000-0000-4000-8000-000000000072', 'Original', 'original');

create function pg_temp.fail_tags() returns trigger language plpgsql as $$ begin raise exception 'Injected tag failure'; end $$;
create trigger issue71_insert_failure before insert on public.post_tags for each row execute function pg_temp.fail_tags();
do $$ begin
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000071', '{"title":"Atomic draft","slug":"atomic-create"}', p_tag_names => '[{"name":"Rollback tag","slug":"rollback-tag"}]');
    raise exception 'Expected tag failure';
  exception when raise_exception then
    if sqlerrm <> 'Injected tag failure' then raise; end if;
  end;
  if exists(select 1 from public.posts where slug = 'atomic-create') or exists(select 1 from public.post_slug_routes where slug = 'atomic-create') or exists(select 1 from public.tags where slug = 'rollback-tag') then raise exception 'Partial creation'; end if;
end $$;
drop trigger issue71_insert_failure on public.post_tags;

select public.save_post_atomic('00000000-0000-4000-8000-000000000071', '{"title":"Atomic draft","slug":"atomic-update"}', p_post_id => '00000000-0000-4000-8000-000000000073', p_tag_ids => array['00000000-0000-4000-8000-000000000072']::uuid[], p_request_key => 'retry', p_fingerprint => 'same');
create trigger issue71_insert_failure before insert on public.post_tags for each row execute function pg_temp.fail_tags();
do $$ declare before_post public.posts; begin
  select * into before_post from public.posts where slug = 'atomic-update';
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000071', '{"title":"Published changed","slug":"atomic-new-url","status":"published"}', before_post.id, before_post.updated_at, before_post.status, array['00000000-0000-4000-8000-000000000072']::uuid[]);
    raise exception 'Expected tag failure';
  exception when raise_exception then if sqlerrm <> 'Injected tag failure' then raise; end if; end;
  if (select to_jsonb(p) from public.posts p where id = before_post.id) <> to_jsonb(before_post) then raise exception 'Partial update'; end if;
  if not exists(select 1 from public.post_tags where post_id = before_post.id) then raise exception 'Lost original tags'; end if;
  if exists(select 1 from public.post_slug_routes where slug = 'atomic-new-url') then raise exception 'Partial URL transition'; end if;
end $$;
drop trigger issue71_insert_failure on public.post_tags;
create trigger issue71_delete_failure before delete on public.post_tags for each row execute function pg_temp.fail_tags();
do $$ declare p public.posts; begin
  select * into p from public.posts where slug = 'atomic-update';
  begin
    perform public.save_post_atomic(p.author_id, '{"title":"Should roll back"}', p.id, p.updated_at, p.status, '{}'::uuid[]);
    raise exception 'Expected tag failure';
  exception when raise_exception then if sqlerrm <> 'Injected tag failure' then raise; end if; end;
  if (select title from public.posts where id = p.id) <> p.title then raise exception 'Delete failure changed post'; end if;
end $$;
drop trigger issue71_delete_failure on public.post_tags;

do $$ declare p public.posts; result jsonb; begin
  select * into p from public.posts where slug = 'atomic-update';
  result := public.save_post_atomic(p.author_id, '{"slug":"ignored-retry"}', p_request_key => 'retry', p_fingerprint => 'same');
  if not (result->>'replayed')::boolean or (result->'post'->>'id')::uuid <> p.id then raise exception 'Retry duplicated post'; end if;
  begin
    perform public.save_post_atomic(p.author_id, '{}', p_request_key => 'retry', p_fingerprint => 'different');
    raise exception 'Expected key mismatch';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.save_post_atomic(p.author_id, '{}', p.id, p.updated_at - interval '1 second', p.status);
    raise exception 'Expected stale conflict';
  exception when serialization_failure then null; end;
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000099', '{}', p.id, p.updated_at, p.status);
    raise exception 'Expected authorization rejection';
  exception when insufficient_privilege then null; end;
  perform public.save_post_atomic(p.author_id, '{}', p.id, p.updated_at, p.status, '{}'::uuid[]);
  if exists(select 1 from public.post_tags where post_id = p.id) then raise exception 'Empty selection retained tags'; end if;
  if has_function_privilege('authenticated', 'public.save_post_atomic(uuid,jsonb,uuid,timestamptz,text,uuid[],jsonb,text,text,uuid,boolean)', 'execute') then raise exception 'RPC exposed to browser'; end if;
end $$;
-- Valid actors still cannot edit another author's post through REST.
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000076', 'other-atomic@example.com'), ('00000000-0000-4000-8000-000000000077', 'admin-atomic@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-000000000077';
do $$ declare p public.posts; begin
  select * into p from public.posts where slug = 'atomic-update';
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000076', '{}', p.id, p.updated_at, p.status, p_allow_admin => true);
    raise exception 'Expected ownership rejection';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000077', '{}', p.id, p.updated_at, p.status);
    raise exception 'REST admin must remain owner scoped';
  exception when insufficient_privilege then null; end;
  perform public.save_post_atomic('00000000-0000-4000-8000-000000000077', '{}', p.id, p.updated_at, p.status, p_allow_admin => true);
end $$;

-- Taxonomy resolution and AI linking share the same rollback boundary.
insert into public.ai_books (id, user_id, title, file_name, file_url) values ('00000000-0000-4000-8000-000000000074', '00000000-0000-4000-8000-000000000071', 'Fixture', 'fixture.pdf', 'fixture.pdf');
insert into public.ai_chats (id, book_id, user_id, llm_model) values ('00000000-0000-4000-8000-000000000075', '00000000-0000-4000-8000-000000000074', '00000000-0000-4000-8000-000000000071', 'fixture');
create trigger issue71_link_failure before insert on public.ai_generated_posts for each row execute function pg_temp.fail_tags();
do $$ begin
  begin
    perform public.save_post_atomic('00000000-0000-4000-8000-000000000071', '{"title":"AI draft","slug":"atomic-ai"}', p_tag_names => '[{"name":"New AI tag","slug":"new-ai-tag"}]', p_request_key => 'ai-retry', p_fingerprint => 'same', p_chat_id => '00000000-0000-4000-8000-000000000075');
    raise exception 'Expected link failure';
  exception when raise_exception then if sqlerrm <> 'Injected tag failure' then raise; end if; end;
  if exists(select 1 from public.posts where slug = 'atomic-ai') or exists(select 1 from public.tags where slug = 'new-ai-tag') or exists(select 1 from public.post_creation_requests where request_key = 'ai-retry') then raise exception 'Partial AI creation'; end if;
end $$;
drop trigger issue71_link_failure on public.ai_generated_posts;
select public.save_post_atomic('00000000-0000-4000-8000-000000000071', '{"title":"AI draft","slug":"atomic-ai"}', p_tag_names => '[{"name":"New AI tag","slug":"new-ai-tag"},{"name":"New AI tag","slug":"new-ai-tag"}]', p_request_key => 'ai-retry', p_fingerprint => 'same', p_chat_id => '00000000-0000-4000-8000-000000000075');
do $$ begin
  if (select count(*) from public.ai_generated_posts where chat_id = '00000000-0000-4000-8000-000000000075') <> 1 then raise exception 'Missing AI link'; end if;
  if (select count(*) from public.post_tags pt join public.posts p on p.id = pt.post_id where p.slug = 'atomic-ai') <> 1 then raise exception 'Tags not deduplicated'; end if;
end $$;
rollback;
