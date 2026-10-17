# AB-WC-002 — Engineering Handoff

**Project:** Auvrion Biosphere
**Repository:** `ryanazryan/auvrion-biosphere`
**Working branch:** `feat/ab-wc-002-verified-mfa-assurance`
**Base branch:** `develop`
**Status:** In Progress — Security Validation

## 1. Purpose

Implement authentication with mandatory TOTP-based MFA for authorized users, together with fail-closed access rules and session security.

## 2. Technology Stack

- Next.js 16 App Router
- TypeScript
- Better Auth
- PostgreSQL + PostGIS
- Drizzle ORM
- Tailwind CSS
- Biome
- Vitest

## 3. Local Development

```bash
npm ci
npm run dev
```

Database connectivity and required environment variables must be configured before authentication testing.

Use the project's approved local environment configuration. Never commit `.env.local`, credentials, session tokens, MFA secrets, or recovery codes.

Apply database migrations using the configured Drizzle workflow before testing MFA.

## 4. Authentication Flow

1. User signs in using email and password.
2. Better Auth validates credentials.
3. Eligible users without MFA complete TOTP enrollment.
4. Accounts with MFA enabled must complete the TOTP challenge on subsequent sign-ins.
5. Only a successfully authenticated session proceeds to application authorization checks.
6. Logging out must invalidate the session.

## 5. Security Requirements

- MFA enrollment requires server-side eligibility checks.
- Pending or unapproved operational accounts must not bypass enrollment restrictions.
- Trusted-device MFA bypass is prohibited.
- MFA enforcement must not rely only on the user's `twoFactorEnabled` flag.
- Access requires appropriate account approval, organization scope, role/capability, and session assurance.
- Do not activate accounts or weaken guards simply to make development tests pass.
- Backup codes and TOTP secrets must never be logged or committed.

## 6. Relevant Routes

| Route | Purpose |
|---|---|
| `/login` | Authentication |
| `/two-factor` | TOTP challenge |
| `/account/security/enroll` | MFA enrollment |
| `/api/auth/[...all]` | Better Auth API |
| `/api/me` | User context and application access |

## 7. Validation

Run before requesting review:

```bash
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Manual Postman tests cover sign-in, session retrieval, MFA enrollment restrictions, TOTP verification, login challenge, and logout.

## 8. Outstanding Security Work

Confirm and document:

- Replay rejection for revoked session cookies.
- Server-authoritative proof that a session completed MFA.
- Authorization guard enforcement for protected routes.
- Session revocation behavior across active sessions.

Successful Better Auth login does not automatically establish completion of every application-level security requirement.

## 9. Collaboration Rules

- Use feature branches based on the appropriate integration branch.
- Open Pull Requests targeting `develop`.
- Request review before merging security-sensitive changes.
- Do not merge unfinished security guarantees into the production branch.
- Do not commit development passwords or real authentication secrets.

**Canonical work item:** AB-WC-002 in Auvrion Biosphere Notion.