# AB-WC-019 — candidate extension: operational signal analytics

## Trust tiers

1. `observations`: a recorded observation, not a detected crime or verified event.
2. `observation_signal_events`: a candidate `signal_class`, human-authored or (future) trusted model output.
3. Human review: `corroborated` or `rejected` with author, time and reason; a *signal* has been corroborated, not a fire or illegal act automatically.
4. Incident verdict (separate future governed contract): field-backed case outcome explicitly indicating a confirmed incident. **This kit does not implement this tier.**

Signal classes: `fire_indicator`, `chainsaw_like`, `gunshot_like`, `human_activity`, `biodiversity_signal`, `unclassified`.

Scores must be calibrated probabilities (0..1) with model reference; Perch's raw model score is *not* calibrated confidence. Browser actors cannot submit model outputs. `trusted_model_output` is schema reserved, awaiting validated server-side audio/model adapter.

## Integration to LISTEN hardware

Existing `POST /api/device/recordings` accepts a private PCM16 WAV and writes biodiversity observation + receipt after verifying token/hash/idempotency. No change is made by this kit.

When the future classifier exists:
- Read WAV through the existing authorized evidence path, verify storage hash.
- Classify an audio event using a **validated** threat-sound model, separate from wildlife Perch.
- Persist `trusted_model_output` atomically with stable request ID, audio hash, model version, score calibration metadata, observation and tenant scope.
- Queue manual review; NEVER auto-create confirmed illegal-logging/fire/poaching cases.
- Use independently labeled chainsaw/gunshot/background/wildlife audio and evaluate precision, recall, false-alarm rate by domain and recording conditions. Do not claim accuracy without results.

## KPI semantics

* Live mode only reads DB and filters observations marked `simulation` for signal/observation analytics.
* Demo mode is explicitly user-selected synthetic preview isolated in client and never persists.
* 0 means zero **recorded classified signals** for that period, not proof of no incidents.
* Results are scoped to organization. Region charts require verified spatial access boundaries, therefore not in this kit.
* Case and Task counts are administrative and not incident outcomes.
* Monthly bins UTC; not local incident occurrence dates.

## Work Control status evidence required

- **Ready for review** after schema generation, migrations on test DB, lint/typecheck/tests/build and cross-role browser QA.
- **Done** only after reviewers verify DB aggregates against SQL, simulation isolation, negative RBAC and replay/security tests, documentation and acceptance evidence.
- Not a claim to complete AB-WC-015 physical IoT, AB-WC-016 PREVENT, AB-WC-020 deployment or all FR/NFR/MFL.
