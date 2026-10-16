-- Public account pressure escalates to proof, never a global victim lockout.
-- Preserve the original migration for installations that have already applied it.
drop function public.reserve_auth_attempt(text,text,text);
create function public.reserve_auth_attempt(
  p_action text, p_ip_key text, p_account_key text,
  p_bot_protection boolean default false, p_challenge_passed boolean default false, p_challenge_failed boolean default false,
  p_phase text default 'all', p_ip_attempts integer default 0
) returns jsonb
language plpgsql security invoker set search_path = '' set statement_timeout = '3s'
as $$
declare
  account_limit integer;
  ip_limit integer;
  public_action boolean := p_action in ('login','signup','recovery','confirmation');
  entry public.auth_attempt_buckets%rowtype;
  account_entry public.auth_attempt_buckets%rowtype;
  account_attempts integer := 0;
  wait_seconds integer := 0;
  challenge boolean := false;
  started_at timestamptz := clock_timestamp();
begin
  case p_action
    when 'login' then account_limit := 10; ip_limit := 100;
    when 'signup' then account_limit := 5; ip_limit := 20;
    when 'recovery' then account_limit := 5; ip_limit := 30;
    when 'confirmation' then account_limit := 5; ip_limit := 30;
    when 'password' then account_limit := 10; ip_limit := 100;
    when 'reauthentication' then account_limit := 3; ip_limit := 30;
    else raise exception 'Invalid auth action' using errcode = '22023';
  end case;
  if p_phase is null or p_phase not in ('all','ip','account') then raise exception 'Invalid reservation phase' using errcode = '22023'; end if;
  if p_ip_key is null or p_account_key is null or p_bot_protection is null or p_challenge_passed is null or p_challenge_failed is null or
    p_ip_key !~ '^[a-f0-9]{64}$' or p_account_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid auth key' using errcode = '22023';
  end if;

  -- IP is always charged, including tokenless/invalid-proof traffic. Lock IP
  -- before account in every reservation and avoid new rows behind exhausted IPs.
  if p_phase <> 'account' then
  insert into public.auth_attempt_buckets as existing (bucket_key, attempts, expires_at)
    values (p_action || ':ip:' || p_ip_key, 1, started_at + interval '10 minutes')
    on conflict (bucket_key) do update set
      attempts = case when existing.expires_at <= started_at then 1 else least(existing.attempts + 1, ip_limit + 1) end,
      expires_at = case when existing.expires_at <= started_at then excluded.expires_at else existing.expires_at end
    returning * into entry;
  else
    if p_ip_attempts is null or p_ip_attempts < 1 or p_ip_attempts > ip_limit then
      raise exception 'Invalid IP reservation' using errcode = '22023';
    end if;
    entry.attempts := p_ip_attempts;
  end if;
  if entry.attempts > ip_limit then
    wait_seconds := greatest(1, ceil(extract(epoch from entry.expires_at - started_at))::integer);
  elsif p_phase <> 'ip' then
    -- Lock existing account state without charging denied challenges or creating
    -- login failures. IP serialization also protects first-use email counters.
    perform pg_advisory_xact_lock(hashtextextended('auth-abuse:' || p_action || ':account:' || p_account_key, 0));
    select * into account_entry from public.auth_attempt_buckets
      where bucket_key = p_action || ':account:' || p_account_key for update;
    if account_entry.expires_at > started_at then account_attempts := account_entry.attempts; end if;
    challenge := public_action and p_bot_protection and not p_challenge_passed
      and (p_challenge_failed or account_attempts >= 3 or entry.attempts > 15);
    if not challenge then
      if not (public_action and p_bot_protection) and account_attempts >= account_limit then
        wait_seconds := greatest(1, ceil(extract(epoch from account_entry.expires_at - started_at))::integer);
      elsif p_action <> 'login' then
        insert into public.auth_attempt_buckets as existing (bucket_key, attempts, expires_at)
          values (p_action || ':account:' || p_account_key, 1, started_at + interval '10 minutes')
          on conflict (bucket_key) do update set
            attempts = case when existing.expires_at <= started_at then 1 else least(existing.attempts + 1, account_limit + 1) end,
            expires_at = case when existing.expires_at <= started_at then excluded.expires_at else existing.expires_at end;
      end if;
    end if;
  end if;
  delete from public.auth_attempt_buckets where bucket_key in (
    select bucket_key from public.auth_attempt_buckets where expires_at < started_at - interval '1 day'
    order by expires_at limit 100 for update skip locked
  );
  return jsonb_build_object('allowed', wait_seconds = 0, 'retry_after', wait_seconds, 'challenge_required', challenge, 'ip_attempts', entry.attempts);
end;
$$;
revoke all on function public.reserve_auth_attempt(text,text,text,boolean,boolean,boolean,text,integer) from public, anon, authenticated;
grant execute on function public.reserve_auth_attempt(text,text,text,boolean,boolean,boolean,text,integer) to service_role;

-- Only actual provider credential rejections charge login account pressure.
-- Never clear shared state after success: that would erase concurrent failures.
create function public.record_auth_login_failure(p_account_key text) returns void
language plpgsql security invoker set search_path = '' set statement_timeout = '3s'
as $$
declare started_at timestamptz := clock_timestamp();
begin
  if p_account_key is null or p_account_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid auth key' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('auth-abuse:login:account:' || p_account_key, 0));
  insert into public.auth_attempt_buckets as existing (bucket_key, attempts, expires_at)
    values ('login:account:' || p_account_key, 1, started_at + interval '10 minutes')
    on conflict (bucket_key) do update set
      attempts = case when existing.expires_at <= started_at then 1 else least(existing.attempts + 1, 11) end,
      expires_at = case when existing.expires_at <= started_at then excluded.expires_at else existing.expires_at end;
end;
$$;
revoke all on function public.record_auth_login_failure(text) from public, anon, authenticated;
grant execute on function public.record_auth_login_failure(text) to service_role;
