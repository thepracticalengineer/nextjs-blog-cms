-- Retain merged rows as URL and ID aliases; never guess semantic duplicates.
alter table public.tags add column merged_into uuid references public.tags(id) on delete restrict;
alter table public.tags add constraint tags_no_self_merge check (merged_into is distinct from id);
create index tags_merged_into_idx on public.tags(merged_into);

create function public.validate_tag_taxonomy() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.merged_into is not null or exists (select 1 from public.tags where merged_into = old.id)
      or exists (select 1 from public.post_tags where tag_id = old.id) then
      raise check_violation using message = 'Used tags and URL aliases must be merged, not deleted';
    end if;
    return old;
  end if;
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if length(new.name) = 0 or length(new.name) > 100 then
    raise check_violation using message = 'Tag names must contain 1 to 100 characters';
  end if;
  if tg_op = 'UPDATE' and new.slug <> old.slug then
    raise check_violation using message = 'Tag URLs are permanent; merge instead of changing the slug';
  end if;
  -- Serialize equal normalized names while allowing existing duplicates to be
  -- deliberately merged. Same-slug inserts still reach ON CONFLICT in API saves.
  perform pg_advisory_xact_lock(hashtextextended(lower(new.name), 75));
  if new.merged_into is null and (tg_op = 'INSERT' or new.name is distinct from old.name) and exists (
    select 1 from public.tags t where t.merged_into is null and lower(btrim(regexp_replace(t.name, '\s+', ' ', 'g'))) = lower(new.name)
      and t.id <> new.id and t.slug <> new.slug
  ) then raise unique_violation using message = 'A tag with this normalized name already exists'; end if;
  if new.merged_into is not null and not exists (select 1 from public.tags where id = new.merged_into and merged_into is null) then
    raise check_violation using message = 'Merge target must be an active tag';
  end if;
  return new;
end $$;
create trigger validate_tag_taxonomy before insert or update or delete on public.tags
for each row execute function public.validate_tag_taxonomy();

create function public.merge_tags(source_id uuid, target_id uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare source public.tags; target public.tags;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise insufficient_privilege using message = 'Only administrators can merge tags';
  end if;
  if source_id = target_id then raise check_violation using message = 'Choose two different tags'; end if;
  -- Prevent concurrent saves from reintroducing source relationships.
  lock table public.tags in share row exclusive mode;
  lock table public.post_tags in share row exclusive mode;
  select * into source from public.tags where id = source_id and merged_into is null;
  select * into target from public.tags where id = target_id and merged_into is null;
  if source.id is null or target.id is null then raise check_violation using message = 'Both tags must be active'; end if;
  insert into public.post_tags(post_id, tag_id) select post_id, target_id from public.post_tags where tag_id = source_id on conflict do nothing;
  delete from public.post_tags where tag_id = source_id;
  update public.tags set merged_into = target_id where merged_into = source_id;
  update public.tags set merged_into = target_id where id = source_id;
end $$;
revoke all on function public.merge_tags(uuid, uuid) from public, anon;
grant execute on function public.merge_tags(uuid, uuid) to authenticated;

create or replace function public.save_post_atomic(
  p_actor_id uuid, p_payload jsonb, p_post_id uuid default null,
  p_expected_updated_at timestamptz default null, p_expected_status text default null,
  p_tag_ids uuid[] default null, p_tag_names jsonb default null,
  p_request_key text default null, p_fingerprint text default null,
  p_chat_id uuid default null, p_allow_admin boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_post public.posts;
  v_existing public.posts;
  v_request public.post_creation_requests;
  v_role text;
  v_ids uuid[] := p_tag_ids;
  v_tag jsonb;
  v_tag_id uuid;
  v_id uuid;
begin
  -- Serialize alias resolution with merges before touching post relationships.
  lock table public.tags in row exclusive mode;
  select role into v_role from public.profiles where id = p_actor_id;
  if v_role is null or v_role not in ('admin', 'author') then
    raise insufficient_privilege using message = 'Unauthorized';
  end if;
  if p_chat_id is not null and not exists (
    select 1 from public.ai_chats where id = p_chat_id and user_id = p_actor_id
  ) then raise insufficient_privilege using message = 'Unauthorized chat'; end if;

  if p_expected_status is null then
    if p_request_key is not null then
      -- Serialize concurrent retries before allocating a post or a slug.
      perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text || ':' || p_request_key, 0));
      select * into v_request from public.post_creation_requests
      where actor_id = p_actor_id and request_key = p_request_key;
      if found then
        if v_request.fingerprint is distinct from p_fingerprint then
          raise exception using errcode = '22023', message = 'This creation key was already used with different input.';
        end if;
        select * into v_post from public.posts where id = v_request.post_id;
        return jsonb_build_object('post', to_jsonb(v_post), 'replayed', true);
      end if;
    end if;
    v_id := coalesce(p_post_id, gen_random_uuid());
    v_post := jsonb_populate_record(null::public.posts, p_payload);
    insert into public.posts (id, title, slug, excerpt, content, cover_image, cover_image_alt, status, author_id,
      category_id, seo_title, seo_description, published_at)
    values (v_id, v_post.title, v_post.slug, v_post.excerpt, v_post.content, v_post.cover_image, coalesce(v_post.cover_image_alt, ''),
      coalesce(v_post.status, 'draft'), p_actor_id, v_post.category_id, v_post.seo_title,
      v_post.seo_description, v_post.published_at) returning * into v_post;
  else
    select * into v_existing from public.posts where id = p_post_id for update;
    if not found or (v_existing.author_id is distinct from p_actor_id and not (p_allow_admin and v_role = 'admin')) then
      raise insufficient_privilege using message = 'Unauthorized';
    end if;
    if v_existing.updated_at is distinct from p_expected_updated_at or v_existing.status is distinct from p_expected_status then
      raise exception using errcode = '40001', message = 'The post changed in another editor. Reload before saving.';
    end if;
    v_post := jsonb_populate_record(v_existing, p_payload);
    update public.posts set title = v_post.title, slug = v_post.slug, excerpt = v_post.excerpt,
      content = v_post.content, cover_image = v_post.cover_image, cover_image_alt = v_post.cover_image_alt, status = v_post.status,
      category_id = v_post.category_id, seo_title = v_post.seo_title,
      seo_description = v_post.seo_description, published_at = v_post.published_at,
      updated_at = clock_timestamp() where id = p_post_id returning * into v_post;
  end if;

  if p_tag_names is not null then
    v_ids := '{}';
    for v_tag in select value from jsonb_array_elements(p_tag_names) loop
      insert into public.tags (name, slug) values (v_tag->>'name', v_tag->>'slug')
      on conflict (slug) do update set slug = excluded.slug returning id into v_tag_id;
      v_ids := array_append(v_ids, v_tag_id);
    end loop;
  end if;
  if v_ids is not null then
    delete from public.post_tags where post_id = v_post.id;
    insert into public.post_tags (post_id, tag_id)
    select v_post.id, tag_id from (
      select distinct coalesce(t.merged_into, ids.id) as tag_id
      from unnest(v_ids) ids(id) left join public.tags t on t.id = ids.id
    ) tags;
  end if;
  if p_chat_id is not null then
    insert into public.ai_generated_posts (chat_id, post_id) values (p_chat_id, v_post.id);
  end if;
  if p_request_key is not null and p_expected_status is null then
    insert into public.post_creation_requests values (p_actor_id, p_request_key, p_fingerprint, v_post.id);
  end if;
  return jsonb_build_object('post', to_jsonb(v_post), 'replayed', false);
end;
$$;
