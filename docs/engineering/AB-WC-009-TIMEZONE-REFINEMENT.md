# AB-WC-009 — Indonesia Timezone Refinement

Scope: Operator only, WIB (UTC+7), WITA (UTC+8), WIT (UTC+9). UTC persists in WC-008 backend. **No schema or migration changes.** The project-level `README.md` is untouched.

## Context

Former Operator UI used `NOW_LOCAL`/WIB string comparison for future-time validation and unconditionally interpreted all local datetime inputs as `+07:00`. That incorrectly rejected legitimate WITA/WIT observation times and previously caused an SSR/client hydration difference in `max`.

## Changes

- `src/figma-operator/time.ts`: shared timezone formatting, strict parsing, conversion and absolute-time comparison.
- `src/figma-operator/time.test.ts`: UTC/WIB/WITA/WIT, midnight crossing, future validation, invalid date and browser timezone unit tests.
- `src/figma-operator/operator-context.tsx`: SSR-safe initial WIB; after hydration detect Indonesian IANA browser timezone, or honor user selection stored in browser localStorage.
- `src/figma-operator/components/operator/OperatorLayout.tsx`: visible WIB/WITA/WIT selector, while preserving sidebar logout icon.
- `src/figma-operator/screens/operator/ObservationNew.tsx`: correct observed and measured time conversion, per-selected-zone labels and limits, revalidation before POST, no module-level current-time constant.
- `src/figma-operator/screens/operator/Observations.tsx`: labels and filters in selected zone, preserving UTC instants when display zones switch.
- `src/figma-operator/screens/operator/ObservationDetail.tsx` and `Overview.tsx`: display timestamps in selected zone; overview recent list uses shorter ID visually (full ID in tooltip).
- `src/figma-operator/observations.ts`: replace obsolete hardcoded WIB functions with shared display helper export.

## Install (on `feat/ab-wc-009-operator-observation-workspace`)

1. Stop `npm run dev` and inspect `git status -sb`. Back up any uncommitted custom changes in the listed files before replacing them.
2. Extract this zip at the **repository root**, preserving folder paths. It includes only the files listed above and this document. Do not extract a second copy of `src` under an extra directory.
3. Check `git diff --check`, `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build`.
4. Open `/operator/overview`, `/operator/observations`, `/operator/observations/new`, and an existing detail page under `/operator/observations/<id>`.

## Acceptance

- Chrome timezone Asia/Makassar -> selector resolves WITA after hydration; changing to WIB or WIT stays selected after refresh in same browser. If device IANA zone is not Indonesian, fallback is WIB and selection is manual.
- Existing test observed timestamp `2026-10-19T15:31:00Z` renders `2026-10-19 23:31 WITA`, `22:31 WIB`, or `2026-10-20 00:31 WIT` without modifying stored data.
- `2026-10-19T23:31` entered with WITA produces `2026-10-19T15:31:00.000Z` in POST and is **not** marked future if current UTC is 15:46 that day. A later timestamp is rejected.
- Changing timezone on the Observation List does not change the absolute UTC range represented by an already selected filter; visible time values change.
- The New Observation form interprets wall-clock times using the **currently selected zone**. If the user changes zone after entering a time, the clock value remains as typed but refers to the newly selected zone. Recheck inputs when changing zones mid-form.
- Hydration shows no `datetime-local max` mismatch on hard refresh.
- Re-test server-auth/session, quality `unreviewed`, provenance, and manual intake with authorized development operator. **Build alone does not establish runtime success.**

## Verification performed outside the owner's repository

- TypeScript/TSX syntax parse checks for all generated module files.
- Standalone test of the pure timezone helper: WIB/WITA/WIT offset, UTC round-trip, invalid calendar date, and future-time comparison.
- Local repository dependency-based Biome, Vitest and Next build were **not** run in the artifact environment. The repository owner must run them locally and report results before PR.
