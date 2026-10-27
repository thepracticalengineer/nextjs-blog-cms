-- Service-only owner library. Public immutable objects and historical retention stay unchanged.
alter table public.post_media
 add column id uuid not null default gen_random_uuid() unique,
 add column upload_status text not null default 'pending' check (upload_status in ('pending','ready')),
 add column original_filename text check (char_length(original_filename) <= 255),
 add column title text not null default '' check (char_length(title) <= 255),
 add column alt_text text not null default '' check (char_length(alt_text) <= 1000),
 add column caption text not null default '' check (char_length(caption) <= 2000),
 add column description text not null default '' check (char_length(description) <= 5000),
 add column width integer check (width > 0),
 add column height integer check (height > 0),
 add column byte_size bigint check (byte_size >= 0),
 add column uploaded_at timestamptz,
 add column archived_at timestamptz,
 add column library_retained boolean not null default false,
 add column search_text text generated always as (coalesce(original_filename,'') || ' ' || title || ' ' || alt_text || ' ' || caption || ' ' || description) stored;

-- Storage object presence confirms historical uploads. Never infer an original
-- filename/dimensions from the UUID key, nor use mutable reservation created_at.
update public.post_media m set upload_status = 'ready', uploaded_at = o.created_at,
 byte_size = case when o.metadata->>'size' ~ '^[0-9]{1,15}$' then (o.metadata->>'size')::bigint else null end
from storage.objects o where o.bucket_id = 'post-media' and o.name = m.path and m.state = 'active';
create index post_media_library_page_idx on public.post_media(owner_id, uploaded_at, id) where state = 'active' and upload_status = 'ready';
create index post_media_library_title_idx on public.post_media(owner_id, title, id) where state = 'active' and upload_status = 'ready';
drop index public.post_media_abandoned_idx;
create index post_media_abandoned_idx on public.post_media(created_at) where not retained and not library_retained and state <> 'deleted';

create or replace function public.claim_abandoned_post_media(p_limit integer default 100)
returns setof public.post_media language sql security invoker set search_path = '' as $$
 with candidates as (
  select path from public.post_media where not retained and not library_retained and archived_at is null
   and state <> 'deleted' and created_at < now() - interval '7 days'
  order by created_at, path limit greatest(1, least(p_limit, 100)) for update skip locked
 ) update public.post_media m set state = 'deleting' from candidates c where m.path = c.path returning m.*;
$$;

-- Completion shares the cleanup row lock. Failed storage writes never call it.
-- Only the first successful completion establishes stable metadata; retries and
-- content duplicates preserve edits, archive state and durable retention.
create function public.complete_post_media(p_owner_id uuid, p_path text, p_filename text, p_width integer, p_height integer, p_byte_size bigint, p_library boolean default false)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare media public.post_media%rowtype;
begin
 select * into media from public.post_media where owner_id = p_owner_id and path = p_path and state = 'active' for update;
 if not found then return false; end if;
 update public.post_media set
  original_filename = case when upload_status = 'pending' then p_filename else original_filename end,
  title = case when upload_status = 'pending' then coalesce(p_filename, '') else title end,
  width = case when upload_status = 'pending' then p_width else width end,
  height = case when upload_status = 'pending' then p_height else height end,
  byte_size = case when upload_status = 'pending' then p_byte_size else byte_size end,
  uploaded_at = case when upload_status = 'pending' then clock_timestamp() else uploaded_at end,
  upload_status = 'ready', library_retained = library_retained or p_library
 where path = p_path;
 return true;
end;
$$;

-- Never an admin bypass. Caller supplies only the verified session identity.
-- Archived assets can be restored/edited but cannot be selected until restored.
create function public.mutate_media_library(p_owner_id uuid, p_id uuid, p_changes jsonb default '{}', p_select boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare media public.post_media%rowtype;
begin
 if p_changes is null or jsonb_typeof(p_changes) <> 'object' or exists (
  select 1 from jsonb_each(p_changes) e where
   (e.key = 'archived' and jsonb_typeof(e.value) <> 'boolean') or
   (e.key in ('title','alt_text','caption','description') and jsonb_typeof(e.value) <> 'string') or
   e.key not in ('archived','title','alt_text','caption','description')
 ) then raise exception using errcode = '22023', message = 'Invalid media metadata'; end if;
 select * into media from public.post_media where owner_id = p_owner_id and id = p_id and state = 'active' and upload_status = 'ready' for update;
 if not found or (p_select and media.archived_at is not null) then return null; end if;
 update public.post_media set
  title = coalesce(p_changes->>'title', title), alt_text = coalesce(p_changes->>'alt_text', alt_text),
  caption = coalesce(p_changes->>'caption', caption), description = coalesce(p_changes->>'description', description),
  archived_at = case when p_changes ? 'archived' then case when (p_changes->>'archived')::boolean then coalesce(archived_at,clock_timestamp()) else null end else archived_at end,
  library_retained = true
 where id = p_id returning * into media;
 return to_jsonb(media);
end;
$$;
revoke all on function public.complete_post_media(uuid,text,text,integer,integer,bigint,boolean) from public, anon, authenticated;
grant execute on function public.complete_post_media(uuid,text,text,integer,integer,bigint,boolean) to service_role;
revoke all on function public.mutate_media_library(uuid,uuid,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.mutate_media_library(uuid,uuid,jsonb,boolean) to service_role;
