-- Internal counters contain HMACs only; public clients cannot read or reserve them.
create table public.auth_attempt_buckets (
  bucket_key text primary key,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null
);
alter table public.auth_attempt_buckets enable row level security;
revoke all on public.auth_attempt_buckets from public, anon, authenticated;
grant select, insert, update, delete on public.auth_attempt_buckets to service_role;
create index auth_attempt_buckets_expiry_idx on public.auth_attempt_buckets (expires_at);

create function public.reserve_auth_attempt(p_action text, p_ip_key text, p_account_key text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
set statement_timeout = '3s'
as $$
declare
  account_limit integer;
  ip_limit integer;
  window_seconds integer := 600;
  bucket text;
  entry public.auth_attempt_buckets%rowtype;
  limit_count integer;
  wait_seconds integer := 0;
  challenge boolean := false;
  current_time_at_start timestamptz := clock_timestamp();
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
  if p_ip_key is null or p_account_key is null or
    p_ip_key !~ '^[a-f0-9]{64}$' or p_account_key !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid auth key' using errcode = '22023';
  end if;

  -- Always lock IP before account. Requests share a consistent lock order,
  -- and exhausted IPs cannot grow the table by rotating account identifiers.
  foreach bucket in array array[
    p_action || ':ip:' || p_ip_key, p_action || ':account:' || p_account_key
  ] loop
    limit_count := case when bucket = p_action || ':ip:' || p_ip_key then ip_limit else account_limit end;
    insert into public.auth_attempt_buckets as existing (bucket_key, attempts, expires_at)
      values (bucket, 1, current_time_at_start + make_interval(secs => window_seconds))
      on conflict (bucket_key) do update set
        attempts = case when existing.expires_at <= current_time_at_start then 1 else least(existing.attempts + 1, limit_count + 1) end,
        expires_at = case when existing.expires_at <= current_time_at_start then excluded.expires_at else existing.expires_at end
      returning * into entry;
    if entry.attempts > limit_count then
      wait_seconds := greatest(wait_seconds, greatest(1, ceil(extract(epoch from entry.expires_at - current_time_at_start))::integer));
    end if;
    challenge := challenge or entry.attempts > case when bucket = p_action || ':ip:' || p_ip_key then 15 else 3 end;
    exit when bucket = p_action || ':ip:' || p_ip_key and wait_seconds > 0;
  end loop;

  -- Bounded opportunistic cleanup; no raw identifiers or permanent lockouts.
  delete from public.auth_attempt_buckets where bucket_key in (
    select bucket_key from public.auth_attempt_buckets
    where expires_at < current_time_at_start - interval '1 day'
    order by expires_at limit 100 for update skip locked
  );
  return jsonb_build_object('allowed', wait_seconds = 0, 'retry_after', wait_seconds, 'challenge_required', challenge);
end;
$$;
revoke all on function public.reserve_auth_attempt(text,text,text) from public, anon, authenticated;
grant execute on function public.reserve_auth_attempt(text,text,text) to service_role;
