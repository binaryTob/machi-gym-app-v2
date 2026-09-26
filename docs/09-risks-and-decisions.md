# Risks, Ambiguities, and Approval Decisions

The product owner approved documents 01-10 as the Phase 1 architectural baseline. Later legal/privacy and AI decisions remain phase-specific gates.

## Review Disposition

| Decisions | Status | Gate |
| --- | --- | --- |
| D1-D3, D5-D10, D13-D14, D16 | `APPROVED` | Phase 1 baseline |
| D4 | `APPROVED` | Optional canonical `birthDate`; calculate age, never persist calculated age |
| D15 | `APPROVED` | Repository `machi-gym-app-v2`, package scope `@machi-gym`, user-facing product `Machi Gym` |
| D18 Phase 1 targets | `APPROVED` | Functional/security/quality criteria and local CRUD target in document 10 |
| D12, D17 | `OPEN` | Resolve before real wellness data or beta users are admitted |
| D11 | `DEFERRED_GATE` | Resolve before Phase 7 AI implementation, not before the manual loop |

Later gates must not silently inherit recommendation text as approval.

## 1. Blocking Approval Decisions

### D1. Tenancy model

Question: Is launch strictly one trainer, or can a coaching team share students?

Recommendation: keep `Organization` as a shallow data boundary, but launch with exactly one trainer-owner workspace. Defer teams, organization switching, trainer invitations, and granular permissions.

Why: tenant scope is expensive to retrofit, but team SaaS is not required to prove the coaching loop.

### D2. Admin and trainer roles

Question: Are `ADMIN` and `TRAINER` distinct permissions or one role?

Recommendation: retain distinct role enums for authorization clarity. The launch owner has one `ADMIN` membership plus a trainer profile, and `ADMIN` inherits trainer capabilities. Do not build team-role management UI yet.

Why: team membership, audit access, and cross-student visibility differ materially from coaching an assigned student.

### D3. Student creation and account onboarding

Question: Can a trainer create a student profile before the student has an account?

Recommendation: yes. Create an organization-scoped student profile, then attach it to a student membership when the invitation is accepted.

Why: coaches need to prepare profiles/plans before onboarding, and fake credentials should not be generated.

### D4. Age representation

Question: store birth date, current age, or age-at-assessment?

Recommendation: store birth date only if required for the product/jurisdiction; otherwise store `ageAtAssessment` plus assessment date. Never store mutable “current age” without provenance.

Why: birth date is more sensitive; a plain age becomes stale.

Approved: retain nullable `birthDate`, compute age at read time when needed, never persist mutable/calculated age.

### D5. Scheduling semantics

Question: Does a trainer schedule exact dates manually, or should approved templates recur automatically?

Decisión implementada: programación explícita de sesiones fechadas a partir de la versión asignada. No existe motor de recurrencias ni calendario automático; las plantillas no se atan a días fijos.

Why: adherence needs a real denominator, but recurrence exceptions, timezones, plan changes, and rescheduling add substantial policy complexity.

### D6. RIR and RPE policy

Question: can one programmed exercise and performed set contain both RIR and RPE?

Recommendation: one intensity mode per programmed exercise: `RIR`, `RPE`, or `NONE`; performed sets collect only the selected mode.

Why: it reduces entry friction and avoids analytics that compare two overlapping subjective values without a clear purpose.

### D7. Finalized workout corrections

Question: can trainers edit historical actual performance?

Recommendation: no direct mutation. Preserve finalized `SetPerformance`; append a typed full replacement snapshot with monotonic revision, actor, reason, and timestamp. Reads use the latest correction revision or the original.

Why: typos need a remedy, but silent edits undermine statistics and trust.

The Prisma draft models this typed correction ledger, but Phase 1 does not migrate it; it ships with Phase 6.

### D8. Cancellation and adherence

Question: which cancelled sessions count against adherence?

Recommendation: trainer/admin/system cancellations are excluded. Student cancellations and past-due `NOT_STARTED` sessions count unless an assigned trainer/admin records an audited excuse. A session becomes past due after its scheduled local date ends in the session's snapshotted timezone; the current local date is not yet past due.

Why: the denominator must reflect opportunity while not penalizing schedule changes outside the student's control.

### D9. Units

