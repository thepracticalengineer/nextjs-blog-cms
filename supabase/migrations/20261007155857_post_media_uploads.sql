-- Immutable public media: only the authenticated application endpoint may upload.
-- No authenticated/anon storage write or listing policies are granted for this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-media', 'post-media', true, 2097152, array['image/webp']);

alter table public.posts add column cover_image_alt text not null default ''
  check (char_length(cover_image_alt) <= 1000);
-- Preserve existing cover descriptions until an editor supplies specific alt text.
-- This metadata backfill must preserve publication dates and optimistic save tokens.
-- Keep trigger changes and the update atomic even when this SQL is run directly.
do $$
begin
  alter table public.posts disable trigger posts_updated_at;
  update public.posts set cover_image_alt = left(title, 1000)
    where cover_image is not null and cover_image <> '';
  alter table public.posts enable trigger posts_updated_at;
end;
$$;

create table public.post_media (
  path text primary key,
  owner_id uuid references public.profiles(id) on delete set null,
  url text not null unique,
  created_at timestamptz not null default now(),
  retained boolean not null default false,
  state text not null default 'active' check (state in ('active', 'deleting', 'deleted')),
  check (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$')
);
create index post_media_abandoned_idx on public.post_media(created_at) where not retained and state <> 'deleted';
alter table public.post_media enable row level security;
revoke all on public.post_media from public, anon, authenticated;
grant all on public.post_media to service_role;

create schema if not exists post_media_private;
revoke all on schema post_media_private from public, anon, authenticated;
-- Trigger-only definer access is needed because working-copy writers cannot access
-- the registry. Their identity/ownership is already enforced by each table's RLS.
-- This function only protects media; it grants no access to another user's rows.
create function post_media_private.retain_references() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  source text;
  media_path text;
  media_state text;
  encoded text;
  decoded text;
begin
  if tg_table_name = 'posts' then
    source := coalesce(new.cover_image, '') || ' ' || coalesce(new.content, '');
  else
    source := new.values::text;
  end if;
  source := replace(source, E'\\/', '/');
  for encoded in select distinct matches[1] from regexp_matches(source, '%([0-9a-fA-F]{2})', 'g') as matches loop
    if encoded = '00' then continue; end if;
    decoded := chr(('x' || encoded)::bit(8)::integer);
    if decoded ~ '^[a-zA-Z0-9./_-]$' then source := replace(source, '%' || encoded, decoded); end if;
  end loop;
  for media_path in
    select distinct matches[1] from regexp_matches(source, 'post-media/([0-9a-f-]{36}/[0-9a-f-]{36}\.webp)', 'g') as matches
    order by matches[1]
  loop
    -- Same row lock as cleanup: either save protects it first, or save fails
    -- without committing a URL whose storage object is being removed.
    select state into media_state from public.post_media where path = media_path for update;
    if found then
      if media_state <> 'active' then
        raise exception using errcode = '23514', message = 'An abandoned image has expired. Upload it again before saving.';
      end if;
      update public.post_media set retained = true where path = media_path;
    end if;
  end loop;
  return new;
end;
$$;
revoke all on function post_media_private.retain_references() from public, anon, authenticated;
create trigger posts_retain_media before insert or update of content, cover_image on public.posts
for each row execute function post_media_private.retain_references();
create trigger working_copies_retain_media before insert or update of values on public.post_working_copies
for each row execute function post_media_private.retain_references();

-- Service-only cleanup claim. Retried claims include interrupted deletions.
-- Retention is permanent: removed/reused images and historical recovery remain safe.
create function public.claim_abandoned_post_media(p_limit integer default 100)
returns setof public.post_media language sql security invoker set search_path = '' as $$
  with candidates as (
    select path from public.post_media
    where not retained and state <> 'deleted' and created_at < now() - interval '7 days'
    order by created_at, path limit greatest(1, least(p_limit, 100)) for update skip locked
  )
  update public.post_media m set state = 'deleting' from candidates c
  where m.path = c.path returning m.*;
$$;
revoke all on function public.claim_abandoned_post_media(integer) from public, anon, authenticated;
grant execute on function public.claim_abandoned_post_media(integer) to service_role;

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
    select v_post.id, tag_id from (select distinct unnest(v_ids) as tag_id) tags;
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
revoke all on function public.save_post_atomic(uuid,jsonb,uuid,timestamptz,text,uuid[],jsonb,text,text,uuid,boolean) from public, anon, authenticated;
grant execute on function public.save_post_atomic(uuid,jsonb,uuid,timestamptz,text,uuid[],jsonb,text,text,uuid,boolean) to service_role;
