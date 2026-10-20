# Roles and Permissions

| Role   | Access                                          |
| ------ | ----------------------------------------------- |
| Admin  | Full control (users, posts, roles, comments; own provider settings) |
| Author | Create and manage own posts, delete own comments |

Session clients enforce Supabase RLS. Service-role clients bypass RLS and must perform explicit authentication, ownership and role checks. Authors and admins manage only their own encrypted provider keys in Settings → AI Providers, with cookie authentication and MFA. External developer keys are revoked and their API/UI is retired; admins receive no cross-owner provider-key access.

Public email/password, Google, and GitHub signup all use the database default `author` role with immediate author access, including publishing (subject to publication checks). There is no pending-contributor approval state; issue #111 tracks any future invitation/approval policy. Provider names, avatars, and editable user metadata never assign roles. Existing linked identities retain their user ID and database role. See [social authentication](../setup/social-auth.md) for identity and MFA behavior.

## Signing out

Both the public account menu and dashboard sidebar use the same logout flow.
**Sign out** explicitly revokes the current session (`local` scope); **Sign out
all devices** requests `global` revocation. The editor's unsaved-writing guard
runs before either action. Cancelling keeps the session and writing intact;
accepting preserves local draft recovery.

Logout clears this project's session cookies, including all chunks, cached-user
cookies and PKCE verifiers, even when Auth returns an error or the app request
fails. Other projects' cookies, password-recovery grants and editor recovery data
are preserved. A full navigation to login discards cached private UI and client
Auth state. If browser cleanup fails, the control stays in place and offers retry.

Remote revocation has one five-second deadline. A logout 401/403 triggers one refresh
with the existing refresh token and one revocation retry within that deadline;
renewed or provider credentials are never persisted. When it cannot be confirmed, the
login page explains that this browser is signed out but other sessions may remain
active. Clearing browser credentials does not revoke a copied access token:
Supabase access tokens remain valid until expiry. See
[Supabase sign-out scopes](https://supabase.com/docs/guides/auth/signout).

`POST /api/auth/signout` defaults to `?scope=local` and also accepts `global`.
Successful revocation (or an already absent local session) returns `204`.
Unconfirmed revocation returns `503` with
`{ "localCleared": true, "remoteRevoked": false, "code": "SIGNOUT_REVOCATION_FAILED" }`
and cookie deletions. Invalid scopes return `400` without changing credentials.
Responses use `Cache-Control: no-store`; provider errors and credentials are never
returned. The endpoint uses the supplied cookie token only for remote revocation,
without trusting its contents for application authorization.

See [MFA verification and recovery](mfa.md) for authenticator selection, recoverable failures, sign-out and administrator-assisted recovery.
