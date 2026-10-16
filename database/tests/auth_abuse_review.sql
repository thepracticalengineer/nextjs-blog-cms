-- Review regressions: disposable database only; no user/profile/mail fixtures.
begin;
do $$
declare
  result jsonb;
  ip text := repeat('d',64);
  account text := repeat('e',64);
begin
  -- More than ten successful logins do not create account failures.
  for i in 1..20 loop
    result := public.reserve_auth_attempt('login', ip, account, false, false);
    if not (result->>'allowed')::boolean then raise exception 'Successful logins exhausted budget'; end if;
  end loop;
  if exists(select 1 from public.auth_attempt_buckets where bucket_key = 'login:account:' || account) then raise exception 'Reservation counted as login failure'; end if;
  -- Only reported credential failures charge the account; botless traffic cannot extend it.
  for i in 1..3 loop perform public.record_auth_login_failure(account); end loop;
  for i in 1..20 loop
    result := public.reserve_auth_attempt('login', ip, account, true, false);
    if not (result->>'challenge_required')::boolean then raise exception 'Missing login challenge'; end if;
  end loop;
  if (select attempts from public.auth_attempt_buckets where bucket_key = 'login:account:' || account) <> 3 then raise exception 'Tokenless traffic charged account'; end if;
  for i in 1..20 loop perform public.record_auth_login_failure(account); end loop;
  result := public.reserve_auth_attempt('login', repeat('f',64), account, true, true);
  if not (result->>'allowed')::boolean or (result->>'challenge_required')::boolean then raise exception 'Human cannot escape targeted account lockout'; end if;
  result := public.reserve_auth_attempt('recovery', ip, account, true, false, true);
  if not (result->>'challenge_required')::boolean or exists(select 1 from public.auth_attempt_buckets where bucket_key = 'recovery:account:' || account) then raise exception 'Rejected proof charged an account'; end if;
  -- Recovery is also recoverable, even after ongoing tokenless abuse.
  for i in 1..30 loop result := public.reserve_auth_attempt('recovery', ip, account, true, false); end loop;
  if (select attempts from public.auth_attempt_buckets where bucket_key = 'recovery:account:' || account) <> 3 then raise exception 'Tokenless recovery charged account'; end if;
  result := public.reserve_auth_attempt('recovery', repeat('f',64), account, true, true);
  if not (result->>'allowed')::boolean or (result->>'challenge_required')::boolean then raise exception 'Recovery blocked after proof'; end if;
  if has_function_privilege('anon', 'public.record_auth_login_failure(text)', 'execute') or has_function_privilege('authenticated', 'public.record_auth_login_failure(text)', 'execute') then raise exception 'Public failure mutation'; end if;
end $$;
rollback;
