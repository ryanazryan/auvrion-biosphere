# AB-WC-003 — Gated Onboarding: Local Reviewer Handoff

**Project:** Auvrion Biosphere | **Branch:** `feat/ab-wc-003-gated-onboarding` | **Target:** Draft PR into `develop`  
**Status:** WIP / development review — **not approved for production or merge yet**.

This document lets a teammate or their AI reproduce and review AB-WC-003 after pulling the branch. It is a **development handoff**, not a guarantee of completed security acceptance criteria. Do not assume existing users or database records follow from a Git pull.

## 1. Included / not yet included

| Area | Status in author's local development | Reviewer action |
|---|---|---|
| Request Access form and API (`POST /api/access-applications`) | Implemented and manually exercised | Validate request contract locally |
| Email verification via Mailpit | Implemented and manually exercised | Verify token single-use, expiry and replays |
| Better Auth password login and TOTP | Implemented, admin tested | Validate login and TOTP challenge |
| Session-bound MFA assurance | Implemented, unit tests | Independently run integration cases |
| Admin applications list, detail and decision | Implemented, local approval exercised | Verify with separate applicants |
| `access_decision_audit` migration | Added in `0006_watery_gressill.sql`, migrated on author's DB | Run migrations on **your own** dev DB |
| Applicant status page and cross-browser resumption | **Not implemented** | Future PR |
| Approval/rejection email notification | **Not implemented** | Future PR |
| Provisioning and secure account activation | **Not implemented** | Future PR |
| Role assignment, grant/revoke/disable user lifecycle | **Incomplete** | Future PR |
| Full authz E2E/security tests and human security review | **Not complete** | Required before merge |

**Key invariant:** `approved` in `access_applications` does **not** equal an active login. Never auto-activate simply because an admin approves an application. Applicants cannot self-assign roles.

## 2. Requirements and local setup

- Windows + Git Bash (or equivalent shell), Git, compatible Node.js/npm, Docker Desktop with Docker Compose, and optionally Postman.
- Mailpit for development email capture; verify SMTP service definition in the checked-out `compose.dev.yml` (local compose changed during development).
- **Do not commit or share `.env.local`, passwords, TOTP secrets, live verification tokens, database dumps or exported authenticated cookie jars.**
- The project's `drizzle.config.ts` explicitly restricts migrations to the author-approved local target: PostgreSQL `127.0.0.1:5433`, database `auvrion_dev`, role `auvrion_dev`. Follow that guard; do not bypass it.

```bash
# After cloning/pulling the target branch:
git status -sb
node --version
npm --version
npm ci

# Environment: use checked-out .env.example as the source of required NAMES.
cp .env.example .env.local
# Replace placeholder values LOCALLY; secure secrets and URL-encode password in DATABASE_URL if needed.

# Start services specified in actual local compose file.
docker compose --env-file .env.local -f compose.dev.yml up -d
docker compose --env-file .env.local -f compose.dev.yml ps

# Check generated SQL and journal/snapshots, then migrate only your local DB.
ls drizzle/*.sql
npx drizzle-kit migrate

npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```

Open `http://localhost:3000/request-access`, Mailpit at `http://localhost:8025` **if the compose file maps this port**, and `http://localhost:3000/admin/access-applications`. Other protected routes may need a bootstrapped admin.

### Drizzle migrations and persistent data

- Migration files expected in this branch include `0004_sturdy_boom_boom.sql`, `0005_green_manta.sql`, `0006_watery_gressill.sql` plus snapshots/journal. Earlier migrations must already exist in the checkout.
- Migration **files must be committed** and applied in order by `npx drizzle-kit migrate` on a fresh local DB. Do not run `drizzle-kit generate` just to onboard a teammate or create a new applicant.
- `0006` creates the decision audit table. A missing `access_decision_audit` table causes admin decision transactions to fail with 500 and roll back.
- Never copy the author's database data by default. Each teammate's local database starts without applicants, admin account, grants or MFA enrollment.
- **Never** use `drizzle-kit push` or edit DB tables manually to bypass security decisions.

**Read-only schema check:**

```bash
docker compose --env-file .env.local -f compose.dev.yml exec -T db \
  sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -P pager=off -c "SELECT to_regclass('\''public.access_decision_audit'\'') AS audit_table;"'
```

## 3. Admin bootstrap — deliberate manual step

The author's local `dev-admin@example.test` **is NOT created by cloning or migrating the repository**. The application is designed around explicit approval, verified email, active `user_access`, scoped admin capability grants and TOTP. The branch contains `scripts/dev/activate-admin.mjs` (development-only bootstrap). **Review its current code and prerequisites before running it.**

Do not invent a password or manually set `email_verified`, `approved`, `active`, or `review_applications` in the database. Follow the reviewed local bootstrap procedure only, establish Better Auth user credentials, enroll and verify TOTP using the intended UI, and confirm session-bound MFA assurance. If this procedure is missing/unclear on a new machine, request the engineering owner to supply a reproducible *development-only* setup before attempting admin testing.

