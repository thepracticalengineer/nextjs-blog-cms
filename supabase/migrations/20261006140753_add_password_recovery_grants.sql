-- Short-lived recovery capabilities are only accessible to trusted server code.
-- A normal authenticated session cannot create, read, or consume a grant.
create table public.password_recovery_grants (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null
);

create index password_recovery_grants_user_id_idx on public.password_recovery_grants (user_id);
create index password_recovery_grants_expires_at_idx on public.password_recovery_grants (expires_at);
alter table public.password_recovery_grants enable row level security;
revoke all on public.password_recovery_grants from public, anon, authenticated, service_role;
grant select, insert, delete on public.password_recovery_grants to service_role;

comment on table public.password_recovery_grants is
  'Single-use recovery grants. Server-only; delete expired rows during routine maintenance.';
