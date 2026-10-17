# AB-WC-002 — Local Development & MFA Setup

**Project:** Auvrion Biosphere
**Audience:** Engineering contributors
**Scope:** Local-only onboarding and reproducible Better Auth / TOTP testing
**Status:** Working implementation; session-level MFA assurance and full revocation verification remain incomplete.

> This guide contains **no usable credentials**. Each contributor creates their own local secrets. Never publish `.env.local`, database passwords, `better-auth.session_token`, TOTP `secret`, `totpURI`, backup codes, or authenticator codes.

## 1. Prerequisites

- Node.js 24.x and npm (use the versions approved in the repository).
- Docker Desktop with Docker Compose, PostgreSQL/PostGIS local database.
- VS Code, Git, Postman (Desktop or Desktop Agent), and a TOTP app (Google Authenticator or equivalent).
- Clone the repository, check out the agreed working branch, and verify the relevant `compose.dev.yml`, Drizzle configuration, and seed scripts exist.

```bash
npm ci
npm run dev
```

The local application runs at `http://localhost:3000` unless the project configuration sets another port.

## 2. Environment secrets — local only

Use the **existing** project's `.env.local` structure, not a copied teammate's credentials. Known configuration keys used by this workstream are:

| Key | Purpose | Where to keep it |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string consumed by application and development scripts | `.env.local` only |
| `BETTER_AUTH_SECRET` | Random signing/encryption secret for Better Auth | `.env.local` only |
| `BETTER_AUTH_URL` | Better Auth application base URL, if used in the repository configuration | `.env.local` only |
| `LOCAL_TEST_PASSWORD` | Password for the local operator fixture; used by its seed script | Temporary shell environment variable |
| `LOCAL_ADMIN_PASSWORD` | Password for the local bootstrap administrator; used by its script | Temporary shell environment variable |

**Example values (placeholders only):**

```dotenv
# .env.local EXAMPLE ONLY — do not commit this file
DATABASE_URL=postgresql://auvrion_dev:REPLACE_WITH_LOCAL_DB_PASSWORD@127.0.0.1:5433/auvrion_dev
BETTER_AUTH_SECRET=REPLACE_WITH_RANDOM_SECRET
BETTER_AUTH_URL=http://localhost:3000
```

> Verify `BETTER_AUTH_URL` is actually required by `src/server/auth/index.ts` and the existing repo environment configuration. The example does not enumerate every Compose-specific variable. Consult `compose.dev.yml` before starting Docker.

### Generate `BETTER_AUTH_SECRET`

In Git Bash / the project terminal:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Copy the randomly generated output **only to your own `.env.local`** as `BETTER_AUTH_SECRET`. Generate your own value; never reuse another contributor's production secret. Since the command prints a secret, avoid screen-sharing or sharing terminal logs while doing so.

**Database password:** `auvrion_dev` is the local PostgreSQL username in this setup, **not** a password. Retrieve the password from your own initialized local Docker/PostgreSQL configuration; do not assume `auvrion_dev` is the password. If a persistent PostgreSQL volume already exists, changing `POSTGRES_PASSWORD` later does not automatically change the database user's actual password.

### Start the development database

When the required Compose variables are configured:

```bash
docker compose --env-file .env.local -f compose.dev.yml up -d db
docker compose --env-file .env.local -f compose.dev.yml ps
```

Confirm the actual DB name, credentials, and mapped port from Compose and `.env.local`. A migration file named `drizzle/0003_auth_two_factor.sql` is tracked with AB-WC-002; apply migrations using the repository's Drizzle procedure **once per database**. Do not blindly re-run SQL statements or regenerate migrations. Check `package.json` / `drizzle.config.ts` for the authoritative migration command.

### Inspect MFA state (read-only)

After migrations and local fixtures, this query checks only whether MFA is enabled and avoids exposing TOTP secrets:

```bash
docker compose --env-file .env.local -f compose.dev.yml exec -T db \
  psql -U auvrion_dev -d auvrion_dev -P pager=off \
  -c 'SELECT email, two_factor_enabled FROM public."user" WHERE email IN ('\''dev-admin@example.test'\'', '\''dev-operator@example.test'\'') ORDER BY email;'
```

The query is optional; it depends on the local Compose service name `db` and matching database initialization.

## 3. Create local-only fixture accounts

The following scripts are **not yet confirmed as tracked in this branch**. Before a teammate runs them, review their source and decide whether they should be committed in a separate safe development-only change:

- `scripts/dev/seed-test-user.mjs` — intended operator fixture, `dev-operator@example.test`.
- `scripts/dev/bootstrap-admin.mjs` — intended first local administrator, `dev-admin@example.test`.

