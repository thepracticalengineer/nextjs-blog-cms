-- Isolated, rolled-back fixtures: pagination past the API row cap and RLS.
begin;
insert into auth.users(id, email) values
 ('00000000-0000-4000-8000-000000000771', 'list-author@example.com'),
 ('00000000-0000-4000-8000-000000000772', 'list-other@example.com'),
 ('00000000-0000-4000-8000-000000000773', 'list-admin@example.com');
insert into public.profiles(id, email, role, full_name) values
 ('00000000-0000-4000-8000-000000000771', 'list-author@example.com', 'author', 'Zebra'),
 ('00000000-0000-4000-8000-000000000772', 'list-other@example.com', 'author', 'Alpha'),
 ('00000000-0000-4000-8000-000000000773', 'list-admin@example.com', 'admin', 'Admin')
on conflict (id) do update set role=excluded.role, full_name=excluded.full_name;
insert into public.categories(id, name, slug) values
 ('00000000-0000-4000-8000-000000000774', 'List category', 'list-category');
insert into public.posts(title, slug, author_id, content, category_id, status)
select 'List ' || lpad(n::text, 4, '0'), 'list-fixture-' || n,
 '00000000-0000-4000-8000-000000000771'::uuid,
 '<p>' || repeat('engineering ', 401) || '</p>',
 case when n = 1501 then '00000000-0000-4000-8000-000000000774'::uuid end,
 case when n % 2 = 0 then 'published' else 'draft' end
from generate_series(1, 1501) n;
insert into public.posts(title, slug, author_id, status) values
 ('Other published', 'list-other-public', '00000000-0000-4000-8000-000000000772', 'published'),
 ('Other draft', 'list-other-private', '00000000-0000-4000-8000-000000000772', 'draft'),
 ('100%_* literal', 'list-special', '00000000-0000-4000-8000-000000000771', 'draft');

do $$ begin
 if public.post_reading_minutes('<p>' || repeat('word ', 401) || '</p>') <> 3 then raise exception 'HTML reading time'; end if;
 if public.post_reading_minutes('{"type":"doc","content":[{"type":"image","attrs":{"alt":"ignored"}},{"type":"paragraph","content":[{"type":"text","text":"' || repeat('word ', 201) || '"}]}]}') <> 2 then raise exception 'JSON reading time'; end if;
 if public.post_reading_minutes(null) <> 1 or public.post_reading_minutes('') <> 1 then raise exception 'Empty reading time'; end if;
 if exists(select 1 from public.posts where slug like 'list-fixture-%' and reading_time_minutes <> 3) then raise exception 'Generated summary'; end if;
end $$;
update public.posts set content = 'Short' where slug = 'list-fixture-1';
do $$ begin
 if (select reading_time_minutes from public.posts where slug='list-fixture-1') <> 1 then raise exception 'Summary did not update'; end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000771","role":"authenticated"}', true);
do $$ declare result jsonb; other jsonb; field text; direction text; begin
 result := public.get_dashboard_posts(151, 10, '', null, 'title', 'asc');
 if (result->>'total')::int <> 1502 or jsonb_array_length(result->'posts') <> 2 then raise exception 'Truncated result: %', result; end if;
 if result->'posts'->0->>'title' <> 'List 1500' then raise exception 'Wrong page order'; end if;
 if jsonb_array_length(result->'categories') <> 1 then raise exception 'Missing off-page category'; end if;
 if result->'posts'->0 ? 'content' or result->'posts'->0 ? 'seo_title' then raise exception 'Body/editor field leaked'; end if;
 result := public.get_dashboard_posts(99999, 10, 'List 1501');
 if result->>'page' <> '1' or result->>'total' <> '1' then raise exception 'Page clamping'; end if;
 result := public.get_dashboard_posts(p_search => '%_*');
 if result->>'total' <> '1' or result->'posts'->0->>'title' <> '100%_* literal' then raise exception 'Search wildcard injection'; end if;
 result := public.get_dashboard_posts(p_category_id => '00000000-0000-4000-8000-000000000774');
 if result->>'total' <> '1' then raise exception 'Category filter'; end if;
 result := public.get_dashboard_posts(p_search => 'Other');
 if result->>'total' <> '0' then raise exception 'Dashboard leaks other author'; end if;
 result := public.get_dashboard_posts(p_sort => 'title', p_direction => 'desc');
 if result->'posts'->0->>'title' <> 'List 1501' then raise exception 'Descending title order'; end if;
 result := public.get_dashboard_posts(p_sort => 'status', p_direction => 'asc');
 if result->'posts'->0->>'status' <> 'draft' then raise exception 'Ascending status order'; end if;
 result := public.get_dashboard_posts(p_sort => 'status', p_direction => 'desc');
 if result->'posts'->0->>'status' <> 'published' then raise exception 'Descending status order'; end if;
 result := public.get_dashboard_posts(p_search => 'no match');
 if result->>'total' <> '0' or result->>'page' <> '1' or jsonb_array_length(result->'categories') <> 1 then raise exception 'Empty filter state'; end if;
 foreach field in array array['title','author','status','updated_at'] loop
   foreach direction in array array['asc','desc'] loop
     result := public.get_dashboard_posts(1, 5, '', null, field, direction);
     other := public.get_dashboard_posts(2, 5, '', null, field, direction);
     if exists(select 1 from jsonb_array_elements(result->'posts') a join jsonb_array_elements(other->'posts') b on a->>'id' = b->>'id') then raise exception 'Unstable page boundary'; end if;
   end loop;
 end loop;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000773","role":"authenticated"}', true);
do $$ declare result jsonb; begin
 result := public.get_dashboard_posts(p_search => 'Other', p_sort => 'author', p_direction => 'asc');
 if result->>'total' <> '2' then raise exception 'Admin missing posts'; end if;
 result := public.get_dashboard_posts(p_sort => 'author', p_direction => 'asc');
 if result->'posts'->0->'author'->>'full_name' <> 'Alpha' then raise exception 'Ascending author order'; end if;
 result := public.get_dashboard_posts(p_sort => 'author', p_direction => 'desc');
 if result->'posts'->0->'author'->>'full_name' <> 'Zebra' then raise exception 'Descending author order'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
 begin
   perform public.get_dashboard_posts();
   raise exception 'Anonymous dashboard access';
 exception when insufficient_privilege then null; end;
 if exists(select 1 from public.posts where slug='list-other-private') then raise exception 'Public draft leak'; end if;
end $$;
rollback;