Expected local admin (once explicitly provisioned):

- Email: `dev-admin@example.test` (not a shared password)
- Organization code: `AUVRION-LOCAL`
- Capability grants: `review_applications`, `manage_access`
- Conditions: approved request, verified email, active access, MFA assurance in current session.

## 4. Manual demonstration sequence

1. Start PostgreSQL + Mailpit + Next.js. Confirm server health and migrations.
2. Use a **new unique** test email to submit `POST /api/access-applications` or visit `/request-access`.
3. Check Mailpit and verify using the app-generated **single-use** link; expect `email_verified`.
4. Admin signs in with password + TOTP. Open `/admin/access-applications`.
5. Review the application, choose **Approve** with optional note. Verify `status=approved`, `reviewed_at`, reviewer identity, and exactly one `access_decision_audit` row.
6. Submit a *second* verified application and **Reject** with required reason. Verify `rejected` and corresponding audit entry.
7. Repeat decision for the same application (expect HTTP 409); try `submitted` status, no session, wrong origin, missing reason, no appropriate capability/MFA. Do not mutate a privileged admin's grant solely to simulate unauthorized access.
8. **Stop there:** applicant activation, status recovery and notification are follow-on work; approval is not a login account.

Read-only verification (replace dummy address):

```sql
SELECT a.email, a.status, a.reviewed_at,
       u.email AS reviewer, d.previous_status, d.new_status
FROM access_applications a
LEFT JOIN "user" u ON u.id = a.reviewed_by_id
LEFT JOIN access_decision_audit d ON d.application_id = a.id
WHERE a.email = 'reviewer-wc003@auvriondev.test';
```

## 5. Postman: review pack

Import:

- `postman/Auvrion-Biosphere-AB-WC-003.postman_collection.json`
- `postman/Auvrion-Biosphere-local.postman_environment.json`

Select the `Auvrion Biosphere — LOCAL TEMPLATE` environment. Fill **current/local only** values such as `adminPassword`, `totpCode`, `applicationId`. **Never save/re-export actual secret variable values**. Better Auth uses session cookies; sign-in and TOTP must use the same Postman cookie jar, and an incomplete MFA login is not a privileged admin session. `Origin` must match `{{baseUrl}}`.

Existing 13 authentication requests are preserved. The old Request Access route has been corrected from **nonexistent** `/api/access-requests` to `/api/access-applications`. Added admin Approve/Reject, negative tests, identity, health. The two email verification requests are marked **DRAFT**, because their handler input format/method is not available from the unpushed branch here. **Do not call them an accurate runnable contract until reading the matching local route handlers.** Prefer email verification through the functioning browser + Mailpit flow for now.

**Request quick reference** (some body schemas require local confirmation):

| Action | Method | Path | Auth |
|---|---|---|---|
| Applicant submit | POST | `/api/access-applications` | Public |
| Email verification request | route exists | `/api/access-applications/email-verification/request` | Confirm handler |
| Email verification confirm | route exists | `/api/access-applications/email-verification/confirm` | Confirm handler |
| Admin approve/reject | POST | `/api/admin/access-applications/:id/decision` | Admin session + MFA + manage_access |
| Session (Better Auth) | GET | `/api/auth/get-session` | Session cookie |
| Current user | GET | `/api/me` | Session cookie |

Do not hardcode passwords in Postman, source, Markdown docs or issue descriptions. Avoid collection-level authorization that would leak admin credentials to public requests.

## 6. Review gates / remaining work

- Before opening Draft PR: `npm run lint && npm run typecheck && npm test && npm run build` all must pass at current HEAD; review staged files for accidental secrets and untracked archives/patches.
- Before marking PR Ready/Merging: replay-denial and revoked-session checks; cross-organization isolation design; concurrency/duplicate decision tests; real transaction rollback/audit tests; manual admin decision and email verification tests; human security review.
- Scope explicitly **WIP**: status continuity, decision notifications, provisioning, activation, role grants and revocation are not finished.
- Notion Work Control: `AB-WC-003` — https://app.notion.com/p/3fa73f8cd499817a843bcb1cd8998f10

## 7. Teammate AI starting instruction

> Review `docs/work-control/AB-WC-003-PR-HANDOFF.md` and the actual source in this branch. Treat `feat/ab-wc-003-gated-onboarding` as WIP, `develop` as the PR base. Do not infer runtime setup from the author's local database. Read `.env.example`, `compose.dev.yml`, `drizzle.config.ts`, `scripts/dev/activate-admin.mjs`, `src/app/api/access-applications`, admin decision route, auth/MFA authorization and Drizzle schema. Identify discrepancies and missing prerequisites before suggesting mutating steps. Never bypass email verification, current-session MFA assurance, approval, activation, org-scoped capability grants or database audit. Preserve user data. Verify behavior with reproducible checks and report PASS/FAIL/NOT TESTED. Do not claim AB-WC-003 Done yet.
