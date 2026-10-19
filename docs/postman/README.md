# Auvrion Biosphere — Postman Authentication Tests

## Import

1. Start local database and Next.js app (`http://localhost:3000`).
2. Import the exported `Auvrion Biosphere.postman_collection.json` into Postman.
3. Import `Auvrion-Local.example.postman_environment.json` and select it as the **active** environment (dropdown top-right).
4. Fill `adminPassword` and `operatorPassword` in **your own** local Postman environment. Do not export these filled values or publish a workspace containing them.
5. Fill `totpCode` only with a fresh **six-digit code** from your local authenticator. Do not put the TOTP secret or `totpURI` here.
6. Confirm `baseUrl` = `http://localhost:3000` and both `Origin` and URL use the same local host.

## Variables

| Variable | Example / purpose |
| --- | --- |
| `baseUrl` | `http://localhost:3000` |
| `adminEmail` | `dev-admin@example.test` (local fixture only) |
| `adminPassword` | your own local fixture password, not shared |
| `operatorEmail` | `dev-operator@example.test` (local fixture only) |
| `operatorPassword` | your own local fixture password, not shared |
| `totpCode` | the authenticator's current 6-digit code; do not commit |

## Cookies and Postman request order

Better Auth uses cookies, **not** the presence of a `token` property in the JSON response to identify subsequent requests.

- Sign-in, `get-session`, enrollment, verify TOTP and sign-out: **Disable cookie jar = OFF**.
- Unauthenticated negative test: **Disable cookie jar = ON**, with **no** manually added `Cookie` header.
- When switching between operator and admin, first clear the old Better Auth cookie via **Cookies → localhost**, then sign in as the other user.
- Run `GET /api/auth/get-session` **immediately after each sign-in**. Verify `user.email` is the intended user. A successful admin sign-in response can coexist with a stale operator cookie in Postman.
- `GET /api/auth/get-session` returning `200` + `null` is expected when no authenticated session cookie was sent.

## Expected test outcomes (locally observed)

| Scenario | Expected outcome |
| --- | --- |
| Admin sign-in before enrollment | Successful initial login (eligible bootstrap fixture) |
| Unauthenticated enable TOTP | `MFA_ENROLLMENT_NOT_ALLOWED`; verify HTTP status |
| Unapproved operator enable TOTP with valid operator cookie | `403` + `MFA_ENROLLMENT_NOT_ALLOWED` |
| Eligible admin enable TOTP | Response fields `method`, `totpURI`, `backupCodes` — NEVER save real values |
| Enroll: verify first TOTP | Success; re-fetch admin session and assert `twoFactorEnabled === true` |
| New admin sign-in after enrollment | `twoFactorRedirect: true`, `twoFactorMethods` includes `totp` |
| Before verifying login TOTP | `GET /api/auth/get-session` has no authenticated admin session (`null` observed) |
| After verifying login TOTP | `GET /api/auth/get-session` returns admin session and `twoFactorEnabled: true` |
| Normal sign-out | `{ "success": true }`, then get-session returns `null` |

**Not yet verified:** Replay of a revoked old session cookie, session-level MFA proof enforcement in authorization, and multi-session revocation. They should not be marked PASS based solely on normal logout.

## Postman Collection hygiene

The currently exported collection contains 13 requests. It uses `{{baseUrl}}` and account/password variables; several request `Origin` headers are pinned to `http://localhost:3000`. Change these for other approved local environments, without sharing credentials.

Before committing a new export, inspect every `request.header`, `request.body.raw`, `event` script, variable and saved `response` for leaked `Cookie`, `Authorization`, `better-auth.session_token`, actual passwords, generated `otpauth://` URIs, `backupCodes` and authenticator codes. Never commit a filled environment export.

See [`../engineering/AB-WC-002-LOCAL-SETUP.md`](../engineering/AB-WC-002-LOCAL-SETUP.md) for generating secrets and local fixtures.
