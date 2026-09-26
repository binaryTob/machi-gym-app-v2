# Product Requirements Document

**Estado:** Documento de visión/requisitos; para implementación actual ver [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md). Partes futuras siguen sin implementar.

**Producto:** Machi Gym (repositorio `machi-gym-app-v2`).

**Mercado inicial:** entrenadores personales independientes; los equipos son una posibilidad posterior, no una funcionalidad actual.
Initial interface language: Spanish, with localization-ready copy

## 1. Product Summary

Machi Gym helps trainers prescribe training, supervise real execution, detect actionable trends, and prepare safer future workouts. Students get a focused mobile experience for completing the workout in front of them, recording what actually happened, and reporting recovery or discomfort with minimal friction.

This is not an administrative CRUD product. Its central value is a trustworthy feedback loop between planned training and actual performance.

## 2. Problem

Trainers commonly distribute routines through chat, spreadsheets, or static documents. These tools separate the prescription from actual set performance and post-workout feedback. The trainer therefore has to reconstruct adherence, progression, fatigue, and pain signals manually. Students lose previous-performance context during the workout and may confuse suggested loads with their real historical performance.

Machi Gym must create one reliable record of:

- what the trainer approved;
- what was scheduled;
- what the student actually performed;
- how the student felt;
- which metrics were calculated from those facts; and
- what an AI assistant proposed for trainer review.

## 3. Goals

### Product goals

- Let a trainer create and maintain a complete student training profile.
- Let a trainer build, review, approve, schedule, and revise training plans.
- Let a student execute a workout quickly from a phone and log each actual set.
- Show the previous performance for the same exercise without leaving execution.
- Capture structured session effort, recovery, partial-completion reasons, and discomfort.
- Calculate explainable adherence, volume, load, strength, duration, body-weight, and discomfort trends.
- Surface actionable student state on the trainer dashboard.
- Use AI to produce constrained, explainable proposals without granting it authority over plans or history.
- Preserve a clear audit trail for safety-sensitive and plan-changing actions.

### Engineering goals

- Strong domain boundaries and typed contracts.
- Backend-enforced role and ownership rules.
- Immutable finalized workout history and immutable approved plan versions.
- Deterministic metrics with documented formulas.
- Provider-independent AI integration with strict runtime validation.
- Testable phases and a modular monolith that can evolve without premature distributed systems.

## 4. Non-goals for Initial Release

- Medical diagnosis, rehabilitation prescription, or clinical decision support.
- Autonomous plan activation or unsupervised AI adaptation.
- Meal planning, calorie tracking, payments, public social feeds, or gym access control.
- Live wearable integration or automatic sensor ingestion.
- Real-time trainer observation through video.
- A marketplace of trainers or public exercise media scraping.
- n8n as a required runtime dependency.
- Native iOS or Android applications; the first client is a responsive web application.

## 5. Users and Roles

### Organization Admin

An organization admin manages the coaching workspace. At launch, each workspace has one trainer-owner who is both admin and trainer. Team management and additional trainer accounts are deferred.

Admin capabilities:

- manage the workspace and student accounts;
- access all students in the organization;
- perform all trainer capabilities;
- manage the organization exercise library and media metadata;
- review audit and AI-generation records;
- configure organization-level settings.

### Trainer

A trainer coaches assigned students.

Trainer capabilities:

- create student invitations and student profiles;
- edit assigned student profiles and constraints;
- record trainer-only notes;
- review assigned student history, feedback, trends, and safety signals;
- create and edit draft plans;
- request AI-assisted proposals;
- accept a proposal into a draft, edit it, publish a plan version, and schedule workouts;
- manage organization exercises when acting as the trainer-owner;
- correct data only through an auditable correction workflow, not silent historical mutation.

### Student

A student can access only their own information and assigned training.

Student capabilities:

- view their profile, scheduled workouts, history, and statistics;
- start an assigned workout;
- record actual load, repetitions, RIR or RPE, and completion state per set while the session is in progress;
- view previous performance and technique media inline;
- finish a complete or partial workout;
- cancel an in-progress workout with a reason;
- submit structured post-workout feedback and discomfort reports.
- create factual self-declarations for limitations, injuries, recurring discomfort, and external activities; trainer review is still required before planning.

