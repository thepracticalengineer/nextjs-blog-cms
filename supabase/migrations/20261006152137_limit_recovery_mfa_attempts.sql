alter table public.password_recovery_grants
  add column mfa_attempts integer not null default 0 check (mfa_attempts between 0 and 5);

-- Reserve before calling Auth, bounding even concurrent or interrupted guesses.
-- Invoker privileges and execution grants keep this RPC server-only.
create function public.reserve_recovery_mfa_attempt(grant_id uuid, recovery_user_id uuid, recovery_session_id uuid)
returns integer
language sql
security invoker
set search_path = ''
as $$
  update public.password_recovery_grants
  set mfa_attempts = mfa_attempts + 1
  where id = grant_id and user_id = recovery_user_id
    and session_id = recovery_session_id and expires_at > now()
    and mfa_attempts < 5
  returning mfa_attempts;
$$;
revoke all on function public.reserve_recovery_mfa_attempt(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.reserve_recovery_mfa_attempt(uuid, uuid, uuid) to service_role;
grant update (mfa_attempts) on public.password_recovery_grants to service_role;
