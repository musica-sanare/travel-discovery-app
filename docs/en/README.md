English | [日本語](../ja/README.md) · [Repository README](../../README.md)

# Travel Discovery documentation

Specification, design, and guides for Travel Discovery, plus the English-only working docs used during development.

## Specification and design

| Document | Description |
|---|---|
| [Product specification](SPEC.md) | What the app does, for whom, and what is out of scope for the MVP. |
| [Architecture](ARCHITECTURE.md) | Workers, logical layers, request flows, admin authentication, AI boundary, and privacy. |
| [Data model](DATA_MODEL.md) | Entities, localization tables, and constraints in D1. |
| [Diagnostic algorithm](DIAGNOSTIC_ALGORITHM.md) | Specification of the deterministic question selection, scoring, and ranking. |

## Guides

| Document | Description |
|---|---|
| [Local development](DEVELOPMENT.md) | Setup, commands, project layout, tests, E2E, and CI. |
| [Deployment runbook](DEPLOYMENT.md) | Environments, D1 and migrations, Cloudflare Access, deploy, rollback, and deployment history. |
| [AI enablement runbook](AI_ENABLEMENT.md) | Enabling the optional AI notes: the record of the former preview trial, limiter check, production enablement, and how to disable AI. |
| [Operations runbook](OPERATIONS.md) | Monitoring, routine and dated checks, incidents, backups, and publishing content. |

## Working docs (English only)

| Document | Description |
|---|---|
| [Decisions](../working/DECISIONS.md) | Architecture decision records (ADRs) and verification logs. |
| [Implementation plan](../working/IMPLEMENTATION_PLAN.md) | Phases, their prompt files, and acceptance criteria. |
| [AI model evaluation](../working/AI_EVALUATION.md) | Plan, criteria, and records for comparing Workers AI models. |
| [Public release checklist](../working/PUBLIC_RELEASE.md) | Checks to complete before the repository is made public. |
