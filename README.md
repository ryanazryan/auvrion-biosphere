# Auvrion Biosphere

**An Integrated AIoT & WebGIS Platform for Biodiversity Conservation and Forest Fire Risk Monitoring**

Auvrion Biosphere is an environmental intelligence platform designed to connect biodiversity observations, environmental monitoring, geospatial information, and human-led incident response within an integrated web ecosystem.

Developed by **Team Pais Patin** for the **UINIC 8.0 Web Development Competition 2026**.

## Project Overview

Environmental monitoring data is often fragmented across separate devices, applications, and reporting processes.

Auvrion Biosphere aims to connect environmental observations with verification and operational response, enabling users to understand potential risks and coordinate appropriate actions.

**Core principle: IoT observes. AI assists. Web orchestrates. Humans decide.**

## MVP Scope

The proposed V1 focuses on two observation capabilities:

### LISTEN — Biodiversity Monitoring

- Bioacoustic observation through a proof-of-concept recording device.
- Audio observation records and manual uploads.
- AI-assisted candidate analysis where feasible.
- Human verification before findings are treated as confirmed evidence.

### PREVENT — Environmental Risk Monitoring

- Environmental measurements using BME280 and PMS5003 sensors.
- Temperature, humidity, pressure, and particulate indicators.
- Environmental risk observations and early-warning support.
- Human review of potential risk indicators.

Sensor readings and AI outputs are not automatically considered verified evidence of wildlife presence or forest fires.

### Supporting Platform Capabilities

The planned system includes:

- WebGIS-based observation visualization.
- Observation provenance and verification.
- Incident management and response workflows.
- Role-based access control.
- Evidence and operational history.
- Reporting capabilities.

Operational workflows are intended to support **Operators, Supervisors, and Rangers**.

## Technology Stack

The proposed architecture is a **Next.js full-stack modular monolith**.

| Layer | Planned Technology |
|---|---|
| Full-stack framework | Next.js |
| Frontend | React, TypeScript |
| Styling | Tailwind CSS |
| Backend | Next.js Route Handlers and server-side modules |
| Database | PostgreSQL + PostGIS |
| ORM | Drizzle ORM |
| Authentication | Better Auth |
| Geospatial visualization | MapLibre GL JS |
| Testing | Automated unit, integration, and end-to-end tests |

Technology selections and exact dependency versions will be validated during implementation.

## Development Status

**Status: Active V1 Prototype Development**

Auvrion Biosphere has an implemented application foundation, including:

- Better Auth authentication, MFA assurance, and role-based access controls.
- PostgreSQL/PostGIS domain schemas and observation data services.
- Gated onboarding and administrative access management.
- Operator observation workspace with manual intake, list, and detail views.
- Private WAV evidence upload and authorized playback.
- Scoped MapLibre WebGIS workspace with textual fallback.
- Automated lint, typecheck, unit tests, and selected database integration tests.

These capabilities are implemented as development-stage functionality.
They do not imply production certification or complete end-to-end acceptance.

Remaining work includes operational response workflows, IoT integration,
review and reporting features, deployment, and final security testing.

"""

path.write_text(content[:start] + replacement + content[end:], encoding="utf-8")
PY

## Engineering Principles

- Build features from verified requirements.
- Prefer simple, maintainable architecture.
- Keep frontend and server-side responsibilities separate.
- Enforce authentication and authorization on the server.
- Validate untrusted inputs and protect sensitive data.
- Minimize dependencies and maintain reproducible installations.
- Test implemented behavior before declaring features complete.
- Keep simulated, historical, and observed data distinguishable.
- Preserve human oversight for consequential operational decisions.

## Development Workflow

- `main` — stable integration branch.
- `develop` — active development branch.
- Feature branches may be introduced when needed.

Changes should be reviewed and tested before integration into `main`.

## Team

**Pais Patin**

- Tech Lead — Software engineering and technical architecture.
- Financial Lead — Financial planning, budgeting, and procurement.
- Pitch Lead — Product narrative, research, and presentation.

## Disclaimer

Auvrion Biosphere is a competition-stage prototype under development.

It is not a certified wildfire detection system, emergency response system, or substitute for professional environmental assessment.

Environmental indicators and automated analyses require appropriate validation and human interpretation.