The scripts read `DATABASE_URL` from `.env.local`, and passwords from environment variables `LOCAL_TEST_PASSWORD` and `LOCAL_ADMIN_PASSWORD`. Choose **different, strong passwords (at least 16 characters)**. For Git Bash, provide the password interactively so it is not written directly into shell history:

```bash
# Operator fixture (local development only)
read -r -s -p "Operator password (16+ chars): " LOCAL_TEST_PASSWORD
echo
export LOCAL_TEST_PASSWORD
node scripts/dev/seed-test-user.mjs
unset LOCAL_TEST_PASSWORD
```

```bash
# Bootstrap administrator (local development only)
read -r -s -p "Admin password (16+ chars): " LOCAL_ADMIN_PASSWORD
echo
export LOCAL_ADMIN_PASSWORD
node scripts/dev/bootstrap-admin.mjs
unset LOCAL_ADMIN_PASSWORD
```

Run only against your **own local development database**, never against production. These scripts may create synthetic verified-email and approval fixtures; those are not evidence of real-world email verification or review. Avoid seeding duplicate accounts without checking the script's idempotency.

If the scripts remain untracked, a new contributor cannot use these commands until they are shared/reviewed through an approved channel. Do not weaken authentication guards to compensate.

## 4. TOTP enrollment — Google Authenticator

1. Start the application and sign in as a **locally eligible bootstrap admin**, using the credentials you created. The currently unapproved operator is intentionally ineligible to enroll.
2. Open `/account/security/enroll`, or call `POST /api/auth/two-factor/enable` in Postman with the admin's authenticated cookie, password, and `method: "totp"`.
3. Better Auth returns `method`, `totpURI`, and `backupCodes`. **These are generated by the server**, not by manually inventing a `secret=...` string. The example URI below is **illustrative and cannot be used**:

   ```text
   otpauth://totp/Auvrion%20Biosphere:example?secret=EXAMPLE_ONLY&issuer=Auvrion%20Biosphere&digits=6&period=30
   ```

4. Open Google Authenticator and choose *Add account*. Prefer scanning the QR rendered **locally** in the enrollment UI. If entering manually, extract **only the `secret` query-parameter value** from your own generated `totpURI` (not the whole `otpauth://` URI). Choose a **time-based** account.
5. The authenticator produces a **six-digit temporary code** (usually changes every 30 seconds). This code — **not the secret** — is the Postman variable `totpCode`.
6. Verify with `POST /api/auth/two-factor/verify-totp` using `{ "code": "{{totpCode}}", "trustDevice": false }` and the correct session cookies. After successful verification, confirm `GET /api/auth/get-session` returns `user.twoFactorEnabled: true` for admin.
7. Securely store backup codes in a private password manager or other approved safe place. Do not regenerate, display, upload, commit, or send them to teammates. Never save your true `totpURI` in a code example or screenshot.

**Future sign-ins:** After submitting correct email/password, the response should require MFA (`twoFactorRedirect: true`, methods including `totp`). Before OTP verification, `GET /api/auth/get-session` must **not** expose an authenticated full session. Complete the OTP challenge, then re-check the session.

**Important:** `twoFactorEnabled: true` reflects **account-level MFA enrollment** and does not on its own prove **session-level verified MFA assurance** or authorization access. These are distinct work items.

## 5. Security rules and remaining work

- Operator fixture remains unapproved. Direct `POST /api/auth/two-factor/enable` with its valid session must be rejected (`403`, `MFA_ENROLLMENT_NOT_ALLOWED`).
- No authenticated cookie: enrollment must also be rejected; Postman's *Disable cookie jar* setting prevents automatic cookie transmission.
- Do **not** use `trustDevice: true`, disable approval gates, set accounts to `active` just for tests, or remove MFA guard checks.
- Normal sign-out returning `{ "success": true }` followed by a `null` session has been observed; **replaying a previously valid cookie after logout remains to be tested**.
- Server-side verified MFA assurance enforcement, revocation across sessions, operational role/organization authorization, recovery handling, and relevant integration tests remain open. Do not claim the whole AB-WC-002 security scope is production-ready.
- Do not commit temporary files, local passwords, secrets, cookies, generated OTP URIs, or backup codes.

## 6. Run quality gates

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Fix Biome formatting on **specific files**, not by broadly changing the repository:

```bash
npx biome check --write src/components/auth/auth-layout.tsx
```

Finally, confirm staged files with `git diff --cached --stat` and `git diff --cached --check`. The latter finds whitespace problems, **not** leaked secrets.

## 7. References

- `docs/engineering/AB-WC-002-HANDOFF.md` — implementation summary and review status.
- `docs/postman/README.md` — API testing and cookie guidance.
- `docs/postman/Auvrion-Local.example.postman_environment.json` — secret-free Postman environment.
- Notion work item AB-WC-002 — canonical scope / decisions.
