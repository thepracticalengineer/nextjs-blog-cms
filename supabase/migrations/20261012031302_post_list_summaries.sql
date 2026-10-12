-- Reading time is computed on writes, including REST/AI/direct database writes.
-- Match the existing readTime helper: TipTap text nodes or legacy HTML/plain text,
-- 200 words/minute, minimum one minute. Never expose the body in list queries.
create function public.post_reading_minutes(body text) returns integer
language plpgsql immutable parallel safe set search_path = '' as $$
declare document jsonb; readable text; words integer;
begin
  begin
    document := body::jsonb;
    with recursive nodes(value) as (
      select document
      union all
      select child.value from nodes n cross join lateral jsonb_array_elements(
        case when jsonb_typeof(n.value) = 'array' then n.value
          when jsonb_typeof(n.value->'content') = 'array' then n.value->'content'
          else '[]'::jsonb end
      ) child
    )
    select string_agg(value->>'text', ' ') into readable from nodes
      where value->>'type' = 'text' and jsonb_typeof(value->'text') = 'string';
  -- JSON text can contain escapes or numbers unsupported by jsonb.
  exception when invalid_text_representation or untranslatable_character or numeric_value_out_of_range then
    readable := regexp_replace(body, '<[^>]+>', ' ', 'g');
  end;
  -- Explicit ECMAScript whitespace avoids locale-dependent NBSP handling.
  readable := regexp_replace(readable, U&'[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+', ' ', 'g');
  select count(*) into words from regexp_split_to_table(coalesce(readable, ''), '\s+') word
    where word <> '';
  return greatest(1, ceil(words / 200.0)::integer);
end;
$$;

alter table public.posts add column reading_time_minutes integer
  generated always as (public.post_reading_minutes(content)) stored;

create index posts_published_listing_idx on public.posts (published_at desc nulls last, id desc)
  where status = 'published';
create index posts_category_listing_idx on public.posts (category_id, published_at desc nulls last, id desc)
  where status = 'published';
create index posts_author_listing_idx on public.posts (author_id, updated_at desc, id desc);

-- One snapshot supplies a bounded page, an exact filtered count, and complete
-- category facets. SECURITY INVOKER preserves RLS; the explicit actor scope also
-- excludes other authors' published posts from an author's dashboard.
create function public.get_dashboard_posts(
  p_page integer default 1, p_page_size integer default 10,
  p_search text default '', p_category_id uuid default null,
  p_sort text default 'updated_at', p_direction text default 'desc'
) returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare page_size integer; result jsonb;
begin
  if auth.uid() is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  page_size := case when p_page_size in (5, 10, 25, 50) then p_page_size else 10 end;
  if p_sort is null or p_sort not in ('title', 'author', 'status', 'updated_at') then p_sort := 'updated_at'; end if;
  if p_direction is null or p_direction not in ('asc', 'desc') then p_direction := 'desc'; end if;
  with scoped as materialized (
    select p.id, p.title, p.slug, p.excerpt, p.status, p.updated_at, p.category_id,
      a.id author_id, a.full_name author_name,
      c.name category_name, c.slug category_slug
    from public.posts p
    left join public.public_author_profiles a on a.id = p.author_id
    left join public.categories c on c.id = p.category_id
    where p.author_id = (select auth.uid())
      or (select role from public.profiles where id = (select auth.uid())) = 'admin'
  ), filtered as materialized (
    select * from scoped
    where (p_category_id is null or category_id = p_category_id)
      and strpos(lower(title), lower(left(trim(coalesce(p_search, '')), 200))) > 0
  ), totals as (
    select count(*) total from filtered
  ), bounds as (
    select total, least(greatest(coalesce(p_page, 1), 1), greatest(1, ceil(total::numeric / page_size)::integer)) page
    from totals
  ), selected as (
    select f.*, row_number() over (order by
      case when p_direction = 'asc' then case p_sort when 'title' then lower(title) when 'author' then lower(case when author_id is null then '' else coalesce(nullif(trim(author_name), ''), 'Author') end) when 'status' then status::text end end asc nulls last,
      case when p_direction = 'desc' then case p_sort when 'title' then lower(title) when 'author' then lower(case when author_id is null then '' else coalesce(nullif(trim(author_name), ''), 'Author') end) when 'status' then status::text end end desc nulls last,
      case when p_sort = 'updated_at' and p_direction = 'asc' then updated_at end asc nulls last,
      case when p_sort = 'updated_at' and p_direction = 'desc' then updated_at end desc nulls last,
      id desc
    ) position from filtered f
  ), page_rows as (
    select s.* from selected s, bounds b
    where s.position > (b.page - 1)::bigint * page_size and s.position <= b.page::bigint * page_size
  )
  select jsonb_build_object(
    'total', b.total, 'page', b.page,
    'categories', (select coalesce(jsonb_agg(c order by c.name, c.id), '[]'::jsonb)
      from (select distinct category_id id, category_name name from scoped where category_id is not null) c),
    'posts', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'title', r.title, 'slug', r.slug, 'excerpt', r.excerpt,
      'status', r.status, 'updated_at', r.updated_at,
      'author', case when r.author_id is null then null else jsonb_build_object('id', r.author_id, 'full_name', r.author_name) end,
      'category', case when r.category_id is null then null else jsonb_build_object('id', r.category_id, 'name', r.category_name, 'slug', r.category_slug) end,
      'tags', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name) order by t.name, t.id), '[]'::jsonb)
        from public.post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = r.id)
    ) order by r.position), '[]'::jsonb) from page_rows r)
  ) into result from bounds b;
  return result;
end;
$$;
revoke all on function public.get_dashboard_posts(integer, integer, text, uuid, text, text) from public, anon;
grant execute on function public.get_dashboard_posts(integer, integer, text, uuid, text, text) to authenticated;
