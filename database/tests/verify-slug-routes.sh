#!/usr/bin/env bash
# Real PostgreSQL constraints, RLS and concurrent transaction verification.
# Requires local PostgreSQL binaries and psql; never touches a shared database.
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
pg_bin=${PG_BIN:-$(pg_config --bindir)}
work_dir=$(mktemp -d)
pg_port=$(python3 - <<'PY'
import socket
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    print(s.getsockname()[1])
PY
)
cleanup() {
  "$pg_bin/pg_ctl" -D "$work_dir/data" stop >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$work_dir/data" -A trust > "$work_dir/init.log"
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-p $pg_port -k $work_dir" start >/dev/null
psql_cmd=(psql -h "$work_dir" -p "$pg_port" -d postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" <<'SQL' >/dev/null
create role anon;
create role authenticated;
create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
SQL
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20260317000000_initial_schema.sql" >/dev/null
"${psql_cmd[@]}" -c 'grant all on all tables in schema public to anon, authenticated, service_role' >/dev/null
# Check backfill as well as future writes.
"${psql_cmd[@]}" -c "insert into public.posts(title, slug, status) values ('Existing post', 'backfilled-url', 'published')" >/dev/null
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20261007055822_post_slug_routes.sql" >/dev/null
"${psql_cmd[@]}" -c "do \$\$ begin if not exists (select 1 from public.post_slug_routes where slug = 'backfilled-url' and was_published) then raise exception 'Backfill failed'; end if; end \$\$; delete from public.posts where slug = 'backfilled-url';" >/dev/null
"${psql_cmd[@]}" -f "$repo_root/database/tests/post_slug_routes.sql" >/dev/null

# The second writer starts while the first owns an uncommitted reservation.
"${psql_cmd[@]}" <<'SQL' > "$work_dir/winner.log" 2>&1 &
begin;
insert into public.posts(title, slug) values ('Concurrent winner', 'concurrent-url');
select pg_sleep(1);
commit;
SQL
winner_pid=$!
# Synchronize on the first transaction holding a RowExclusiveLock.
for attempt in $(seq 1 100); do
  if [ "$("${psql_cmd[@]}" -Atc "select count(*) from pg_locks where relation = 'public.post_slug_routes'::regclass and mode = 'RowExclusiveLock' and granted")" -gt 0 ]; then break; fi
  sleep 0.01
done
if "${psql_cmd[@]}" -c "insert into public.posts(title, slug) values ('Concurrent loser', 'concurrent-url')" > "$work_dir/loser.log" 2>&1; then
  echo 'Concurrent duplicate unexpectedly succeeded' >&2
  exit 1
fi
wait "$winner_pid"
rg -q 'duplicate key|already reserved' "$work_dir/loser.log"
[ "$("${psql_cmd[@]}" -Atc "select count(*) from public.posts where slug = 'concurrent-url'")" = 1 ]

# A new post cannot take an old published URL while its rename is committing.
"${psql_cmd[@]}" -c "insert into public.posts(title, slug, status) values ('Race rename', 'rename-source', 'published')" >/dev/null
"${psql_cmd[@]}" <<'SQL' > "$work_dir/rename.log" 2>&1 &
begin;
update public.posts set slug = 'rename-target' where slug = 'rename-source';
select pg_sleep(1);
commit;
SQL
rename_pid=$!
for attempt in $(seq 1 100); do
  if [ "$("${psql_cmd[@]}" -Atc "select count(*) from pg_locks where relation = 'public.post_slug_routes'::regclass and mode = 'RowExclusiveLock' and granted")" -gt 0 ]; then break; fi
  sleep 0.01
done
if "${psql_cmd[@]}" -c "insert into public.posts(title, slug) values ('Race hijack', 'rename-source')" > "$work_dir/hijack.log" 2>&1; then
  echo 'Concurrent old URL hijack unexpectedly succeeded' >&2
  exit 1
fi
wait "$rename_pid"
rg -q 'duplicate key|already reserved' "$work_dir/hijack.log"
[ "$("${psql_cmd[@]}" -Atc "select count(*) from public.post_slug_routes where slug in ('rename-source', 'rename-target')")" = 2 ]
echo 'Post slug backfill, constraints, redirects, RLS, rollback and concurrency checks passed.'
