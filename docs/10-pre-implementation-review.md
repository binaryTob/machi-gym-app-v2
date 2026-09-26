# Pre-Implementation Review

**Phase 3 amendment:** The subsequent product-owner Phase 3 specification replaces the one-plan-per-student assumption in this original review. See [Phase 3 plan decisions](12-phase3-plan-decisions.md). A plan is now reusable; `StudentPlanAssignment` pins one published version per student. The historical Phase 1 review text below records the earlier decision and must not override the later Phase 3 specification.

**Phase 4 amendment:** The later Phase 4 specification requires a quick structured partial-finish reason and defers detailed post-workout feedback to Phase 5. [Phase 4 workout decisions](13-phase4-workout-execution-decisions.md) supersede the optional-reason/Phase-4-feedback language in this historical review. Occurrence snapshots are created at scheduling, not at start.

**Phase 5 amendment:** [Phase 5 feedback decisions](14-phase5-feedback-decisions.md) implement one immutable submission within 24 hours, a separate recovery state and relational discomfort details linked to canonical safety events. Discomfort is an explicit yes/no field, not a perceived-state enum value. Deterministic metrics and dashboards move to Phase 6; no AI or diagnosis is performed here.

Review date: 2026-09-23; Phase 1 approved by product owner.

## 1. Verdict

**Phase 1 status: APPROVED FOR IMPLEMENTATION.**

The product owner resolved the four Phase 1 gates:

1. Store optional `birthDate` only; calculate age on demand and never persist a mutable age.
2. Use repository `machi-gym-app-v2`, package scope `@machi-gym`, and user-facing name `Machi Gym`.
3. Phase 1 gates: trainer/admin login, dashboard, student creation/profile edit/assigned roster; student login, own profile, and server-enforced RBAC. Strict TypeScript, lint, typecheck, automated tests, Prisma validation, documented startup, and one reproducible trainer → student authorization path. Local standard CRUD requests generally under 500 ms excluding external dependencies, not a production SLA. Production browser/RPO/RTO targets are deferred.
4. Documents 01-10 are approved as the Phase 1 architectural baseline.

This is not a request to resolve the AI provider, production retention period, or team features before Phase 1. Those have explicit later gates. No application code or migration was created during this review.

## 2. Review Scope

The review covered:

- product scope, roles, journeys, success criteria, and non-goals;
- domain boundaries, state machines, historical integrity, and terminology;
- runtime topology, transaction boundaries, concurrency, and failure isolation;
- REST commands, response projections, field-level authorization, and retry behavior;
- AI trust boundaries, validation, provenance, retention, and degraded operation;
- mobile workout UX, feedback safety, accessibility, and trainer review flows;
- authentication, authorization, privacy, audit, recovery, and external integrations;
- delivery sequencing, phase gates, tests, and avoidable infrastructure;
- the proposed Prisma target schema and required PostgreSQL-only enforcement.

The previous repository at `../machi-gym-app` was used only as a read-only product reference. It is not an architecture or implementation baseline.

## 3. Material Corrections Applied

### Scope and architecture

- Reduced launch tenancy to one trainer-owner workspace while retaining `Organization` as the data boundary.
- Defined the owner as one `ADMIN` membership with a trainer profile; `ADMIN` inherits trainer capabilities.
- Bound opaque server sessions to one user, membership, and organization.
- Selected a Next.js/NestJS/PostgreSQL modular monolith for the manual loop.
- Deferred Redis, BullMQ, and the worker until Phase 7, when durable external AI work first exists.
- Deferred a transactional outbox until an integration has a real guaranteed-delivery requirement.
- Rejected generic repositories, CQRS infrastructure, event sourcing, a separate read database, and duplicated domain/persistence models.

### Plans and execution

- Original Phase 0 assumption (superseded in Phase 3): one plan identity per student. Phase 3 now uses reusable plans with version-pinned student assignments; see document 12.
- Simplified the lifecycle to `DRAFT -> ACTIVE -> RETIRED` or `DRAFT -> VOID`; publish is approval plus activation.
- Required transactional version-number allocation and immutable non-draft content.
- Preserved scheduled-session provenance when a replacement plan is published.
- Required every workout mutation to lock the same session row before checking state, preventing set-save/finalize races.
- Prohibited duplicate canonical exercises in one template so previous-performance matching is deterministic.
- Made partial reasons optional so urgent safe exit is never blocked.
- Made both discomfort and feeling-unwell early finishes create canonical typed safety events.

### Data and analytics

- Kept prescribed values, suggested loads, actual performance, and correction revisions separate.
- Defined typed full-replacement set corrections, including completion state/time, actor, reason, and monotonic revision.
- Clarified volume normalization versus estimated-strength input.
- Defined adherence eligibility, past-due cutoff, cancellation actors, excusal authority, and timezone snapshot behavior.
- Defined discomfort recurrence as distinct sessions per normalized body region, not ambiguous report/event counts.
- Made monthly summaries immutable revision chains with timezone and metric-definition provenance.

### AI and security

