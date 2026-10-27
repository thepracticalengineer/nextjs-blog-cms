-- Literal search bypasses PostgREST's LIKE wildcard rewriting. Display-name
-- ordering matches the UI fallback; unknown names and dates sort last.
create function public.list_media_library(p_owner_id uuid, p_search text default '', p_page integer default 1, p_sort text default 'newest', p_filter text default 'active')
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb;
begin
 if p_owner_id is null or p_search is null or char_length(p_search) > 200 or p_page is null or p_page < 1 or p_page > 10000
  or p_sort is null or p_sort not in ('newest','oldest','title') or p_filter is null or p_filter not in ('active','archived') then
  raise exception using errcode = '22023', message = 'Invalid library filters';
 end if;
 with matching as materialized (
  select id,url,original_filename,title,alt_text,caption,description,width,height,byte_size,uploaded_at,archived_at,
   coalesce(nullif(btrim(title),''),nullif(btrim(original_filename),'')) as display_name
  from public.post_media
  where owner_id = p_owner_id and state = 'active' and upload_status = 'ready'
   and (archived_at is not null) = (p_filter = 'archived')
   and (p_search = '' or strpos(lower(search_text),lower(p_search)) > 0)
 ), ordered as (
  select *, row_number() over (order by
   case when p_sort = 'title' then display_name end asc nulls last,
   case when p_sort = 'oldest' then uploaded_at end asc nulls last,
   case when p_sort = 'newest' then uploaded_at end desc nulls last,
   id asc) as position from matching
 ), page as (
  select * from ordered order by position limit 24 offset (p_page - 1) * 24
 )
 select jsonb_build_object('assets',coalesce((select jsonb_agg(to_jsonb(page) - 'display_name' - 'position' order by position) from page),'[]'::jsonb),
  'total',(select count(*) from matching),'page',p_page,'pageSize',24) into result;
 return result;
end;
$$;
revoke all on function public.list_media_library(uuid,text,integer,text,text) from public, anon, authenticated;
grant execute on function public.list_media_library(uuid,text,integer,text,text) to service_role;