Question: metric only or user-selectable kilograms/pounds?

Recommendation: persist kilograms, support organization/student display preference, and convert only at API/UI boundaries with explicit rounding.

Why: one storage unit keeps calculations deterministic and still supports international users.

### D10. Offline behavior

Question: must full workout execution work without connectivity at launch?

Recommendation: Phase 4 provides resilient retry and local pending-edit recovery, not guaranteed full offline start/finalization. Evaluate a service-worker/offline specification after field testing.

Why: silent conflict and false “saved” states are more dangerous than a clearly limited offline mode.

### D11. AI provider and data handling

Question: which provider/model and retention terms are acceptable?

Recommendation: decide only after a privacy/vendor review and fixture evaluation. Keep the port provider-neutral and require no-training/limited-retention terms where available.

Why: provider selection is an operational/configuration decision; domain schemas must not depend on it.

### D12. Wellness data retention and jurisdiction

Question: where will the product launch, and how long should wellness/history/AI data be retained?

Recommendation: select launch jurisdiction before beta and obtain legal/privacy review. Proposed placeholders are 24 months after inactivity for coaching/audit data and 30 days for raw AI artifacts.

Why: retention and user rights cannot be safely inferred from technical preferences.

### D13. Feedback deadline

Question: how long after a session can the student submit feedback?

Recommendation: 24 hours and one immutable submission in v1. A later correction workflow requires a separate typed revision design; support/audit notes must not rewrite the submitted feedback.

Why: feedback remains contemporaneous while accidental omissions can still be resolved.

### D14. Product language

Question: Spanish-only launch or multilingual launch?

Approved for launch: Spanish UI with all browser-facing copy routed through localization keys. The Phase 1 hardening and Phase 2 catalog implement this in `apps/web/lib/i18n.ts`; additional languages can be added without changing page components.

Why: it keeps initial content quality high without hard-coding a future migration.

### D15. Repository name

Question: the requested directory is `machi-gym-v2`, but the available empty workspace is `machi-gym-app-v2`. Which name is canonical?

Approved: `machi-gym-app-v2` is canonical; packages use `@machi-gym/*`. Branding is `Machi Gym` without `v2`.

### D16. Exercise performance modes

Question: must the first release track timed, distance, assisted, and bodyweight movements, or only repetition-based strength work?

Recommendation: support `WEIGHT_REPS` and `REPS_ONLY` in the first release. Exclude unsupported modes from volume/estimated-strength metrics and add time/distance modes only with dedicated prescriptions, set fields, and formulas.

Why: pretending one weight/repetition shape fits cardio and assisted movements creates false analytics.

### D17. Minimum age, guardian consent, and processing basis

Question: can minors use the product, and what legal basis permits storage/provider processing of wellness data in the launch jurisdiction?

Recommendation: block minor onboarding until jurisdiction-specific guardian/consent flows are designed. Obtain legal/privacy review before real wellness data or external AI processing.

Why: birth date, declared injuries, and discomfort may trigger obligations that architecture alone cannot decide.

### D18. Service levels and supported environments

Question: what measurable targets define each release gate?

Approved for Phase 1: functional trainer/student path, backend RBAC and negative tests, strict TypeScript, passing lint/typecheck/tests/Prisma validation, documented successful startup, and a reproducible trainer-login → create/retrieve student → student-login → authorization-boundary path. Standard local CRUD API calls should generally complete under 500 ms excluding external dependencies; this is a development target, not a production SLA. Do not introduce caching/distributed infrastructure to meet it. Production RPO/RTO, browser matrix, and AI timeout remain later release gates.

Why: “fast” and “recoverable” cannot be tested until numbers exist.

## 2. Product and Safety Risks

### Phase 2 decision: exercise ownership

