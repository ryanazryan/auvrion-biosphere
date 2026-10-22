# AB-WC-013 — First real Ranger read-only slice

This is an additive Next.js integration candidate, using the Figma Make 2026-10-22 03:21 export only as UX reference. Its browser-only role fixtures, in-memory mutations, fake media and artificial case/observation datasets have **not** been ported as production data.

## Included
- Server-side active account + approved Ranger role + current MFA assurance gate, with organization derived from server grant.
- Assigned-only GET list and detail APIs, including negative HTTP and query tests from 21 Oct prior candidate (reviewed before reuse).
- Role-specific responsive Ranger shell and initial pages: home, tasks, task detail, findings (disabled), history (limited summary), finding form (disabled) and task history (disabled).
- No unverified coordinates/private media, no Task writes, no production impersonation or demo-provider data.

## Intentional limitations
- Task transitions AB-TR-024..033 remain Proposed; no Accept/Start/Blocked/Resume/Submit writes.
- WC-010 evidence policy and Ranger privacy/consent still require approval. No evidence upload or outcome evaluation.
- History lists effective current assignments only. It is **not** a complete immutable event timeline; past revoked/reassigned records are intentionally unavailable.
- The original elaborate Figma Make visuals are not yet fully ported. This slice is a safe working data contract and accessible foundation, not final WC-013 completion.
- No route added to `/` role redirection; open `/ranger` manually after Ranger login until a separately-reviewed redirect update.
- No DB integration test or browser E2E test has yet passed in this environment.

## Acceptance before PR
1. Apply to local branch after developing branch synchronization; do not overwrite preexisting files.
2. `npm run lint`, `npm run typecheck`, targeted Vitest + DB integration negative tests, `npm run build`.
3. Ranger user with MFA sees only own assigned tasks; Operator/Supervisor/Admin cannot enter; revoked assignment guessed ID returns 404; unauthorized GET denied; no organization data leaks.
4. Verify views at 390px and 1440px.
5. Only after the Task state register is explicitly approved may a separate migration and transaction service expose write endpoints.
