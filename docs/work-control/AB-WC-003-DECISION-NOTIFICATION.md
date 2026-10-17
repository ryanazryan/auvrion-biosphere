# AB-WC-003 — Decision Email Notification (Local V1)

## Scope and security baseline

This batch extends PR #18 (gated onboarding foundation) and PR #19 (applicant status) with **email notification for Approved / Rejected decisions**. It does not activate users, grant roles, log applicants in, or send MFA/activation credentials.

All routes and SMTP delivery in this batch are **development-only**, gated by `NODE_ENV=development`, `ENABLE_LOCAL_ACCESS_REQUESTS=YES`, localhost and server-side administrative capability/MFA checks. The current application queue is not organization-scoped. Production enablement requires org-scoping, anti-abuse controls, deployment-grade mail transport, logging, and a trusted background worker.

## Files introduced

- `src/server/db/access-decision-notification-schema.ts` — decision outbox table and status enums.
- `src/server/access-decision-notifications/content.ts` — Indonesian decision email content.
- `src/server/access-decision-notifications/mailer.ts` — Mailpit SMTP adapter.
- `src/server/access-decision-notifications/retry.ts` — capped exponential retry.
- `src/server/access-decision-notifications/dispatch.ts` — single row claim and delivery.
- `src/server/access-decision-notifications/content.test.ts` — unit tests.
- `src/app/api/admin/access-applications/[id]/decision/route.ts` — full replacement: atomically commits decision, audit, and outbox row.
- `src/app/api/admin/access-notifications/dispatch/route.ts` — authorized local-only retry/drain endpoint.

**Required manual integration:** Add `"./src/server/db/access-decision-notification-schema.ts"` to the schema array in `drizzle.config.ts`. Do not delete existing schema entries.

## Environment, migration, and setup

Existing `.env.local` should contain development values for `DATABASE_URL` (local `auvrion_dev` on `127.0.0.1:5433`), `BETTER_AUTH_URL=http://localhost:3000`, `BETTER_AUTH_SECRET`, `SMTP_HOST=127.0.0.1`, `SMTP_PORT=1025`, `SMTP_FROM`, and `ENABLE_LOCAL_ACCESS_REQUESTS=YES`. Do not commit real secret values.

```bash
npm ci
docker compose --env-file .env.local -f compose.dev.yml up -d db mailpit
npx drizzle-kit generate
```

**STOP and review generated SQL** before applying. Expect the `access_decision_notifications` table and two enum types. The next migration is expected to start with `0008` if `develop` has not added another migration. Do not hand-write journal entries or overwrite historical migrations.

```bash
npx drizzle-kit migrate
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

No need to create new dependencies: `nodemailer` and `@types/nodemailer` already exist on `develop`.

## Manual UI testing

Use one browser for admin (`dev-admin@example.test` with active access, `manage_access`, TOTP MFA assurance) and a different browser/profile for applicants. Create fresh applicant email addresses; existing approved applications cannot be decided twice.

### Approval

1. Open `http://localhost:3000/request-access`, submit a new applicant.
2. Open `/request-access/resend`, request email verification; check `http://localhost:8025`.
3. Confirm verification link and open `/request-access/status`.
4. Sign in as admin, complete TOTP, open `/admin/access-applications`, select the verified applicant, click **Setujui**.
5. Expect the decision to succeed, application status `approved`, and a Mailpit email subject `Permohonan Akses Disetujui — Auvrion Biosphere`.
6. Open the email link. It points to `/request-access/status` and does NOT grant authentication or activation.

### Rejection

1. Repeat with a second fresh applicant.
2. In admin review select **Tolak** and enter a reason of at least five characters.
3. Expect a rejection email with privacy-preserving wording (no internal decision notes) and a status-page link.

### SMTP outage and retry

1. Prepare and verify a third fresh applicant.
2. Temporarily stop Mailpit: `docker compose --env-file .env.local -f compose.dev.yml stop mailpit`.
3. Admin decides. Expect the decision to succeed even though delivery is deferred. The API may respond with `"notification":"pending"`.
4. Restart Mailpit: `docker compose --env-file .env.local -f compose.dev.yml up -d mailpit`.
5. Wait at least **30 seconds** (first retry backoff), then POST `/api/admin/access-notifications/dispatch` in Postman from the same admin cookie jar, with `Origin: http://localhost:3000`.
6. Expect `sent >= 1`; confirm the new email in Mailpit and no additional decision audit entry.

### Negative/security testing

- Unauthenticated POST to retry route -> 401 or 403.
- Logged-in user lacking `manage_access` or session MFA -> 403.
- Cross-origin request -> 403.
- Duplicate admin decision -> 409, no new outbox row.
- Attempt to approve `submitted` (unverified) application -> 409.
- Request when feature is disabled or not local development -> 404.

## Delivery guarantees and limitations

The decision update, audit record, and notification outbox entry are written **atomically**. The HTTP request attempts to send email after commit, so SMTP failure cannot reverse approval/rejection. Dispatch uses a row lock with `SKIP LOCKED`, a five-minute processing lease, and exponential backoff capped at one hour. The local admin dispatch route can retry eligible pending messages.

**At-least-once semantics:** There is a narrow crash window between SMTP accepting an email and marking the row sent; on recovery, a duplicate email can occur. This is normal for an outbox without SMTP-provider idempotency support. Production would require an always-on background dispatcher; here retries are **manual/admin-triggered**, not automatically scheduled during idle periods.

A notification email is intentionally **not an activation email**. Account provisioning, role grants, activation, MFA, and production hardening are separate AB-WC-003 work.
