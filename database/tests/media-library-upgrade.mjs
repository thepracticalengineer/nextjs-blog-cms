// Exercise the forward backfill against pre-library rows inside a rolled-back
// transaction on the designated disposable container, leaving its schema intact.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const owner = randomUUID(), stored = `${owner}/${randomUUID()}.webp`, missing = `${owner}/${randomUUID()}.webp`
const migration = readFileSync(new URL('../../supabase/migrations/20261027084010_owner_media_library.sql', import.meta.url), 'utf8')
const columns = ['id','upload_status','original_filename','title','alt_text','caption','description','width','height','byte_size','uploaded_at','archived_at','library_retained','search_text']
const sql = `begin;
drop function public.complete_post_media(uuid,text,text,integer,integer,bigint,boolean);
drop function public.mutate_media_library(uuid,uuid,jsonb,boolean);
${columns.map(c => `alter table public.post_media drop column if exists ${c} cascade;`).join('\n')}
create index post_media_abandoned_idx on public.post_media(created_at) where not retained and state <> 'deleted';
insert into auth.users(id,email,raw_user_meta_data) values('${owner}','${owner}@example.test','{"full_name":"Upgrade fixture"}');
insert into public.post_media(path,url,owner_id,created_at) values('${stored}','https://test/${stored}','${owner}',now()),('${missing}','https://test/${missing}','${owner}',now());
insert into storage.objects(bucket_id,name,metadata,created_at) values('post-media','${stored}','{"size":1234}','2024-01-01T00:00:00Z');
${migration}
do $$ begin
 assert (select upload_status='ready' and uploaded_at='2024-01-01T00:00:00Z' and byte_size=1234 and original_filename is null and width is null and height is null from public.post_media where path='${stored}'), 'Stored legacy object not honestly indexed';
 assert (select upload_status='pending' and uploaded_at is null and byte_size is null from public.post_media where path='${missing}'), 'Missing legacy object incorrectly confirmed';
end $$;
rollback;`
const result = spawnSync('docker',['exec','-i','supabase_db_nextjs-blog-cms','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'})
if(result.status !== 0) throw new Error(result.stderr + result.stdout)
console.log('Library upgrade passed: only existing objects confirmed; unknown historical metadata stays null')
