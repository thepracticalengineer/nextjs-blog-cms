-- Run only against an isolated migrated database. Fixtures are rolled back.
begin;
do $$
declare
  result jsonb;
  account_key text := repeat('a', 64);
  ip_key text := repeat('b', 64);
  expiry timestamptz;
  limiter_signature constant text := 'public.reserve_auth_attempt(text,text,text,boolean,boolean,boolean,text,integer)';
  bucket_table constant text := 'public.auth_attempt_buckets';
  password_account constant text := 'password:account:' || account_key;
begin
  if has_function_privilege('anon', limiter_signature, 'execute')
    or has_function_privilege('authenticated', limiter_signature, 'execute') then
    raise exception 'Auth limiter must be service-role-only';
  end if;
  if has_table_privilege('anon', bucket_table, 'select')
    or has_table_privilege('authenticated', bucket_table, 'select') then
    raise exception 'Auth counters exposed';
  end if;
  if not (select relrowsecurity from pg_class where oid = bucket_table::regclass) then raise exception 'RLS not enabled'; end if;
  for i in 1..10 loop
    result := public.reserve_auth_attempt('password', ip_key, account_key);
    if not (result->>'allowed')::boolean then raise exception 'Early rejection: %', i; end if;
    if (result->>'challenge_required')::boolean then raise exception 'Wrong challenge threshold'; end if;
  end loop;
  select expires_at into expiry from public.auth_attempt_buckets where bucket_key = password_account;
  result := public.reserve_auth_attempt('password', repeat('c',64), account_key);
  if (result->>'allowed')::boolean or (result->>'retry_after')::integer < 1 then raise exception 'Account rotation bypass'; end if;
  if (select expires_at from public.auth_attempt_buckets where bucket_key = password_account) <> expiry then raise exception 'Blocked retries extended lockout'; end if;
  update public.auth_attempt_buckets set expires_at = clock_timestamp() - interval '1 second' where bucket_key like 'password:%';
  result := public.reserve_auth_attempt('password', ip_key, account_key);
  if not (result->>'allowed')::boolean or (result->>'challenge_required')::boolean then raise exception 'Legitimate retry blocked'; end if;
  for i in 1..101 loop
    result := public.reserve_auth_attempt('login', ip_key, lpad(to_hex(i),64,'0'));
    if (result->>'allowed')::boolean <> (i <= 100) then raise exception 'IP rotation bypass at %', i; end if;
    if i = 101 and exists (select 1 from public.auth_attempt_buckets where bucket_key = 'login:account:' || lpad(to_hex(i),64,'0')) then raise exception 'Exhausted IP created a new account bucket'; end if;
  end loop;
  begin
    perform public.reserve_auth_attempt('invalid', ip_key, account_key);
    raise exception 'Invalid action accepted';
  exception when invalid_parameter_value then null;
  end;
end $$;
rollback;
