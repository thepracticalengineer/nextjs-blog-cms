-- Keep UUID paths, public URLs, RLS and retention/tombstones unchanged.
-- Legacy rows are hashed lazily by the server, without rewriting/deleting objects.
alter table public.post_media add column content_sha256 text
  check (content_sha256 ~ '^[0-9a-f]{64}$');
create index post_media_owner_content_idx on public.post_media(owner_id, content_sha256)
  where state = 'active';

create function public.reserve_post_media(p_owner_id uuid, p_content_sha256 text, p_path text, p_url text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare media public.post_media%rowtype;
begin
  if p_owner_id is null or p_content_sha256 is null or p_content_sha256 !~ '^[0-9a-f]{64}$'
    or p_path is null or p_path !~ ('^' || p_owner_id::text || '/[0-9a-f-]{36}\.webp$')
    or p_url is null or p_url = '' then
    raise exception using errcode = '23514', message = 'Invalid media reservation';
  end if;
  -- Serialize this owner's content across processes. Hash collisions only serialize
  -- unrelated requests; the full owner/hash predicate still determines identity.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_id::text || ':' || p_content_sha256, 168));
  select * into media from public.post_media
    where owner_id = p_owner_id and content_sha256 = p_content_sha256 and state = 'active'
    order by created_at, path limit 1 for update;
  if found then
    -- Same row lock as cleanup and retention: refresh the grace period before use.
    update public.post_media set created_at = now() where path = media.path;
  else
    insert into public.post_media(owner_id, content_sha256, path, url)
      values (p_owner_id, p_content_sha256, p_path, p_url) returning * into media;
  end if;
  return jsonb_build_object('path', media.path, 'url', media.url);
end;
$$;
revoke all on function public.reserve_post_media(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.reserve_post_media(uuid, text, text, text) to service_role;
