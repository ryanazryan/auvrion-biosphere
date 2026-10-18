# AB-WC-003 — Account Provisioning & Activation (Development Candidate)

## Scope and security baseline

This candidate continues AB-WC-003 after PR #20. It enables admin-controlled provisioning for approved applicants, one-time email activation, Better Auth credential setup, existing TOTP enrollment, and guarded transition to `user_access.active`.

**Not approved for production or merge until reviewed and locally tested.** It intentionally preserves `emailAndPassword.disableSignUp = true`. All new APIs are development-only, local-origin restricted, and invitation email is sent only to Mailpit.

## End-to-end flow

1. Fresh applicant submits application and verifies their email. Admin with `manage_access` + valid session-bound MFA approves the application.
2. In Approved application's admin drawer, admin explicitly assigns one operational role (`operator`, `supervisor`, or `ranger`) and clicks **Buat Akun & Kirim Undangan**.
3. A single DB transaction creates a Better Auth identity (verified email but **no password**), `user_access.pending_activation`, an org-scoped `role_grants` row, and a SHA-256 hashed 256-bit invitation token. No applicant session or active access is granted.
4. System sends a 30-minute invitation `/activate#token=...` via local Mailpit. The browser hash fragment is not sent to the Next.js server in request URLs. SMTP failure leaves the provisioning transaction intact; admin can rotate/resend after 60 seconds.
5. Applicant opens invite and chooses 16–128-character password. `consume` checks token, expiry, approval, binding, grant, pending status and preexisting credential under transactional row lock; inserts a Better Auth-compatible hashed `credential` account, then marks token consumed in the same transaction.
6. Applicant signs in with new password and enrolls/validates TOTP on existing `/account/security/enroll` route. Save recovery codes; proceed to `/account/activation/finalize`.
7. `complete` checks the current Better Auth session, approved application, consumed invitation, password credential, active operational grant, verified TOTP and account binding; changes status to `active` and **revokes all pre-enrollment sessions**. User signs in again with password and TOTP for an MFA-assured session.
8. Applicant status shows step 4 completed only after `user_access.status = active`.

## Guarantees

- Admin approval is **not** account activation. Applicant cannot self-assign a role or admin grant.
- Token stored only as SHA-256 hash; single-use, 30-minute expiry, rotated on resend.
- Admin provisioning requires `manage_access` and MFA; repeated initial provision cannot create a second account.
- Password hashing uses Better Auth's `hashPassword` with the same credential table layout already used in `scripts/dev/bootstrap-admin.mjs`.
- A password-only session while `pending_activation` does not pass `checkAccountAccess`.
- A new user must enroll TOTP before active access, and all old sessions are revoked on activation.
- SMTP send is after DB commit; failed delivery does not reverse provisioning. This batch has **manual** resend/token rotation, not an encrypted durable invitation outbox or scheduled worker.

## Integration

From your **local** `feat/ab-wc-003-account-provisioning-activation` branch:

```bash
# Place the ZIP at repository root; inspect file list first.
unzip -l AB-WC-003-account-provisioning-activation-candidate.zip

# Extract ONLY new source/doc files and guarded integration helper.
unzip -n AB-WC-003-account-provisioning-activation-candidate.zip 'src/*' 'docs/*' 'apply-existing.py'

# Applies integration anchors only if existing files match the inspected develop baseline.
python apply-existing.py

# Format candidate then check static quality.
npx biome check --write src/server/account-activation/ src/server/db/account-activation-schema.ts src/app/api/admin/access-applications/ src/app/api/account/activation/ src/app/activate/ src/app/account/activation/ src/components/admin/application-provisioning-actions.tsx src/components/auth/activation-form.tsx src/components/auth/activation-finalization.tsx drizzle.config.ts src/app/admin/access-applications/page.tsx src/components/admin/access-applications-workspace.tsx src/components/auth/totp-enrollment.tsx src/components/auth/two-factor-form.tsx src/components/auth/access-application-progress.tsx src/app/request-access/status/page.tsx
npm run lint
npm run typecheck
npm test
```

Next, after inspecting the config and schema:

```bash
# Generates new DB schema migration; should only add account_activation_invites.
npx drizzle-kit generate
# STOP: inspect the generated SQL/snapshot/journal for unexpected destructive changes.
ls drizzle/*.sql
# Apply only once you have reviewed the migration and confirmed the DB guard.
npx drizzle-kit migrate
npm run build

git diff --check
git status -sb
```

Never run `drizzle-kit push`, `git clean`, or `git reset --hard` for this feature. Do not stage ZIP/helper script or local secrets.

## Manual acceptance (required before commit)

1. Create a *fresh* test applicant and approve via authenticated admin with MFA.
2. Admin selects `ranger` (or other role), creates account. Verify Mailpit contains an invitation URL with `#token=`, not `?token=`. Verify DB identity/user_access exists, **no credential yet**, `pending_activation` and explicit role grant.
3. Applicant visits URL, enters long password, receives success. Reopening the same token must be denied.
4. Applicant signs in with password: only TOTP enrollment page is eligible, no operational/admin data allowed.
5. Applicant finishes TOTP + saves recovery codes + finalizes activation; expect active user_access and invalidated old sessions. Fresh login requires TOTP.
6. Applicant status recovery page shows all four progress steps completed.
7. Negative cases: issue without approved app, unverified app, repeated provision, cross-origin, missing MFA/grant, invalid role, expired/replayed token, concurrent token replay, password too short, missing/revoked role, missing TOTP, disabled account. Existing active admin must still log in after TOTP.
8. Stop Mailpit before provisioning; verify status remains pending, `delivery=failed`. Restore Mailpit; after 60s use resend. Old token must be invalid after rotation.

Read-only SQL:

```sql
SELECT a.email, a.status AS application_status, ua.status AS access_status,
       u.email_verified, u.two_factor_enabled, i.used_at, i.sent_at,
       g.role, g.revoked_at
FROM access_applications a
LEFT JOIN user_access ua ON ua.application_id=a.id
LEFT JOIN "user" u ON u.id=ua.user_id
LEFT JOIN account_activation_invites i ON i.application_id=a.id
LEFT JOIN role_grants g ON g.user_id=ua.user_id
WHERE a.email='replace-with-local-test@auvriondev.test';
```

## Known limitations

- Local-only feature. Organization-scoped applications, public endpoint abuse controls/rate limiting, production mail infrastructure, durable invitation outbox and unattended retry are out of scope.
- Role grant initial assignment exists; grant/revoke/disable and comprehensive lifecycle audit are future AB-WC-003 work.
- Pure token unit tests are included; actual DB-backed integration/E2E and reviewer sign-off **not performed by this source bundle**.
- The user's local dependencies, migrations, and tests must pass before PR. This package has only been syntax/parsing checked outside the local project.
