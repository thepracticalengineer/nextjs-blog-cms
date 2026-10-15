# Multi-factor authentication

Accounts with a verified authenticator must complete MFA before accessing the
dashboard or protected session APIs. Assurance lookup failures remain fail-closed;
loading errors do not redirect from MFA back into a dashboard loop. Successful
verification persists the SDK's AAL2 session and navigates to the validated internal
return path. Password recovery still requires its separate recovery grant and MFA
checks; this flow does not bypass them.

## Verification and retry

The MFA page lists verified TOTP authenticators and lets accounts with multiple
factors select one by its friendly name (or numbered fallback). Switching factors
clears the code. **Retry loading authenticators** refreshes the list after errors,
missing factors or enrollment changes in another browser. It clears the selected
factor and code before fetching; it never removes a factor.

Each submission creates a fresh challenge immediately before verifying the code.
An expired challenge clears the code and asks for a fresh one; the next submission
creates a new challenge. Invalid codes, rate limits, expired sessions, missing
factors, rejected verification and service/connection failures have distinct
instructions. Rate limits require waiting before a manual retry; the app does not
retry verification automatically. Concurrent submissions are blocked from challenge
creation through verification, including repeated Enter presses. Failures release
the submission lock in `finally`; success holds it until navigation completes.

**Sign out** uses the existing local sign-out flow, including local credential
cleanup and its warning if remote revocation cannot be confirmed. It is available
even when factor loading fails. See [logout verification](../development/testing.md#logout-verification).

## Lost authenticators

Expand **Lost access to your authenticator?** on the MFA page. Use another enrolled
authenticator if available. Otherwise, contact the site's administrator through
your established support channel, provide your account email and request identity
verification before MFA recovery. Never send passwords, shared secrets or TOTP codes.
A password-reset email does not remove MFA.

Administrators must verify identity through their established recovery process
before removing a lost factor using privileged Supabase account management. The
application does not provide an AAL1 self-service factor-removal endpoint or recovery
codes. After a verified administrative reset, the user should sign in and enroll a
replacement authenticator from their profile. Site operators must make their support
channel known to users; there is no universal support address configured in this CMS.

## Profile setup and removal

A failed factor lookup shows a retryable error instead of a misleading Disabled
badge. Enrollment creates a fresh challenge on each verification attempt, shares
the verification error categories, and prevents cancellation/removal racing a
pending enrollment verification. Failed cancellation preserves the dialog for retry;
an already removed pending factor is treated as canceled. Removal of a selected
verified factor preserves Enabled status while another verified TOTP factor remains.

Adding a backup authenticator through the profile UI is tracked in
[issue #152](https://github.com/thepracticalengineer/nextjs-blog-cms/issues/152).
The current selector supports accounts that already have multiple enrolled factors.

## Verification limits

The [testing guide](../development/testing.md#mfa-recovery-verification) lists unit,
synthetic desktop/mobile, and real local Auth tests. Hosted Auth configuration,
actual authenticator apps and the site's identity-verification/support process
require separate checks with designated test accounts. No migration or new secret
is required for this change.
