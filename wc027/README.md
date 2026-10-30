# AB-WC-027 — Ranger updates and photo upload repair (candidate)

Source baseline: repository `ryanazryan/auvrion-biosphere`, branch `develop`, read 26 October 2026. Your local branch may differ. This installer fails closed on unexpected source or existing routes.

## What this repairs

- Missing `POST /api/ranger/tasks/[id]/findings` route delegates to existing `createRangerFinding` transactional service, with same-origin, bounded JSON, idempotency key, scoped Ranger MFA/assignment.
- Missing `POST /api/ranger/tasks/[id]/findings/[findingId]/photos` route delegates to existing private photo service; validates origin, type and upload size (including streamed chunked input). `PRIVATE_EVIDENCE_DIR` must already be configured as a safe **absolute path outside the repo**, per service implementation. The directory must exist and be writable by the server process.
- Supervisor task detail replaces its snapshot-only findings with an authorized activity feed (task workflow events + saved Ranger findings) polling every ~10 seconds via a new read-only Supervisor-scoped endpoint. Existing private photo gallery also polls every ~10 seconds while the tab is visible.
- Ranger form reports explicit HTTP errors instead of mislabeling HTTP 404 as network uncertainty. One saved finding is one progress update; multiple findings can be saved while task is `in_progress`. Final submission remains AB-TR-028 and approval remains Supervisor-only.
- No DB migration; no direct messaging, no push notifications, no unreviewed coordinates/media disclosed.

## Installation

Extract ZIP into repo root (creating a `wc027/` folder), and run in Git Bash:

```bash
git status -sb
python wc027/apply_wc027.py --check
python wc027/apply_wc027.py --apply
npx biome check --write \
  'src/app/api/ranger/tasks/[id]/findings/route.ts' \
  'src/app/api/ranger/tasks/[id]/findings/route.test.ts' \
  'src/app/api/ranger/tasks/[id]/findings/[findingId]/photos/route.ts' \
  'src/app/api/ranger/tasks/[id]/findings/[findingId]/photos/route.test.ts' \
  'src/app/api/tasks/[id]/activity/route.ts' \
  src/components/supervisor/TaskActivityFeed.tsx \
  'src/app/supervisor/tasks/[id]/page.tsx' \
  src/components/shared/TaskPhotoGallery.tsx \
  src/components/ranger/RangerFindingForm.tsx
npm run lint && npm run typecheck && npm test && npm run build && git diff --check
```

Installer backups for modified existing files are in `.git/wc027-ranger-progress-backup/`. Read Git status before staging. Do not add the `wc027` extraction folder, local backups, secrets, or runtime evidence files to the PR.

## Acceptance testing (Ranger Mozilla, Supervisor Brave or Chrome)

1. Task already `assigned` → Ranger uses AB-TR-024 to `accepted`, then AB-TR-025 to `in_progress`.
2. Save **first** finding without photo. Expect HTTP 201 JSON `{findingId,replayed:false}`, and find it in `/ranger/tasks/<id>/history`.
3. Open `/supervisor/tasks/<id>` (not merely `/supervisor/decisions/<caseId>`). Activity feed should show update within ~10 seconds.
4. Save a **second** finding. Both must appear once with timestamps. A replay using the same idempotency key does **not** duplicate the row.
5. Upload a valid JPEG/PNG/WebP ≤ 5 MB to an existing finding. Expect HTTP 201 JSON with `mediaId`, then private gallery appears in Supervisor. File binary must remain behind authorized GET routes; no public object URLs.
6. Check invalid assignment, revoked role, wrong organization, MIME spoofing, oversized payload, XSRF/foreign Origin, duplicates and repeated submission.
7. Ranger submits AB-TR-028 only after at least one persisted finding. Supervisor accepts AB-TR-029 or returns AB-TR-030 according to approved workflow.
8. The activity feed is polling, **not WebSocket real-time**. Connectivity is required and reports are not stored offline by this patch.

## Things to confirm

- If `404` persists after applying, verify Next.js recognizes `src/app/api/ranger/tasks/[id]/findings/route.ts`; restart `npm run dev` once and inspect status/response body.
- If photo returns `503 PHOTO_PRIVATE_STORAGE_UNAVAILABLE`, check `.env.local` `PRIVATE_EVIDENCE_DIR`, directory exists and permissions. Never move private evidence into `public/` or a repo-tracked folder.
- If photo returns `422 INVALID_PHOTO_FORMAT`, the claimed MIME and actual file signature differ.
- If no Supervisor updates, confirm you are on **Task Detail** `/supervisor/tasks/<taskId>`, using the same org and an authorized Supervisor account.
- If source edits differ from the checked `develop` snapshot, installer stops without changing them. Reconcile manually instead of using `--force`.
