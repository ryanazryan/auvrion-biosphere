# AB-WC-001 — Authentication Assurance, Bootstrap, Recovery & Reviewer Access Policy

**Project:** Auvrion Biosphere — UINIC 8.0 Web Development Competition 2026  
**Work Control:** AB-WC-001  
**Working branch:** `chore/ab-wc-001-access-policy` (local branch not verified)  
**Document version:** v0.1 — 17 October 2026  
**Document status:** **Proposed / Draft for Owner Review**  
**Implementation status:** **Not Implemented / Not Verified**  
**Decision authority:** Tech Lead / Project Owner; qualified security review for release remains open.  
**Scope:** Policy selection only. Does not implement authentication, enable access or modify ADR status.

> IMPORTANT: The choices below are **recommendations for explicit owner approval**, not accepted ADRs, test results, or authorization to relax existing fail-closed guards. No production assurance is claimed.

## 1. Purpose and authoritative references

Select a minimum, implementable policy for proving MFA/passkey assurance; activating the first administrator without a public bootstrap endpoint; factor recovery and last-factor removal; revocation; and secure access for competition judges/reviewers. This fulfills the **policy decision** work of AB-WC-001; implementing and testing the flows is separate work.

**Canonical references:**
- [AB-WC-001 Work Control](https://app.notion.com/p/3fa73f8cd49981baad72e8cdbae4fbea)
- [Security Architecture & Threat Model](https://app.notion.com/p/3f873f8cd49981d485a0cbc97a37e673) — §4–7 and SH-03.1–03.4
- [Decision Log](https://app.notion.com/p/3f873f8cd49981dfa2b6de36901dfe7c) — AB-DEC-002/003/004/014: still OPEN/Proposed
- Requirements: AB-FR-AUTH-006..013; AB-NFR-AUTH-001/004/005
- Candidate tests: TC-01..09 and TC-38; abuse paths TC-35
- [Better Auth 2FA documentation](https://better-auth.com/docs/plugins/2fa) — current documentation must be checked against installed `better-auth@1.7.9` before implementation.

## 2. Repository evidence — inspected on `develop`

| Area | Verified source-level baseline | Remaining gap / restriction |
|---|---|---|
| Identity | `src/server/auth/index.ts` uses Better Auth 1.7.9; email/password enabled; signup disabled; `autoSignIn: false`; email verification required | No MFA/passkey plugin; no complete invite/public application endpoint verified |
| Account lifecycle | `access_applications`, `user_access` schema with application status (`submitted`, `email_verified`, `approved`, `rejected`) and access status (`pending_activation`, `active`, `disabled`) | Enrollment assurance, approval transaction and activation orchestration not verified |
| Access gate | `checkAccountAccess` requires authenticated session, verified email, approved application, reviewed record, active user access, matching applicant email | Does not prove MFA |
| Operational roles | `role_grants`: operator, supervisor, ranger, organization-scoped, revocable | Guard intentionally returns `MFA_ASSURANCE_REQUIRED` even with valid grant |
| Administrative capabilities | `admin_capability_grants`: `review_applications`, `manage_access`, `manage_devices`, `manage_config`, organization-scoped | Guard intentionally returns `MFA_ASSURANCE_REQUIRED` even with valid grant; admin does not imply operational role |
| Session | Better Auth database-backed session schema | Session timeout, step-up, revocation and factor assurance integration not yet verified |
| Tests | Unit tests for operational/admin guard denial and role/capability scoping exist | No evidence of E2E MFA, recovery, bootstrap or reviewer-path tests |

**Source inspection is not an integration test.** Local branch status, test execution and deployment configuration were not inspected as part of this document.

## 3. Proposed owner decisions — candidate minimum V1

| ID | Question | Recommended decision | Status |
|---|---|---|---|
| AP-01 | Authentication foundation | Keep Better Auth, email/password and local access model for V1; provider feasibility and exact version compatibility checked before implementation. | **PROPOSED** |
| AP-02 | Mandatory assurance | All operational and admin access requires proven password **and TOTP** in V1. Neither password alone nor email verification is a second factor. | **PROPOSED** |
| AP-03 | Passkey | Candidate alternative only if verified WebAuthn user verification (`UV=required`) and server-verified assurance; no implicit equivalence from a passkey flag. If not feasible before deadline, defer passkey feature without weakening TOTP requirement. | **PROPOSED** |
| AP-04 | Activation | `approved` application + matching verified identity/email + scoped role/capability grant + proven factor + explicit activation audit required before `user_access.status=active`. Setup session has setup-only access. | **PROPOSED** |
| AP-05 | Initial administrator | Owner-approved, one-time, non-public controlled bootstrap in a private operational procedure; no public endpoint, seed password or generic superadmin. | **PROPOSED** |
| AP-06 | Recovery | Prefer generated backup codes (single-use) and/or pre-enrolled backup factor; assisted last-factor-loss recovery remains blocked until the separate proof and approval procedure is approved. | **PROPOSED / OPEN procedure** |
| AP-07 | Last factor | Do not remove the last valid mandatory factor unless a verified replacement has been enrolled or a separately approved assisted recovery is complete. | **PROPOSED** |
| AP-08 | Sessions | Server-side session validation on protected requests; propose 15-minute inactivity, 8-hour absolute duration, and proof not older than 5 minutes for sensitive changes. Values are application targets, not guaranteed library defaults. | **PROPOSED** |
| AP-09 | Judge access | Prefer individual, time-limited, least-privilege demo identities with their own MFA enrollment. If judge-specific MFA is operationally infeasible, offer a separate read-only synthetic-data showcase or guided demo rather than bypassing protected routes. | **PROPOSED** |
| AP-10 | Alternate login methods | V1 allows only reviewed, approved flows; do not enable OAuth, magic link, passkey sign-in or email OTP in a way that skips the same server-side activation/assurance gate. | **PROPOSED** |

**Required human decision:** Tech Lead must explicitly accept, amend, or reject each proposal; otherwise it stays Proposed and AB-DEC-004/014 remain OPEN. Security reviewer/approval requirements must be resolved before production release.

## 4. Assurance model and authorization invariants

A protected request is authorized only when **all** of the following apply:

1. A valid, unrevoked authenticated session identifies a unique user.
2. Email verification and application identity binding are valid.
3. Application was approved with recorded reviewer, time and decision.
4. Local user account is `active` (not `pending_activation` / `disabled`).
5. Server-side evidence proves current-session mandatory factor assurance, not merely `twoFactorEnabled` or presence of a cookie.
6. Required organization-scoped operational role or explicit admin capability is valid and not revoked.
7. Relevant object/zone/task assignment and action/state restrictions hold.

**Fail closed:** Missing MFA proof yields `403 MFA_ASSURANCE_REQUIRED`; absent/invalid application yields account denial; role/capability absence yields scope denial. Retain current guard behavior until an audited verifier satisfies point 5. Never replace the guard with an unconditional `allowed: true`.

**Enrollment must be proven.** Enabling a factor or generating its QR does not prove possession; TOTP becomes active only after a valid challenge. Enrollment secrets and backup codes must never be logged, committed or shared with QR generation services. Disable trusted-device bypass for the initial demo.

**Passkey interpretation:** A passkey/WebAuthn login counts as satisfying the proposed assurance only after the maintained provider validates origin, RP ID, one-time challenge, signature, credential binding and user verification. This alternative is not automatically enabled by installing a passkey plugin.

**Step-up:** Factor enrollment/removal, role/admin grants, recovery, secret/device rotation and sensitive exports require fresh reauthentication/factor proof and audit. Normal UI presence must not substitute for server-side checks.

## 5. First-admin bootstrap — controlled runbook proposal

The current DB schema records grant-giver and application-reviewer IDs with foreign keys. Bootstrap must account for that sequence and the fact that the first administrator does not yet have an existing administrator to approve them.

**Preconditions:** private development/authorized staging only; named project owner; identity verified out of band; local protected DB access; one designated organization; maintainer-reviewed, idempotent one-time script/migration approach, not a browser-facing public route.

**Proposed procedure:**
1. Owner confirms which real identity is allowed to receive initial `review_applications` and `manage_access` capabilities; use minimal privileges rather than `manage_devices`/`manage_config` by default.
2. Provision the identity through an approved private onboarding mechanism. Do not enable public signup or ship a static password.
3. Verify email proof, create/associate the application record and organization, and document a **one-time owner bootstrap exception** for the otherwise absent independent reviewer. Record actor, reason, time and reference to the owner decision. This is not a reusable self-approval rule.
4. Grant the minimum explicit admin capabilities using auditable DB changes. All foreign keys must reference real user records; never fabricate or suppress the review records.
5. Require successful MFA enrollment/proof before activating effective domain access. A pending user may access only setup endpoints; credentials and capability rows alone must not authorize administration.
6. Confirm there is no public bootstrap endpoint, disable/remove one-time write capability, verify the procedure cannot silently run a second time, and review audit results. Protect any operational script and runtime secrets separately.

**Blockers before execution:** no reviewed bootstrap implementation; no production MFA proof integration; no approved recovery exception procedure. **No bootstrap has been run or authorized by this document.**

## 6. Factor recovery and last-factor-loss policy

### User has an available factor

- Reauthenticate and prove a currently registered factor before changing TOTP/passkey inventory.
- Replacement: enroll the new factor **and verify it** before revoking the old/last factor.
- Backup codes: generated through maintained library; shown once via safe UX, stored protected, never logged; each code used once. Code regeneration invalidates prior codes.
- Following factor change, revoke or re-evaluate other sessions, notify the previously verified channel, and audit redacted metadata (actor, timestamp, event, status; not secrets).

### User has lost every factor

- **Do not implement email-only bypass or auto-unlock.** For V1, default to temporary denial of protected access until assisted recovery is approved and implemented.
- Proposed assisted recovery requires independent identity evidence, authorized human reviewer other than requester when possible, documented case/reason, confirmation on verified channel, fresh factor enrollment, revocation of old sessions/factors, and auditable outcome. Cooldown duration, reviewer authority and identity proof standard remain **OPEN** for owner review.
- The procedure must never approve an application, assign roles, reactivate a disabled account, or change admin privileges as a side effect of recovery.
- If the team cannot staff secure assisted recovery for the competition, document **manual support unavailable / access remains blocked** as the interim behavior, rather than adding a bypass.

### State and revocation

- `disabled` user: denied even with a valid sign-in session/recovery proof; reactivation rechecks approval, email, grants, factor and owner authorization.
- Grant revoke/role change/disable/credential compromise: authoritative per-request server checks; invalidate applicable sessions and factor proof; protected requests after revocation must fail.
- Never display session tokens in session-management UI/logs.

## 7. Reviewer and competition judge access — without shortcuts

Distinguish **GitHub code reviewer** (reviews pull requests) from **competition evaluator** (uses app demo). These are different authority domains.

**Preferred protected demo:** separate judge account per evaluator, authorized through controlled application/role grant, password + own TOTP enrollment, limited organization/fixture scope, no admin capabilities. Provide credentials and MFA enrollment only through an approved private handover. Time-limit and revoke after judging. Avoid shared permanent passwords/TOTP seeds or common team admin accounts.

**Fallback if judge cannot enroll MFA:** provide a publicly accessible, separately isolated read-only synthetic-data showcase or guided screen-sharing/live demonstration. Data must be synthetic or cleared for public use; this fallback must not call sensitive authenticated routes and must not set `user_access.active`/role grants automatically. If a safe isolated showcase has not been implemented, guided demonstration is the only interim fallback.

**Verification:** use a clean browser with no owner session, test least-privilege boundaries for judge, invalid and expired proof, and session revocation after evaluation. Actual judge URL/access, setup reliability and success remain **NOT VERIFIED** (TC-38).

## 8. Proposed acceptance checks and evidence matrix

| ID | Check | Pass condition | Result |
|---|---|---|---|
| AP-T01 / TC-01 | Pending/denied/unverified account directly calls protected API | 401/403 without domain data | NOT RUN |
| AP-T02 / TC-06 | TOTP enrollment + challenge | Unproven enrollment denies; valid challenge enables factor; invalid/reused challenge denied | NOT RUN |
| AP-T03 / TC-07 | Passkey attempt without required UV, wrong origin/RP or reused challenge | Rejected; no session assurance elevation | NOT RUN |
| AP-T04 / TC-08 | Admin capability-only vs operational role-only | Neither implies the other; scoped denial | NOT RUN |
| AP-T05 / TC-09 | Loss of last factor / recovery | No email-only bypass, no role/approval changes, appropriate revocation | NOT RUN |
| AP-T06 / TC-08 | Disable/revoke session and repeat authenticated request | Next protected request denied | NOT RUN |
| AP-T07 / TC-38 | Judge on clean browser | Approved scoped access or isolated public showcase, no privileged bypass | NOT RUN |
| AP-T08 / TC-35 | Alternate sign-in routes and direct server requests | Same assurance, account and scope checks across routes | NOT RUN |
| AP-T09 / bootstrap | Re-run first-admin provisioning | No duplicate/elevation; audit and once-only restriction | NOT RUN |

**For implementation tasks**, retain test environment, exact installed versions, fixtures, expected/actual, CI links, trace, manual peer-review and failure evidence. Approval of this *policy document* is not completion of the implementation tests.

## 9. Delivery boundaries and subsequent engineering tasks

**Inside AB-WC-001:** review and select policies, document alternatives/open decisions, map to requirement/test IDs, obtain explicit Tech Lead decision and independent security review plan, raise PR with traceability. This is a documentation/policy task; no package install, migration, endpoint or schema modification is required.

**Not inside AB-WC-001:** implementation of 2FA/passkey or recovery features, creating admin identities, making production DB writes, enabling public signup, opening authorization guards, or declaring OWASP/NIST compliance.

**Implementation sequence recommended following approval:**
1. Verify Better Auth 1.7.9 plugin compatibility and schema/migration plan; implement MFA proof and exhaustive session-path gates in AB-WC-002 or explicitly scoped child task.
2. Implement safe pending onboarding/bootstrap workflow and activation only after assurance proof.
3. Implement session revocation/recovery with tests, then judge delivery path and scoped fixtures.
4. Add DB-backed integration tests and release checks; guard remains fail-closed until a reviewable, tested proof path exists.

**High-priority risks retained:** lockout without approved assisted recovery; judges unable to self-enroll MFA; initial bootstrap identity/proof circularity; access to private media after signed URL issuance; developer pressure to bypass `MFA_ASSURANCE_REQUIRED`. No bypass is accepted by default.

## 10. Owner decision record (must be completed by a human)

| Decision | Owner selection | Rationale/evidence | Status |
|---|---|---|---|
| AP-01..04 — MFA/passkey/activation | Pending | — | OPEN |
| AP-05 — First admin bootstrap | Pending | — | OPEN |
| AP-06..07 — Recovery/last factor | Pending | — | OPEN |
| AP-08 — Session policy/step-up thresholds | Pending | — | OPEN |
| AP-09..10 — Judge and login paths | Pending | — | OPEN |
| Independent security reviewer and release gate | Not designated | — | OPEN |
| Approval date and reviewer evidence | Not recorded | — | OPEN |

**PR target:** `chore/ab-wc-001-access-policy` → `develop` (only after branch exists and document has been reviewed).  
**Notion status:** AB-WC-001 remains Ready/In Progress until owner decision; do not mark Done or mark AB-DEC-004/014 Accepted merely from this draft.  
**Execution evidence:** source inspection and requirement reading only; no local commands, tests, migrations, production access or deployment performed for this work product.
