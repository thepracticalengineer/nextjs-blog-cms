# Client auth state and profiles

`AuthProvider` wraps the dashboard and AI assistant layouts. It supplies client
session/profile state; authorization still belongs to server identity, MFA, role,
ownership and RLS checks. Client profile state must never grant privileged access.

Auth callbacks synchronously record the latest session. Profile requests run in a
separate effect keyed by identity and explicit refresh. `INITIAL_SESSION` and the
initial `getSession()` lookup share one profile request for the same identity.
A newer auth event takes precedence over the initial lookup. Token refreshes and
repeated same-user events update the session without fetching the profile again.
The context value stays stable when its exposed fields have not changed. A token
refresh that changes the session still notifies context consumers.

Logout or an account change immediately hides the previous profile and error.
Pending profile requests are aborted on identity change, refresh or unmount;
obsolete responses are ignored even if cancellation is not honored. Each identity
transition has a version, so switching A → B → A cannot restore an earlier A
request. Strict Mode cleanup also invalidates the previous subscription/lookup.

## Loading, failures and refresh

`useProfile()` returns `{ profile, loading, error, refreshProfile }`.
`useAuth()` exposes the same error as `profileError`, along with `session`, `user`
and `refreshProfile`. `useSession()` retains `{ session, user, loading }`.

Loading covers session initialization and the current profile request. Each has a
10-second deadline. Query errors, rejected requests, missing profiles and timeouts
end loading, clear the profile and expose a neutral error without provider details.
There is no automatic retry loop. Same-user auth events do not retry a failed
profile request.
An auth event received after initialization times out can still recover the session
and start loading its profile without a manual retry; the timed-out lookup itself
remains obsolete.

Call `refreshProfile()` to retry or reload after an explicit profile change. It
clears the current profile/error and supersedes the pending request. If session
initialization failed, it also retries initialization with a fresh subscription.
Even for the same account, refreshing temporarily returns `profile: null` and
`loading: true` until the new request settles. Consumers should account for that
loading state when reloading after a save.
While signed out, refreshing makes no profile query. Consumers can render the error
and a retry control; currently the exported auth hooks have no production consumers.

No database migration, additional secret or hosted Auth setting is required.
See [verification](../development/testing.md#client-auth-provider-verification) for
local regression coverage and its limits.
