# Implementation Roadmap

Este roadmap es una **secuencia histórica y propuesta de evolución**, no una descripción automática del código ni el fin del proyecto. [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md), migraciones aplicadas y tests prevalecen al decidir qué existe. Las funciones futuras necesitan nueva decisión y sus propias pruebas.

## Delivery Rules

- Phase 0 approval was granted by the product owner; implement Phase 1 only.
- The first product milestone must prove the complete manual coaching loop, not isolated CRUD modules.
- Authorization, historical integrity, accessibility, error states, and tests ship with each slice.
- Build only the tables and infrastructure exercised by the current phase; `docs/prisma/schema.prisma` is a reviewed target model, not the first migration.
- AI and notifications remain later additions. Manual planning and workout execution must work without Redis, workers, AI, or n8n.

## Product Milestones

```text
Milestone A (Phases 1-4)
trainer/student auth -> profile -> seeded exercise -> published plan
-> dated workout -> mobile execution -> partial/complete -> early safety fact
-> previous performance and basic history

Milestone B (Phases 5-6)
optional structured feedback -> recovery/discomfort facts
-> deterministic metrics -> trainer attention -> audited historical corrections

Milestone C (Phases 7-9)
AI proposals -> monthly reports/notifications -> launch hardening
```

## Phase 0: Architecture Approval

### Scope

- Approve this planning package and the pre-implementation review.
- Resolve the Phase 1 schema/package gates: age representation, canonical repository name, and measurable Phase 1 service-level targets.
- Accept launch tenancy: one workspace per trainer-owner, with teams and organization switching deferred.
- Accept opaque server-side sessions and current membership/assignment checks on every protected request.
- Record jurisdiction/age/retention as a hard gate before real wellness data or beta, and provider/privacy selection as a hard gate before Phase 7.
- Freeze Phase 1 contracts only, not late-phase AI/report contracts.

### Exit gate

- Product owner records approval or replacement decisions.
- No unresolved Phase 1 security/privacy blocker is treated as a default; later gates have explicit owners and phases.
- Database constraint/trigger strategy is accepted.
- Canonical repository path is confirmed.

## Phase 1: Foundation, Authentication, and Coaching Profiles

### User outcome

A trainer-owner can sign in, invite a student, complete/review the profile, record measurements/constraints, and see only assigned students. A student can accept the invitation, sign in, and complete exact allowlisted factual fields.

### Scope

- pnpm workspace, strict TypeScript, Next.js, NestJS, PostgreSQL/Prisma, CI, Docker Compose;
- one workspace per trainer-owner, users, memberships, trainer/student profiles, automatic assignment;
- membership/workspace-bound opaque hashed server sessions, logout/revocation, password reset, CSRF, and admin MFA enrollment/challenge/recovery;
- minimal auth-mail adapter or explicit secure manual-link delivery for invitation and reset tokens;
- readiness revisions, availability, activities, goals, constraints, body-weight measurements, trainer notes;
- strict separate student/trainer Zod write contracts and OpenAPI;
- request IDs, stable errors, focused audit events, health/readiness;
- responsive trainer/student shells and light/dark tokens.

### Tests and exit gate

- authorization matrix proves student self-only, trainer assigned-only, and cross-organization denial;
- student mass-assignment attempts cannot write trainer notes, readiness, assignments, or plan fields;
- membership/assignment revocation takes effect on the next request;
- profile/constraint/activity changes increment planning revision and invalidate readiness;
- an automated end-to-end API path proves trainer login → create/retrieve student → student login → student authorization denial; web shells build for mobile/desktop and remain subject to the later full Playwright/browser matrix;
- sensitive values do not enter logs; setup and migration run from documented steps;
- standard local CRUD calls generally complete under 500 ms excluding external dependencies (development target, not a production SLA).

## Phase 2: Seeded Exercise Catalog and Licensed Technique Media

### User outcome

The trainer can search, create, edit, activate/deactivate, and verify a small organization-owned catalog. Students can browse active exercises and project-original visual references in a read-only technique view; workout-embedded delivery arrives in Phase 4.

### Scope

- organization-owned exercise entities with primary/secondary muscles, equipment, movement pattern, difficulty, aliases, performance mode, load convention, descriptions, instructions, mistakes, caution notes, and active state;
- curated seed process using only original, public-domain, or compatible licensed media;
- read/search filters required by plan building;
- stable media references, verified attribution, and text fallback;
- a read-only student catalog with no mutation controls; no user-upload workflow, library-manager role, or globally editable shared catalog.

### Tests and exit gate

