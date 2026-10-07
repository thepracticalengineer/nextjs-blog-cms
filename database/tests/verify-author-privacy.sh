#!/usr/bin/env bash
# Isolated PostgreSQL + PostgREST integration proof. Requires psql, PostgreSQL
# server binaries, Python 3, Docker, and the PostgREST image already downloaded.
# Run: bash database/tests/verify-author-privacy.sh
set -euo pipefail
repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
pg_bin=${PG_BIN:-$(pg_config --bindir)}
rest_image=${POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v14.5}
docker image inspect "$rest_image" >/dev/null
work_dir=$(mktemp -d)
container_name="issue61-privacy-$$"
read -r pg_port rest_port < <(python3 - <<'PY'
import socket
with socket.socket() as a, socket.socket() as b:
    a.bind(('127.0.0.1', 0)); b.bind(('127.0.0.1', 0))
    print(a.getsockname()[1], b.getsockname()[1])
PY
)
cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
  "$pg_bin/pg_ctl" -D "$work_dir/data" stop >/dev/null 2>&1 || true
  rm -rf "$work_dir"
}
trap cleanup EXIT
"$pg_bin/initdb" -D "$work_dir/data" -A trust > "$work_dir/init.log"
"$pg_bin/pg_ctl" -D "$work_dir/data" -l "$work_dir/postgres.log" -o "-p $pg_port -k $work_dir" start >/dev/null
psql_cmd=(psql -h "$work_dir" -p "$pg_port" -d postgres -v ON_ERROR_STOP=1)
"${psql_cmd[@]}" <<'SQL' >/dev/null
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role BYPASSRLS;
CREATE ROLE authenticator LOGIN;
GRANT anon, authenticated TO authenticator;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid primary key, email text, raw_user_meta_data jsonb);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE SQL STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
SQL
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20260317000000_initial_schema.sql" >/dev/null
# Apply the real profile column definitions, omitting unrelated storage setup.
python3 - "$repo_root" "$work_dir" <<'PY'
from pathlib import Path
import sys
source = (Path(sys.argv[1]) / 'supabase/migrations/20260417000000_add_profile_fields.sql').read_text()
(Path(sys.argv[2]) / 'fields.sql').write_text(source.split('-- Create avatars storage bucket')[0].replace('BEGIN;', ''))
PY
"${psql_cmd[@]}" -f "$work_dir/fields.sql" >/dev/null
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20260325000000_add_comments.sql" >/dev/null
"${psql_cmd[@]}" -c 'GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role' >/dev/null
"${psql_cmd[@]}" -f "$repo_root/supabase/migrations/20261006160738_public_author_profiles.sql" >/dev/null
"${psql_cmd[@]}" -f "$repo_root/database/tests/public_author_profiles.sql" >/dev/null
"${psql_cmd[@]}" <<'SQL' >/dev/null
INSERT INTO auth.users (id,email,raw_user_meta_data) VALUES
 ('61000000-0000-4000-8000-000000000001','private@example.test','{"full_name":"Public Author"}');
INSERT INTO public.posts (id,title,slug,status,author_id) VALUES
 ('61000000-0000-4000-8000-000000000010','Public Post','public-post','published','61000000-0000-4000-8000-000000000001');
INSERT INTO public.comments (post_id,author_id,content) VALUES
 ('61000000-0000-4000-8000-000000000010','61000000-0000-4000-8000-000000000001','Comment');
SQL
# Host networking keeps this disposable stack independent of existing Supabase.
docker run -d --rm --name "$container_name" --network host \
  -e "PGRST_DB_URI=postgres://authenticator@127.0.0.1:$pg_port/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e "PGRST_SERVER_PORT=$rest_port" "$rest_image" >/dev/null
python3 - "$rest_port" <<'PY'
import json, sys, time, urllib.parse, urllib.request
base = f'http://127.0.0.1:{sys.argv[1]}'
def get(table, selection):
    return json.load(urllib.request.urlopen(base + '/' + table + '?' + urllib.parse.urlencode({'select': selection}), timeout=2))
for attempt in range(30):
    try:
        author = get('public_author_profiles', '*')[0]
        break
    except (OSError, IndexError):
        time.sleep(.2)
else:
    raise AssertionError('PostgREST did not start')
assert author['full_name'] == 'Public Author'
assert not set(author).intersection({'email', 'role', 'created_at', 'updated_at'})
assert get('profiles', '*') == []
for table, fk in [('posts', 'posts_author_id_fkey'), ('comments', 'comments_author_id_fkey')]:
    result = get(table, f'id,author:public_author_profiles!{fk}(id,full_name,avatar_url)')
    assert len(result) == 1 and result[0]['author']['full_name'] == 'Public Author', result
print('Author privacy SQL assertions and PostgREST post/comment joins passed.')
PY
