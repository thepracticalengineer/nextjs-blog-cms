-- Run only against a disposable migrated database.
begin;
insert into auth.users(id,email,raw_user_meta_data) values ('00000000-0000-4000-8000-000000000075','taxonomy@example.com','{}');
update public.profiles set role='admin' where id='00000000-0000-4000-8000-000000000075';
insert into public.tags(id,name,slug) values
('00000000-0000-4000-8000-000000000076','SoftwareEngineering','taxonomy-source'),
('00000000-0000-4000-8000-000000000077',' Software   engineering ','taxonomy-target'),
('00000000-0000-4000-8000-000000000078','Engineering','taxonomy-next');
insert into public.posts(id,author_id,title,slug) values ('00000000-0000-4000-8000-000000000079','00000000-0000-4000-8000-000000000075','Taxonomy','taxonomy-post');
insert into public.post_tags values
('00000000-0000-4000-8000-000000000079','00000000-0000-4000-8000-000000000076'),
('00000000-0000-4000-8000-000000000079','00000000-0000-4000-8000-000000000077');
set role authenticated;
set request.jwt.claim.sub='00000000-0000-4000-8000-000000000075';
select public.merge_tags('00000000-0000-4000-8000-000000000076','00000000-0000-4000-8000-000000000077');
select public.merge_tags('00000000-0000-4000-8000-000000000077','00000000-0000-4000-8000-000000000078');
reset role;
do $$ begin
  if (select count(*) from public.post_tags where post_id='00000000-0000-4000-8000-000000000079') <> 1 then raise exception 'Relationships not deduplicated'; end if;
  if (select count(*) from public.tags where merged_into='00000000-0000-4000-8000-000000000078') <> 2 then raise exception 'Alias chain not flattened'; end if;
  if (select name from public.tags where slug='taxonomy-target') <> 'Software engineering' then raise exception 'Name not normalized'; end if;
  begin
    insert into public.tags(name,slug) values ('ENGINEERING','taxonomy-collision');
    raise exception 'Normalized duplicate accepted';
  exception when unique_violation then null; end;
  begin
    delete from public.tags where slug='taxonomy-source';
    raise exception 'Alias deleted';
  exception when check_violation then null; end;
end $$;
-- Stale draft IDs plus their target must save to one canonical relationship.
select public.save_post_atomic(
 p_actor_id=>'00000000-0000-4000-8000-000000000075',
 p_expected_status=>'draft',
 p_expected_updated_at=>(select updated_at from public.posts where slug='taxonomy-post'),
 p_payload=>'{}', p_post_id=>'00000000-0000-4000-8000-000000000079',
 p_tag_ids=>array['00000000-0000-4000-8000-000000000076'::uuid,'00000000-0000-4000-8000-000000000078'::uuid]);
do $$ begin
 if (select count(*) from public.post_tags where post_id='00000000-0000-4000-8000-000000000079' and tag_id='00000000-0000-4000-8000-000000000078') <> 1 then raise exception 'Stale draft ID not resolved'; end if;
end $$;
update public.profiles set role='author' where id='00000000-0000-4000-8000-000000000075';
set role authenticated;
do $$ begin
 begin
  perform public.merge_tags('00000000-0000-4000-8000-000000000076','00000000-0000-4000-8000-000000000078');
  raise exception 'Author merged tags';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