- cross-organization exercise references fail;
- unverified/unpublished media cannot be selected for future student projections;
- inactive exercises remain historically identifiable but cannot be newly programmed;
- every seeded asset has source/license/attribution metadata;
- no third-party copyrighted asset is copied without approval.

## Phase 3: Reusable Plans, Workout Templates, and Assignments

### User outcome

The trainer builds an organization-owned reusable draft, publishes an immutable version, and assigns it to a student. The student reads only their currently assigned program. Dated workout sessions begin in Phase 4.

### Scope

- reusable organization-owned plan identities and at most one active version-pinned assignment per student;
- `DRAFT -> ACTIVE -> RETIRED` and `DRAFT -> VOID` plan versions, one-draft policy, transactional version numbering, and atomic publish;
- templates, ordered programmed exercises, target sets/reps, RIR/RPE, rest, notes, optional suggested load;
- exercise/load/instruction snapshots at publish;
- draft autosave with version conflicts, validation, keyboard reorder;
- explicit assignment/replacement and student read-only program projection; scheduling is deferred to Phase 4;
- publishing a new version never silently changes existing assignments or future session history.

### Tests and exit gate

- no student endpoint or DTO can modify a plan or prescription;
- active/retired versions and children reject updates at service and database levels;
- only an active version can receive a new assignment; existing assignments may remain pinned to retired versions;
- assignment/student/plan-version lineage constraints reject another organization's student or exercise;
- suggested load never appears in actual-performance fields;
- Playwright covers build, publish, assignment, and student read-only preview; no session execution endpoints exist.

## Phase 4: Complete Manual Workout Loop

### User outcome

A student can start/resume a dated workout, see previous actual performance and technique media, log and correct actual sets, finish complete or partial with a quick structured reason, cancel with zero completed sets, and review basic history. Detailed feedback and its 24-hour resumption belong to Phase 5.

### Scope

- atomic immutable prescription snapshots and exact set placeholders at occurrence scheduling;
- explicit dated scheduling from a student's currently assigned immutable version (including a still-assigned retired version);
- per-set optimistic autosave using set version;
- server-computed `COMPLETED`, `PARTIAL`, and zero-completed-set `CANCELLED` transitions;
- canonical early-finish safety events; detailed post-workout feedback deferred to Phase 5;
- simple reload-safe browser rest timer with no per-second backend writes;
- previous performance embedded in start/resume projection;
- basic trainer/student session history and source detail;
- resilient pending-edit recovery with explicit save state, not guaranteed full offline operation.

### Tests and exit gate

- start is idempotent and snapshots the correct student's published prescription;
- students can update only actual fields on their own in-progress sets;
- active-load convention and actual/suggested separation are tested;
- previous performance is latest eligible finalized execution and never prefills today;
- early finish preserves completed sets and produces valid `PARTIAL` history with a structured reason;
- discomfort finish is never blocked, never duplicated by feedback, and becomes an explainable trainer fact;
- finalized rows reject student updates; mobile 360px flow has no blocked controls;
- Playwright covers start, persistence/reload, technique, partial/complete, history, and authorization boundaries.

Milestone A is complete only when this full loop works against PostgreSQL without AI, Redis, n8n, or an analytics event pipeline.

## Phase 5: Structured Feedback, Discomfort, and Recovery Signals

### User outcome

Students can optionally submit one immutable structured feedback record after a completed/partial workout. Trainers inspect factual effort, recovery and discomfort reports without medical conclusions. Monthly analytics dashboards and risk scores remain out of scope.

### Scope

- one immutable submission within 24 hours for completed/partial sessions; exact retries return the same feedback and different resubmissions conflict;
- student-reported session RPE, overall perceived state, pre-workout recovery state and optional bounded notes;
- one or more relational discomfort locations with intensity, optional same-session exercise and note;
- canonical Phase 4 early safety event reuse with no duplicate discomfort incident;
- a fast conditional Spanish student form, history resumption and trainer read-only detail;
- a small deterministic recent-signal projection (last feedback, last discomfort, distinct sessions in 28 days) without charts or risk scoring.

### Tests and exit gate

- completed and partial sessions accept feedback; all nonterminal/cancelled/skipped states reject it;
- session/organization ownership, 24-hour deadline, ranges, exercise-in-session validation, one feedback/session and immutable report history pass PostgreSQL integration tests;
- a reported early discomfort incident and its detailed location count as one canonical event; multiple locations remain queryable independently;
- Playwright covers normal, discomfort, deferred-history and trainer-inspection flows on mobile and desktop;
- no medical inference, AI processing or Phase 6 metric registry ships here.

## Phase 6: Deterministic Analytics, Trainer Attention, and Historical Corrections

