# AB-WC-017 — Slice 03A Admin HTTP device management

Adds POST /api/admin/devices (body `organizationId`, `sourceId`) and POST /api/admin/devices/{id} (body `organizationId`, `action`: `rotate` or `revoke`). Both are **human/browser management** routes, not device ingestion routes.

Security: same-origin browser POST check, bounded JSON, server-side `checkAdminAccess(org, "manage_devices")` incl. MFA, scoped actor from validated server session, transactional credential/audit persistence. Credential shown once only after successful commit; never log tokens. No-store on every response.

**Not yet delivered:** route-level mocks/security regression tests; dedicated authenticated HTTP acceptance; rate limiting at ingress/proxy; 03B device HTTP ingestion, durable media ACK; firmware. Follow-up security review mandatory.

Note: `device-admin-http.ts` provisions a small separate pg pool because `getDb()` does not export a pg client. Consider consolidating pools in a reviewed follow-up. Do not expose endpoints publicly without deployment rate limits and security review.