- Kept AI output proposal-only; applying affects a draft and publishing remains a separate trainer action.
- Attached reviewable findings to a draft revision/content hash and required acknowledgement at publish, while hard blocks remain non-overridable.
- Required active admin or current trainer assignment for stored AI-record access.
- Added database-to-queue reconciliation so Redis is disposable rather than authoritative.
- Constrained monthly narratives to typed clauses with metric-key placeholders.
- Kept n8n optional and outbound-only; any future inbound webhook is a separate trust-boundary design.

## 4. Required Database Enforcement

Prisma expresses model shape but cannot enforce every cross-row invariant. Each phase migration must include the relevant PostgreSQL constraints/triggers and negative integration tests. Comments at the end of `docs/prisma/schema.prisma` are requirements, not optional implementation notes.

| Area | Required database behavior |
| --- | --- |
| Tenant identity | Composite organization lineage; session user must match membership user; one active workspace membership per user at launch; one owner with valid role/profile |
| Profile readiness | Relevant profile/activity/constraint changes increment planning revision and invalidate trainer confirmation |
| Exercise/media | Mode-compatible load fields; positive multiplier; active media requires complete verified licensing provenance |
| Plan lifecycle | Only documented transitions; one active/one draft; non-draft parent and child rows immutable; publish revalidates current profile and findings |
| Scheduling | Session student must own the template's plan; new schedules require active source version; retry key prevents duplicates |
| Execution | Published/session snapshots exactly match source rows; every programmed exercise occurs once; exact contiguous set positions; all mutations lock parent session |
| Finalization | Server-derived terminal state; completed/partial/cancelled row conditions; terminal session, feedback, and facts resist update/delete |
| Safety | One early-finish event per session/type; source/link/actor consistency; one controlled feedback enrichment path |
| Corrections | Insert-only contiguous revisions; effective-set validation; report invalidation/recalculation follows correction commit |
| AI | Request/proposal/application student, purpose, status, and draft lineage; immutable validated provenance; duplicate nonterminal request prevention |
| Reports | Metric identity/values freeze immediately after insertion; same-student/period/timezone revision chain; contiguous revisions; no cycles; terminal rows wholly immutable |
| Measurements | Append-only rows; same-student replacement with reason; no direct mutation, branching, self-reference, or cycles |
| Audit | Explicit membership/system/worker actor type; append-only rows; no sensitive free-text copies |

## 5. Phase 1 Contract

Phase 1 should implement only foundation, authentication, and coaching profiles:

- workspace, user, membership, trainer/student profile, invitation, and automatic owner assignment;
- membership-bound opaque sessions, CSRF, password reset, and admin MFA;
- explicit secure delivery for invitation/reset links;
- readiness revisions, constraints, activities, measurements, and trainer notes;
- strict role-specific Zod contracts and authorization-aware queries;
- audit events, stable errors, request IDs, CI, local PostgreSQL, and fresh migration/health verification;
- responsive trainer/student application shells.

The full target Prisma file must not be applied as one initial migration. Phase 1 migrations include only Phase 1 tables and invariants. Exercise, planning, execution, analytics, AI, and report tables arrive with their roadmap phases.

## 6. Mandatory Phase 1 Tests

- Cross-organization and cross-student reads/writes fail without revealing resource existence.
- A session is unusable immediately after membership disablement or revocation.
- Session user, membership, and organization lineage cannot be mixed at the database layer.
- Student DTOs cannot write readiness, trainer notes, assignments, roles, or future plan fields.
- Profile, activity, and constraint changes invalidate readiness and increment the planning revision.
- Invitation acceptance is race-safe, single-use, and binds the intended profile/account.
- Body-weight replacement rejects direct mutation, cross-student links, branches, self-reference, and cycles.
- Login, logout, reset, MFA, invitation, and onboarding flows pass at supported mobile and desktop sizes.
- Sensitive values do not enter logs or audit diffs.
- A fresh database accepts the Phase 1 migrations, seed, and integration path; production backup/restore objectives remain a later release gate.

## 7. Deferred Gates

These decisions do not block local Phase 1 implementation after the four approvals in section 1, but they remain hard gates:

- Before real wellness data or beta: launch jurisdiction, minimum age, guardian consent, lawful processing basis, retention, privacy-rights workflow, and reviewed safety language.
- Before Phase 7: AI provider/model, data-processing terms, retention behavior, evaluation threshold, and cost/timeout budgets.
- Before Phase 8 notifications: delivery guarantees and whether a transactional outbox is justified.
- Before production: full service-level objectives, restore exercise, incident ownership, accessibility/security testing, export/erasure flow, and monitoring/rollback.

## 8. Verification Evidence

The target schema validates with:

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/machi_gym" npx --yes prisma@6.16.2 validate --schema "docs/prisma/schema.prisma"
```

Result: `The schema at docs/prisma/schema.prisma is valid`.

Validation proves Prisma syntax and relation shape only. It does not prove the PostgreSQL constraints listed in section 4; those become executable migration and integration-test requirements during their owning phases.

## 9. Start Decision

Phase 1 may begin. Genuine contradictions found during implementation require a documented, smallest-compatible correction to the relevant architecture document; material product behavior changes still require product-owner approval.