### User outcome

Students and trainers see deterministic progression/adherence/effort/recovery/discomfort facts tied to source records; the trainer can correct a proven finalized-set typo without destroying the original historical fact. Exercise/media administration already shipped in Phase 2.

### Scope

- versioned metric registry with source rows, eligibility states, timezone, formulas, rounding, null and correction semantics;
- completed/partial counts, adherence, compatible external volume, estimated strength, session RPE, body-weight and recovery/discomfort trends;
- student progress and trainer attention views with source drill-down, accessible chart alternatives and insufficient-data states;
- typed append-only set correction revisions;
- correction-aware previous performance and analytics;
- append-only body-weight replacement lineage.

### Tests and exit gate

- golden fixtures cover zero denominators, timezone boundaries, partial sessions, load conventions and unsupported modes;
- suggested values never enter actual metrics; all values disclose period, unit and metric-definition version;
- discomfort recurrence counts distinct canonical source sessions per location, not both early event and linked detail;
- historical snapshots survive catalog edits/archival;
- correction revision concurrency, actor/reason, original preservation, and recalculation behavior pass;
- ordinary updates to finalized sets/corrections/audit rows fail at the database layer.

## Phase 7: AI Generation and Adaptation

### User outcome

A currently assigned trainer can request a constrained proposal, understand assumptions/warnings, apply a selected subset once to a draft, edit it, and publish separately.

### Scope

- add Redis/BullMQ and one worker now;
- controlled context builder, explicit JSON retention/purge, provider abstraction;
- strict proposal schema, approved organization exercise IDs, performance modes, deterministic safety rules;
- persisted validation findings tied to draft revision/content hash;
- one-shot idempotent proposal application into a draft;
- provenance, quotas, prompt/model versioning, evaluation fixtures.
- database-to-queue reconciliation for orphaned nonterminal requests; Redis remains disposable.

### Tests and exit gate

- context allowlist/privacy snapshots; malformed output, timeout, retry, cancellation, duplicate/orphaned job reconciliation, and prompt-injection fixtures;
- no unknown/inactive exercise survives validation;
- an active organization admin or current trainer assignment is required for read/cancel/apply; original requestership alone is insufficient;
- warning acknowledgement is invalidated by relevant draft changes;
- no AI path publishes a plan, changes history, marks work complete, diagnoses injury, or forces load progression;
- core manual loop passes with Redis/provider unavailable.

## Phase 8: Monthly Reports and Optional Notifications

### User outcome

Trainers can generate revisioned monthly metric reports and optional narratives whose numeric claims are rendered only from deterministic metric placeholders.

### Scope

- immutable/revisioned monthly metric snapshots with timezone;
- structured claim-to-metric references and deterministic narrative rendering;
- report list/detail UI;
- optional notification preferences and outbound-only email/messaging/n8n adapters;
- add a transactional outbox only if guaranteed external delivery is required.

### Tests and exit gate

- historical correction creates a new summary revision instead of mutating a completed report;
- literal AI numeric claims and unknown placeholders are rejected;
- reports remain usable with AI disabled;
- n8n/notification failure cannot modify or block core state.

## Phase 9: Launch Hardening

### Scope

- final visual/accessibility polish and error/empty/offline/conflict-state audit;
- WCAG 2.2 AA review, mobile/browser matrix, usability tests;
- performance/load/security testing against approved budgets;
- data export, erasure/anonymization, retention jobs, backup restore, incident runbooks;
- production observability, alerting, rollback, and recovery exercise.

### Exit gate

- no critical/high security or accessibility issue remains;
- critical flows meet latency/browser targets;
- production restore meets approved RPO/RTO;
- privacy-rights workflows pass end to end;
- launch monitoring, rollback, and incident ownership are approved.

## Quality Commands

```text
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test                  # incluye integración API real con PostgreSQL
corepack pnpm test:e2e             # Playwright con base migrada/seed
corepack pnpm build
corepack pnpm --filter @machi-gym/api exec prisma validate
```

`test:integration` y `prisma:validate` no son scripts existentes; se conservaron sólo como intenciones de verificación en borradores previos. El procedimiento operativo completo está en [DEVELOPMENT.md](DEVELOPMENT.md).

## Definition of Done

- acceptance criteria demonstrated against running software;
- authorization and database invariants covered with positive and negative tests;
- contracts/OpenAPI and documentation updated;
- responsive, accessibility, loading, empty, conflict, and error states included;
- no sensitive data in logs or fixtures;
- migrations tested and rollback/forward-fix procedure documented;
- no unrelated critical regression deferred to the next phase.
