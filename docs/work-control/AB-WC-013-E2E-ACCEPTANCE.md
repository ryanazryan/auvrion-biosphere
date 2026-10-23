# AB-WC-013 — Cross-role E2E Acceptance

## Document Control

- Project: Auvrion Biosphere
- Work Control: AB-WC-012 / AB-WC-013
- Document Type: End-to-End Acceptance Checklist
- Status: Pending reproducible verification
- Target Branch: develop
- Environment: Local development with isolated test data

## Objective

Verify the end-to-end Case and Task lifecycle across
Operator, Supervisor, and Ranger workspaces.

The acceptance procedure must demonstrate functional
workflow behavior, authorization boundaries, data
consistency, and auditability.

## Preconditions

- Local application and PostgreSQL services available.
- Database migrations applied.
- Approved Operator, Supervisor, and Ranger accounts.
- Account activation and session MFA requirements satisfied.
- Test organization and permitted demonstration data available.
- Separate browser sessions for each role.
- No production or sensitive conservation data used.

## Acceptance Scenarios

| ID | Scenario | Expected Result | Status |
|---|---|---|---|
| E2E-01 | Operator creates observation | Observation persisted in authorized organization | Not rerun |
| E2E-02 | Supervisor reviews Case | Case moves through approved transitions | Not rerun |
| E2E-03 | Supervisor assigns Ranger Task | Assignment visible to authorized Ranger | Not rerun |
| E2E-04 | Ranger accepts Task | Assigned to accepted, with audit event | Not rerun |
| E2E-05 | Ranger starts work | Accepted to in_progress | Not rerun |
| E2E-06 | Ranger submits finding | Authorized finding is persisted | Not rerun |
| E2E-07 | Ranger uploads evidence | Private evidence accessed only by authorized roles | Not rerun |
| E2E-08 | Ranger submits Task | In_progress to submitted | Not rerun |
| E2E-09 | Supervisor completes Task | Submitted to completed with history | Not rerun |
| E2E-10 | Cross-role status refresh | Updated workflow status visible across sessions | Not rerun |
| E2E-11 | Unauthorized Task access | Cross-organization or other-Ranger access denied | Not rerun |
| E2E-12 | Historical Task visibility | Completed/cancelled Task retained for authorized history | Not rerun |
| E2E-13 | Expired session | Protected actions rejected until assurance restored | Not rerun |

## Prior Evidence

Earlier engineering sessions reported a manual
Operator -> Supervisor -> Ranger -> Supervisor flow.

That report is historical context, not a fresh
acceptance execution for this document.

The reported scenario included:
- Manual observation intake.
- Case review and assignment.
- Ranger Task transitions.
- Ranger finding and photo evidence.
- Supervisor Task completion.
- Cross-role status synchronization.

Do not treat the above as independently verified
until rerun evidence is recorded.

## Automated Verification Baseline

Related automated coverage exists in:
- Approved Task policy unit tests.
- Ranger read-scope isolated PostgreSQL tests.
- Operational authorization tests.
- Private evidence tests.

These tests are complementary and do not replace
browser-level E2E verification.

## Evidence Register

For each scenario, record:

- Execution date and local timezone.
- Environment and commit SHA.
- Test account role (no credentials).
- Sanitized test record identifiers.
- Observed outcome.
- PASS / FAIL / BLOCKED.
- Screenshot, test log, or CI artifact reference.
- Reviewer and remediation reference if needed.

Do not publish:
- Passwords, tokens, cookies, or MFA secrets.
- Real protected location coordinates.
- Sensitive biodiversity evidence or private media.
- Personal details of real users.

## Exit Criteria

This document can move from Pending to Accepted only when:

1. All applicable scenarios have been executed.
2. No critical authorization failure remains.
3. Relevant automated tests pass, not skip.
4. Evidence references can be inspected.
5. Failed or blocked scenarios have explicit disposition.
6. Owner/reviewer approval is recorded.

## Current Decision

Pending reproducible E2E verification.

Documentation prepared; browser-level acceptance
has not been re-executed as part of this PR.
