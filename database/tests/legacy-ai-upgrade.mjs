// Run only against the designated disposable local/CI stack. DDL, fixtures and
// the migration replay share one transaction; errors/disconnection roll it back.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { accessSync, constants, readFileSync } from 'node:fs'

// Ubuntu CI and the designated Linux development host use this trusted binary.
const dockerExecutable = '/usr/bin/docker'
accessSync(dockerExecutable, constants.X_OK)
const container = 'supabase_db_nextjs-blog-cms'
const labels = JSON.parse(execFileSync(dockerExecutable, ['inspect', container, '--format', '{{json .Config.Labels}}'], { encoding: 'utf8' }))
assert.equal(labels['com.supabase.cli.project'], 'nextjs-blog-cms', 'Refusing to use an unrelated database')
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261020134445_retire_legacy_ai_api.sql')
// Remove only transaction delimiters, preserving the exact migration statements.
assert.equal((migration.match(/^BEGIN;$/gm) ?? []).length, 1)
assert.equal((migration.match(/^COMMIT;$/gm) ?? []).length, 1)
let sql = 'BEGIN;\nALTER TABLE public.api_keys DROP CONSTRAINT api_keys_retired;\n'
for (const [table, policy] of [
  ['api_keys', 'Owners can export retired api keys'],
  ['llm_provider_keys', 'Authors manage own provider keys'],
  ['ai_books', 'Owners can export retired books'],
  ['ai_chats', 'Owners can export retired chats'],
  ['ai_messages', 'Owners can export retired messages'],
  ['ai_generated_posts', 'Owners can export retired provenance'],
]) sql += `DROP POLICY "${policy}" ON public.${table};\n`
for (const operation of ['inserts', 'updates', 'deletes']) {
  sql += `DROP POLICY "Retired AI books reject ${operation}" ON storage.objects;\n`
}
// Reconstruct original policies from their source migrations, retaining MFA.
for (const path of [
  'supabase/migrations/20260407000000_create_api_keys_table.sql',
  'supabase/migrations/20260408000000_create_ai_assistant_tables.sql',
]) {
  for (const [statement] of read(path).matchAll(/CREATE POLICY[\s\S]*?;/g)) {
    if (!statement.includes('Users can read own PDFs')) sql += `${statement}\n`
  }
}
sql += 'ALTER TABLE public.api_keys ALTER COLUMN is_active SET DEFAULT true;\n'
sql += `GRANT ALL ON public.api_keys, public.llm_provider_keys, public.ai_books,
 public.ai_chats, public.ai_messages, public.ai_generated_posts TO anon, authenticated;\n`
// Reuse the same populated fixtures as the ownership suite, before its helpers.
const fixtureSections = read('database/tests/legacy_ai_retirement.sql').split('-- END RETIREMENT FIXTURES')
assert.equal(fixtureSections.length, 2, 'Expected exactly one retirement fixture boundary')
const [fixture] = fixtureSections
assert.ok(fixture.includes('INSERT INTO public.llm_provider_keys'))
assert.doesNotMatch(fixture, /^\s*(?:COMMIT|ROLLBACK);/im, 'Fixtures must stay inside the replay transaction')
sql += fixture.slice(fixture.indexOf('BEGIN;') + 'BEGIN;'.length)
sql += `UPDATE public.api_keys SET is_active = true WHERE key_hash = (SELECT key_hash FROM pg_temp.retirement_fixture());
CREATE TEMP TABLE preservation_snapshot (relation_name text, rows jsonb);
CREATE TEMP TABLE api_key_snapshot AS SELECT to_jsonb(k) - 'is_active' AS row FROM public.api_keys k;
`
for (const table of ['llm_provider_keys', 'ai_books', 'ai_chats', 'ai_messages', 'ai_generated_posts', 'posts']) {
  sql += `INSERT INTO preservation_snapshot SELECT '${table}', coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]'::jsonb) FROM public.${table} t;\n`
}
sql += migration.replace(/^BEGIN;$/m, '').replace(/^COMMIT;$/m, '')
sql += `DO $$ DECLARE r record; current_rows jsonb; BEGIN
 FOR r IN SELECT * FROM preservation_snapshot LOOP
  EXECUTE format('SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY id), ''[]''::jsonb) FROM public.%I t',r.relation_name) INTO current_rows;
  ASSERT current_rows = r.rows, 'Migration changed preserved rows: ' || r.relation_name;
 END LOOP;
 ASSERT NOT EXISTS (
  (SELECT row FROM api_key_snapshot EXCEPT SELECT to_jsonb(k) - 'is_active' FROM public.api_keys k)
  UNION ALL
  (SELECT to_jsonb(k) - 'is_active' FROM public.api_keys k EXCEPT SELECT row FROM api_key_snapshot)
 ), 'Migration changed API key history';
 ASSERT (SELECT is_active FROM public.api_keys WHERE key_hash = (SELECT key_hash FROM pg_temp.retirement_fixture())) IS FALSE, 'Migration failed to revoke active fixture';
 ASSERT NOT EXISTS(SELECT 1 FROM public.api_keys WHERE is_active IS DISTINCT FROM false), 'Active keys remain after upgrade';
END $$;
ROLLBACK;
`
const result = spawnSync(dockerExecutable, ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-q', '-v', 'ON_ERROR_STOP=1'], {
  input: sql, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024,
})
if (result.error) throw result.error
assert.equal(result.status, 0, result.stderr || result.stdout)
console.log('PASS: populated retirement migration revokes active keys and preserves ciphertext, API key metadata, AI history, posts and provenance; all changes rolled back')
