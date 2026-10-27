# Auvrion Biosphere

**AIoT & WebGIS for Biodiversity Conservation and Forest Fire Risk Monitoring**

Built by Team Pais Patin for UINIC 8.0 Web Development Competition 2026.

Auvrion Biosphere links field observations, device audio, satellite and weather *references*, and human-operated review workflows. **IoT observes; AI assists; humans verify and decide.** NASA thermal anomalies, model air-quality estimates, and AI bioacoustic candidates are not verified fire incidents or wildlife identification.

## Scope and roles

- **Operator:** observation intake and provenance; WebGIS context; evidence review and handoff.
- **Supervisor:** scoped Cases, guarded decision transitions, assignments, Ranger outcomes and audit trail.
- **Ranger:** assigned tasks, findings and private photo evidence; no automatic incident confirmation.
- **Admin:** authorized provisioning of identities, sources and LISTEN devices; no implicit access to operational data outside grants.

## Core stack

Next.js 16, React 19, TypeScript, Drizzle ORM, PostgreSQL/PostGIS, Better Auth, MapLibre GL JS, Vitest and Playwright.

## Start locally

```bash
npm ci
# Configure .env.local using .env.example. Never commit secrets.
# Start PostgreSQL/PostGIS and apply reviewed Drizzle migrations first.
npm run dev
```

Quality gates:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

PostgreSQL-backed test suites, browser acceptance, actual private-storage restores, independent security review and physical IoT tests are separate requirements. Passing unit tests does not certify a production release.

## IoT LISTEN integration

The implemented device endpoint is `POST /api/device/recordings` (device bearer token, raw validated WAV). It creates a biodiversity observation and durable recording receipt, returning an ACK only after successful persistence and file verification. Do not treat missing heartbeat as proof a device is online. For header-level detail and retry semantics, see `docs/work-control/AB-WC-015-IOT-LISTEN-FIRMWARE-HANDOFF.md`.

IoT **PREVENT** sensor measurement ingestion is **not implemented** by the WAV endpoint; manual environmental observations and external reference feeds are distinct. Do not label them as live PREVENT readings.

## Maps and evidence policy

- Real basemap display depends on approved `NEXT_PUBLIC_AUVRION_BASEMAP_STYLE_URL` and `NEXT_PUBLIC_AUVRION_BASEMAP_ATTRIBUTION` configuration and worker assets prepared in `predev`/`prebuild`.
- Sensitive locations require server-side access controls. Biodiversity coordinates must not be exposed merely because an observation exists.
- Simulated, live and historical inputs carry separate provenance/ingestion modes. Schematic/demo screens are not operational measurements.

## Workflow and delivery status

Production deployment, HTTPS, remote backups and restore exercise, cross-role/tenant E2E, external provider failures, physical LISTEN validation, scientific AI benchmarks and final release sign-off require recorded acceptance. See the authoritative Notion Engineering Work Control and `docs/work-control/` for scope and evidence; source presence alone does not imply a Work Control is Done.

## Project documentation

- Engineering documentation and acceptance notes: `docs/work-control/`
- Device ingestion implementation: `src/server/device-ingestion/`
- Operator UI: `src/figma-operator/screens/operator/`
- Supervisor and Ranger routes: `src/app/supervisor/` and `src/app/ranger/`
- Database migration history: `drizzle/`
