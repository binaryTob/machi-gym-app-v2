# Phase 4: Scheduled Workouts and Actual Execution

## Scheduling and identity

`WorkoutSession` is both the **scheduled occurrence** and its execution parent. An extra one-to-one occurrence/session table would add no independent lifecycle in this release. A trainer explicitly schedules a dated `WorkoutTemplate` from a student's current `StudentPlanAssignment`. Template order is not a fixed weekday; the student's `availableDays` can be shown as scheduling guidance without rejecting an exception. The API, not the browser, selects an in-progress workout first, then the oldest due `NOT_STARTED` workout, then the next future one for the student home screen. `NOT_STARTED` means scheduled; it becomes startable on its local scheduled date. The API stores that date and the student's IANA timezone (falling back to the organization timezone). No recurrence engine or automatic session creation runs in Phase 4.

At **scheduling**, in one transaction, create the `WorkoutSession`, every `SessionExercise` prescription snapshot, and its exact numbered `SetPerformance` placeholders. Keep organization, student, assignment, plan version, template, programmed-exercise and canonical exercise references. Snapshot exercise display/technique/caution and all prescribed sets/reps/intensity/rest/notes/load-convention/suggested-load fields. An occurrence remains explainable when a catalog entry changes, a plan version retires, or the student later receives a different assignment. Previously scheduled sessions remain executable after assignment replacement unless a trainer explicitly cancels them. Future performed values are never copied from suggested load.

A trainer supplies a scoped schedule request key. Repeating the same command with the same student, assignment, template and local date returns the existing occurrence; reusing a key for different content conflicts. One student may have at most one `IN_PROGRESS` session, enforced in PostgreSQL. Scheduling another dated occurrence is allowed, but its start must wait for the in-progress session to finish.

## Lifecycle and progress

```text
NOT_STARTED -> IN_PROGRESS -> COMPLETED
                           -> PARTIAL
                           -> CANCELLED  (only when no set is complete)
NOT_STARTED ----------------> CANCELLED
NOT_STARTED ----------------> SKIPPED    (trainer/admin, past-due only)
```

- `NOT_STARTED`: scheduled but never performed; due when local date is today or earlier. Merely leaving a browser open does not change its status.
- `IN_PROGRESS`: the owning student started it; it stays resumable across reloads and interruption.
- `COMPLETED`: the student explicitly finishes with **every** prescribed set position complete.
- `PARTIAL`: the student explicitly finishes a started workout with missing sets. A quick structured reason is required: `LACK_OF_TIME`, `FATIGUE`, `DISCOMFORT_OR_PAIN` (the UX label is “Molestia”), `FEELING_UNWELL`, or `OTHER`. Free-text detail and discomfort location/intensity are optional so stopping is low-friction. Partial is valid training history, including when no sets were completed.
- `CANCELLED`: explicit student or trainer/admin cancellation with actor/reason and zero completed sets. This is distinct from a started workout ended early after work was performed.
- `SKIPPED`: explicit trainer/admin declaration that a past-due never-started occurrence was not performed. No background timer marks it skipped.

Completed exercise count derives from exercises whose **every** prescribed set is complete. Total progress derives only from server-persisted completed set rows, not navigation or typed-but-unconfirmed inputs. Terminal sessions are immutable to students; a later trainer correction ledger belongs to a separate phase.

## Writes, retries, and history

Starting is idempotent for the same in-progress occurrence and atomically sets `startedAt`/status. The student can save draft values without completing a set or explicitly mark a set complete. Only `SetPerformance` stores actual kilograms, repetitions and optional matching RIR/RPE. Completed sets can be corrected by that student **only while the session is in progress**. Per-set optimistic versions reject stale conflicting edits; an exact immediate retry may return the already persisted row. Starting, saving, finishing, and cancelling all lock the same parent session row before checking state. Finishing is retry-safe for the same terminal result/reason and never duplicates sets or safety events.

If a partial finish selects discomfort or feeling unwell, insert one canonical `SessionSafetyEvent` in the finish transaction, even when detailed feedback is skipped. El feedback estructurado ya implementado (ver [decisiones de feedback](14-phase5-feedback-decisions.md)) enlaza un detalle relacional al evento temprano **sin editarlo**; el plazo es de 24 horas. No implicit partial completion is caused by network failure or abandonment.

Previous performance is the latest earlier `COMPLETED`/`PARTIAL` occurrence for the **same organization, student and canonical exercise ID** with at least one completed set and `finishedAt < current.startedAt`, ordered by `finishedAt DESC, id DESC`. Return actual completed sets as part of the start/resume detail projection in one batched database query. Do not read suggested load, another student's sets, or a later workout. Published catalog snapshots preserve the exercise name if its canonical record is deactivated; currently licensed media can be shown inside a technique overlay.

## Rest and extension points

The rest timer is a browser-only deadline and optional paused remaining duration scoped to a session. Save it in local storage so a reload can resume or explicitly reset the display; never send second-by-second ticks to PostgreSQL. Timer failure cannot change completion state.

`SessionExercise.performanceModeSnapshot` drives mode-specific actual-set validation. `WEIGHT_REPS` and `REPS_ONLY` are the only Phase 4 capture modes. A future `TIME`/`DISTANCE`/`CALORIES` mode adds dedicated typed actual fields or a mode-specific child record to the same `WorkoutSession → SessionExercise → SetPerformance` hierarchy, with its own checks and UI. Do not put arbitrary JSON metrics into actual strength-set rows or pretend timed exercises are repetitions.

## Authorization and integrity

Student reads/start/set writes/finish are scoped to their own profile and organization; the client cannot change exercise, order, target fields, assignment, source version or trainer notes. Trainers/Admins schedule and inspect only own-organization, currently assigned student records. There is no cross-tenant projection. PostgreSQL migrations enforce composite parent keys, parent/session/template/assignment lineage, snapshot immutability, exact contiguous set numbers, numeric ranges/modes, legal transitions, single active student session, and immutable terminal facts. Failed writes keep previously acknowledged sets intact.