**B: organization-owned canonical exercises.** The approved data boundary, workspace-specific trainer editing, and cross-tenant isolation are a strong reason not to make trainer-edited records global. A shared editable record would allow one trainer to alter another organization's instructions, caution notes, or media. Each workspace has canonical exercise IDs unique within that organization; future plans and AI must reference those IDs, not free-text names. A small curated, versioned seed definition creates independent records for new workspaces. A truly global read-only curated library with separate tenant customizations would require a later explicit product/authorization design; it is not part of Phase 2.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Users interpret AI guidance as medical advice | Safety and liability | Non-diagnostic language, hard constraints, trainer review, disclaimers, no treatment claims |
| Trainer overlooks a discomfort warning | Student safety | Action queue, deterministic thresholds, source drill-down, acknowledgement workflow considered later |
| Partial workout UX pressures completion | Unsafe behavior and bad data | Always-visible finish action, neutral language, preserve completed work |
| Suggested load confused with actual load | Corrupt statistics and unsafe progression | Separate fields, visual hierarchy, actual-only calculations, tests |
| Adherence metric feels punitive or misleading | Loss of trust | Publish formula, separate completion and participation, excused cancellation policy |
| Exercise media is unlicensed | Legal/takedown risk | First-class license metadata and verification gate |
| Free text becomes the only safety signal | Trends are missed | Structured discomfort fields required when discomfort is reported |
| Student profile is incomplete or stale | Poor plan quality | Readiness checks, last-reviewed timestamps, trainer confirmation before generation |

## 3. Engineering Risks

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Plan/template/session concepts drift together | Irreliable history | Explicit aggregates and naming; no `Routine` catch-all |
| Multi-tenant query misses a scope predicate | Data breach | Authorization-aware scoped queries, database lineage constraints, negative tests |
| Autosave races across devices | Lost set data | Per-set versions, conflict UX, no last-write-wins concealment |
| Finalization and set saves race | Inconsistent terminal data | Transaction/locking and state predicate updates |
| Redis loses jobs | Stuck proposals/reports | Database request state plus reconciliation job; Redis not source of truth |
| AI output passes syntax but violates intent | Unsafe plan draft | Layered deterministic validation, warnings, trainer review, eval fixtures |
| Analytics formulas change silently | Incomparable reports | Metric definition version and golden fixtures |
| Timezone/date boundaries skew adherence | Wrong schedule/report | Store timezone and local schedule date; period tests around DST/months |
| PostgreSQL cascade deletes erase history | Data loss | Restrictive foreign keys/archival; dedicated erasure workflow |
| Shared contracts become persistence DTOs | Tight coupling/data leaks | Explicit response projections; never export Prisma models to UI |
| Overbuilt architecture delays core flow | Product delay | Modular monolith, manual loop before AI, phase gates |

## 4. Schema Review Notes

The proposed Prisma schema is a reviewed target model. Initial migrations contain only the current roadmap phase. Before implementation:

- choose `cuid()` versus UUIDv7 and use one standard;
- confirm Prisma/PostgreSQL support for enum arrays in the selected versions;
- decide whether muscle/equipment taxonomy needs database entities rather than enums;
- decide birth date versus age-at-assessment;
- keep v1 exercises organization-owned; copy curated seed records into each workspace instead of a polymorphic global scope;
- add database check constraints through SQL migrations for ranges and mutually exclusive fields because Prisma schema alone cannot express all invariants;
- add composite organization foreign keys, lineage triggers for cross-parent ownership, immutability triggers, lifecycle checks, and partial unique indexes for active session/assignment invariants;
- review delete actions model by model against the retention policy;
- validate indexes with representative query plans, not intuition alone.

## 5. Legacy Repository Findings Applied

Useful legacy concepts retained:

- student training context;
- ordered programmed exercises;
- actual load/repetition/RPE capture;
- recent historical context;
- asynchronous generation visibility and integration tracing.

Legacy choices rejected:

- `Routine` as both plan and workout;
- exercise name embedded as the catalog identity;
- one exercise-level log instead of performed sets;
- reports linked only to student instead of session;
- mutable history-window field;
- client-supplied identity as authorization;
- n8n as the generation authority;
- unrestricted string statuses and aspirational tests.

## 6. Approval Checklist

The product owner approved Phase 1 implementation and resolved D4, D15, D18 Phase 1 targets, and the planning baseline.

Later hard gates remain explicit:

- [ ] D12 and D17 jurisdiction, retention, minimum-age, guardian-consent, and processing basis before real wellness data/beta
- [ ] D11 provider and privacy review before Phase 7
- [ ] remaining production service-level targets before Phase 9 exit

Phase 1 implementation is authorized. Later-phase decisions do not block local implementation of the manual loop, but they do block the phase named above.