Student prohibitions, enforced by the API:

- cannot create, edit, approve, activate, or delete a training plan;
- cannot change exercise order, prescription, target sets, target repetitions, rest, or notes;
- cannot substitute exercises in the initial release;
- cannot edit actual performance after the session is finalized;
- cannot alter another student's data;
- cannot approve, reject, or modify AI proposals;
- cannot change calculated analytics.

## 6. Permission Matrix

`Assigned` significa una asignación entrenador-alumno activa en la misma organización. Esta matriz mezcla requisitos actuales y futuros; confirmar endpoints reales en `apps/api/src/openapi.ts` y el estado en [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

| Resource or action | Admin | Trainer | Student |
| --- | --- | --- | --- |
| Manage organization members | Owner only; teams deferred | No | No |
| View students | All in organization | Assigned only | Self only |
| Create/invite student | Yes | Yes | No |
| Edit student profile | All in organization | Assigned only | Own name, birth/age field, height, availability, activity, experience, goals, external activities, and new constraint declarations; never trainer notes or resolution state |
| View declared constraints | All in organization | Assigned only | Self only |
| Manage trainer-only notes | Yes | Assigned only | No |
| Manage exercise library | Yes, in organization | Yes, in organization | Read-only active catalog plus assigned historical references |
| Create/edit draft plan | Yes, reusable within organization | Yes, reusable within organization | No |
| Publish/retire plan version | Yes, within organization | Yes, within organization | No |
| View AI proposal | Yes | Currently assigned trainer only | No |
| Start workout | No | No | Own scheduled workout only |
| Log sets during workout | No | No | Own in-progress workout only |
| Finalize workout | No | No | Own in-progress workout only |
| Edit finalized history | Audited correction only | Audited correction request/workflow | No |
| Submit student feedback | No | No | Own finalized session within feedback window |
| View analytics | All in organization | Assigned only | Own curated analytics |
| View audit logs | Yes | Own relevant actions, limited | No |

## 7. Core Functional Requirements

### 7.1 Student profile

The persistent profile must support:

- display name and optional profile contact email; accepting an account invitation requires a unique login email;
- date of birth or age-at-assessment, with a product decision still required;
- height and current body weight;
- append-only historical body-weight measurements;
- intended sessions per week and available weekdays;
- approximate session duration;
- lifestyle/activity level;
- external sports and physical activities;
- training experience level;
- one primary training goal and optional secondary goals;
- declared limitations, injuries, and recurring discomfort as active constraints;
- trainer-only notes separated from student-visible fields.

A profile can be `INCOMPLETE` while an invitation is pending or required planning fields are missing. Readiness is calculated from required fields and explicit constraint review. A student may complete allowlisted factual fields during onboarding; a trainer confirms the profile as `READY` before plan approval or AI generation. Changes to goals, availability, experience, activity, or active constraints invalidate that confirmation until a trainer reviews again.

Constraints are declarations, not diagnoses. UI and generated text must use language such as “reported discomfort” and “declared injury,” never diagnostic conclusions.

### 7.2 Exercise library

An exercise is a reusable first-class entity, not text embedded in a workout. It must include a Spanish display name, unique organization-scoped slug, description, aliases for search, primary/secondary muscle groups, equipment, movement pattern, difficulty, instructions, common mistakes, caution notes, active state, and optional media. Future plans and AI proposals reference exercise IDs, never arbitrary movement names.

Each exercise declares a performance mode. The initial proposal supports `WEIGHT_REPS` and `REPS_ONLY`; unsupported movement types must not be forced into weight-based analytics. Weight-based exercises also define a load-entry convention and multiplier so “20 kg” is not ambiguously interpreted as per-hand, total, or machine-stack load.

Media records support GIF/image, thumbnail, and optional video. They include source, stable object/media reference, license, attribution, and verification status. New media is unpublished by default; publication requires verified licensing. Signed delivery URLs are resolved at read time and are never stored in historical snapshots. AI may reference only active exercises explicitly approved for AI use. Inactive exercises remain identifiable in historical snapshots but cannot be newly programmed.

Phase 2 initially serves only bundled project-original SVG illustrations and one original SVG animation. They are labeled as visual references, not instruction-quality technique demonstrations. GIF/video formats are modeled but their delivery awaits a verified upload/licensing workflow; arbitrary remote URLs are prohibited. Students may browse active organization exercises and verified media through a read-only catalog before workout projections exist.

### 7.3 Training plans

- A training plan is a reusable organization-owned program; it does not belong to one student. A separate assignment binds one student to one published version, with at most one active primary assignment per student.
- A plan has immutable numbered versions.
- A version remains editable while `DRAFT`.
- Publishing validates, freezes, and promotes a `DRAFT` directly to `ACTIVE`.
- Only one version of a plan can be `ACTIVE` at a time.
- At most one version can be `DRAFT`; version numbers are unique per plan and allocated transactionally.
- Revisions clone an active version into a new draft rather than mutating it.
- A discarded draft transitions to terminal `VOID` with actor, timestamp, and reason.
- A plan version contains ordered workout templates.
- A workout template contains ordered programmed exercises.
- Each programmed exercise references a same-organization canonical exercise ID and stores target sets, minimum and maximum repetitions, one intensity prescription mode, rest, notes, and an optional suggested load. It contains no performed values.
- Suggested load is guidance and never performance data.
- New assignments require an active published version. Existing assignments remain pinned to their source version even after a newer version publishes and retires it. Phase 4 scheduling uses the current assignment's immutable version (including a retired version that is still assigned); assignment replacement is explicit.
- Publishing a replacement affects future assignments only. Existing `NOT_STARTED` sessions (when Phase 4 exists) remain bound to their immutable source version by default and may be explicitly rescheduled or cancelled.

### 7.4 Workout scheduling and execution

- Trainer scheduling creates a `WorkoutSession` occurrence in `NOT_STARTED` state for a student and local date from the student's pinned assignment. It atomically seals every prescribed exercise and exact set-position snapshot at creation, before execution begins.
- Starting an available own occurrence changes it to `IN_PROGRESS` without duplicating snapshots; retrying start safely resumes the same session.
- The API chooses an in-progress, due, or next occurrence for the student home; no browser-only calendar inference or automatic completion is authoritative.
- The student can modify only actual fields on their own in-progress session.
- Each write supports safe retry and conflict detection.
- The student can always finish the session explicitly.
- If every required programmed set is completed, finishing produces `COMPLETED`.
- If any required set or exercise is incomplete, finishing produces `PARTIAL` and requires one quick structured reason; optional free text never blocks safe exit.
- Selecting discomfort/pain or feeling unwell during early finish atomically creates a minimal typed safety event even if the student skips the later feedback form. Location and intensity can be supplied immediately or enriched in feedback when applicable.
- Cancelling with zero completed sets produces `CANCELLED`; cancellation reason and actor are retained.
- A past-due, never-started occurrence may be explicitly marked `SKIPPED` by a trainer/admin; this is distinct from cancellation or a partial started workout. Browser abandonment never changes status.
- Once any set is `COMPLETED`, the session cannot be cancelled; ending it produces `PARTIAL` unless every required set is complete.
- Finalized sessions are read-only to students.
- A canonical exercise may appear at most once in a workout template. Previous exercise performance is returned in the start/resume payload and comes from the latest earlier `COMPLETED` or `PARTIAL` session for the same canonical exercise with at least one completed set and `finishedAt < currentSession.startedAt`, ordered by `finishedAt DESC, id DESC`.

Allowed session states:

```text
NOT_STARTED -> IN_PROGRESS -> COMPLETED
                           -> PARTIAL
                           -> CANCELLED
 NOT_STARTED ----------------> CANCELLED
 NOT_STARTED ----------------> SKIPPED  (trainer/admin, past due)
```

### 7.5 Feedback and discomfort (Phase 5 form; Phase 4 early fact)

Phase 4 records a canonical typed discomfort/feeling-unwell event as part of a partial finish. Phase 5 collects optional detailed feedback for 24 hours after `COMPLETED`/`PARTIAL`. Submission is one-shot and immutable; an exact retry returns the stored record. Missing feedback never invalidates the workout.

After `COMPLETED` or `PARTIAL`, collect:

- session RPE from 1 to 10;
- perceived state: `VERY_GOOD`, `GOOD`, `NORMAL`, `DIFFICULT`, or `VERY_DIFFICULT` (how the workout felt overall);
- recovery state: `VERY_RECOVERED`, `RECOVERED`, `NORMAL`, `TIRED`, or `VERY_TIRED` (how recovered the student felt before starting);
- explicit discomfort yes/no, with one relational report per reported body location when yes;
- intensity 1–10, optional same-session canonical exercise ID and note per location;
- optional general comments. The primary facts are typed columns/rows, not a JSON notes blob.

Structured values drive trends. Free text supplies context and must not be the sole source for a safety signal.

If `discomfortPresent` is true, at least one structured location/intensity report is required; otherwise none is accepted. The Phase 4 early-finish event remains immutable and is linked to the corresponding feedback report instead of counted twice. If its body region was already specified, that region must remain represented. An optional exercise must belong to this exact session. The student can choose “Ahora no” and return through history before the 24-hour deadline. Feedback does not diagnose an injury.

### 7.6 Analytics

All metrics are calculated from actual, finalized data. Suggested loads and incomplete drafts are excluded.

Required deterministic metrics:

- body-weight change between dated measurements;
- completed, partial, cancelled, and past-due not-started workouts;
- completion adherence and participation rate;
- external-load training volume by exercise and period;
- volume and load progression;
- estimated one-repetition maximum trend for suitable repetition ranges;
- average session RPE;
- elapsed workout duration;
- discomfort frequency and recurrence by body location.
- descriptive recovery-state trends from locked student self-reports, not a medical readiness score.

Metric definitions:

- `completion adherence = completed / eligible scheduled workouts`;
- `participation = (completed + partial) / eligible scheduled workouts`;
- eligibility uses the session's snapshotted IANA timezone; a `NOT_STARTED` session becomes past due when its local scheduled date is before the current local date, with no same-day penalty;
- trainer-, admin-, and system-cancelled sessions are excluded; student-cancelled and past-due `NOT_STARTED` sessions are included unless an assigned trainer/admin records an audited excuse;
- `normalized external load = actualLoadKg * snapshotted loadMultiplier` for compatible `WEIGHT_REPS` exercises;
- `external volume = sum(normalized external load * actual repetitions)` over completed sets;
- load progression is the period-over-period change in the maximum completed-set `actualLoadKg` for the same exercise and unchanged load-entry convention;
- estimated strength uses entered `actualLoadKg`, not the volume multiplier, and Epley for strength-compatible conventions and sets of 1 to 12 reps: `actualLoadKg * (1 + reps / 30)`;
- no estimated strength is shown for unsupported exercise/load types;
- recurring discomfort is `count(distinct workoutSessionId)` by normalized body region over a defined rolling window, initially 28 days; raw event count may be displayed separately.

Every metric must have a versioned contract defining source rows, eligible states, timezone/date attribution, grouping, formula, decimal rounding, zero-denominator/null behavior, and correction behavior. MVP calculations run directly from PostgreSQL through pure functions; no analytics event pipeline or cache is required.

### 7.7 Trainer dashboard

The default trainer view prioritizes action, not raw tables. Each student card or row should show:

- next or overdue workout;
- 28-day completion adherence;
- explicit per-exercise load, repetition, or estimated-strength change where the metric contract has sufficient compatible data;
- average recent session RPE;
- unresolved or recurring discomfort warnings;
- pending AI proposal or draft plan requiring review;
- last activity timestamp.

Warning thresholds must be deterministic and explainable. Example: “Right knee discomfort reported in 3 sessions in 28 days,” not “high injury risk.”

### 7.8 AI assistance

AI can suggest plan content and explain deterministic trends. It cannot query the database, choose its own context, activate plans, mutate history, mark execution complete, or diagnose a condition.

Every generated proposal must identify:

- the plan content;
- assumptions;
- constraints considered;
- warnings and unresolved information;
- a concise rationale per workout or exercise decision;
- the provider/model/prompt version used.

## 8. User Journeys

### Journey A: Trainer onboards a student

1. Trainer creates an invitation with name and contact method.
2. The system atomically assigns the trainer-owner to the new profile; multi-trainer reassignment is post-launch.
3. Student accepts and establishes credentials.
4. Trainer or student completes the training profile according to field permissions.
5. Trainer reviews goals, availability, external activity, and active constraints.
6. Trainer records private coaching notes.
7. System marks profile readiness and lists missing planning inputs.
8. No AI generation is allowed until required fields and constraint review are complete.

Success: the trainer sees a planning-ready profile, and the student can sign in without seeing administrative controls.

### Journey B: Trainer creates an AI-assisted plan

1. Trainer opens the student's plan area and requests a proposal.
2. Backend computes recent metrics and builds a minimized context snapshot.
3. A queue worker calls the configured provider through the AI gateway.
4. Output is parsed, schema-validated, checked against the exercise library, and evaluated by deterministic safety rules.
5. Trainer receives either a reviewable proposal or an actionable validation failure.
6. Trainer sees constraints, warnings, assumptions, and rationales next to the proposal.
7. Trainer accepts all or selected content into a draft plan version.
8. Trainer edits the draft manually.
9. Trainer publishes the version; this is the approval action and atomically retires the prior active version of that reusable plan.
10. Trainer explicitly assigns/replaces the student's pinned published version. Dated session scheduling remains a separate Phase 4 action.

Success: no generated content reaches the student before trainer approval.

### Journey C: Student completes a workout

1. Home emphasizes today's workout and one primary “Start workout” action.
2. Student starts; the server atomically snapshots the prescription and enters `IN_PROGRESS`.
3. The active exercise shows prescription, previous finalized performance, technique media, and set inputs.
4. Student records actual load and repetitions per set, optionally RIR/RPE according to the plan.
5. Changes auto-save with visible saved, saving, offline, and conflict states.
6. Student moves through exercises with large touch targets and optional rest timer.
7. Student taps “Finish workout.”
8. Server determines `COMPLETED` or `PARTIAL`; partial flow offers a reason.
9. Student submits structured feedback and any discomfort report.
10. Home and progress views update from actual data.

Success: the student never leaves the workout to see previous performance or instructions.

### Journey D: Student ends early due to discomfort

1. Student taps “Finish workout” before all sets are complete.
2. Confirmation clearly states that the session will be saved as partial.
3. Student selects “discomfort or pain” and can add location/intensity.
4. Session is finalized as `PARTIAL`; performed sets remain authoritative.
5. Trainer dashboard receives an explainable warning.
6. Future AI context includes the structured event, but AI does not diagnose or autonomously alter the active plan.

Success: stopping is safe and low-friction; the UI never pressures the student to complete through pain.

### Journey E: Trainer reviews monthly progress

1. Trainer selects a student and month comparison.
2. Backend calculates versioned metrics from finalized records.
3. UI presents source values, deltas, and links to supporting sessions.
4. Optional AI summary returns prose templates with metric-key placeholders; application code inserts only supplied deterministic values.
5. Trainer can regenerate the narrative but not the source metrics.

Success: every narrative claim can be traced to a displayed metric.

## 9. Success Measures

Initial product metrics:

- at least 90% of started workouts reach a finalized state;
- median set logging interaction under 10 seconds once a workout is loaded;
- at least 80% of finalized sessions receive structured feedback;
- no unauthorized cross-student access in automated authorization tests;
- 100% of AI-created plan content is reviewed through a trainer publish action before becoming student-visible;
- 100% of monthly summary numeric claims originate from the deterministic metrics payload;
- less than 1% failed or conflicting set-save operations under normal network conditions;
- student workout flow meets WCAG 2.2 AA for applicable controls and contrast.

## 10. Release Criteria

The first production release is ready only when:

- all role and object-level authorization scenarios have integration coverage;
- workout start, resume, set logging, partial finish, cancellation, feedback, and history pass Playwright tests on mobile and desktop viewports;
- active plan versions and finalized sessions reject prohibited mutation paths;
- analytics formulas have fixture-based tests;
- AI provider failure does not block manual plan creation or workout execution;
- exercise media shown in production has verified licensing metadata;
- backup, restore, audit, retention, and incident procedures are documented and tested.
