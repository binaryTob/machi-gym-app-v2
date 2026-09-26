# Phase 3: Reusable Plans, Prescriptions, and Assignments

The product-owner Phase 3 specification supersedes the earlier assumption that a student owns one long-lived plan identity. This is a deliberate product-model change: **a plan is an organization-owned reusable program, and an assignment determines the student who receives one immutable published version.** Each student still has at most one active primary assignment at a time. An unassigned plan is a reusable template; duplicating it creates another independent draft.

## Aggregate boundaries

- `Exercise` describes a canonical, organization-owned movement. An exercise entry in a template must have a same-organization foreign key to that ID. A name is never accepted as a substitute for the ID.
- `TrainingPlan` is the reusable library identity with creator, name, description, goal, `DRAFT / ACTIVE / ARCHIVED`, metadata version, and archive timestamp. It does not belong to any one student.
- `TrainingPlanVersion` owns the prescribed program: title/goal/description, ordered `WorkoutTemplate` rows, and ordered `ProgrammedExercise` rows. At most one draft and one active version of a plan exist. A draft can be published directly; publishing retires the prior active version. A discarded draft can be voided. Published and voided versions and their children are immutable.
- `WorkoutTemplate` is one ordered workout in a version, with an optional freeform day label and estimated duration. Day labels are not calendar dates or mandatory weekdays.
- `ProgrammedExercise` holds `exerciseId`, order, set/repetition targets, one `RIR / RPE / NONE` intensity mode, rest, optional suggested load, and trainer notes. It contains no actual/performed data. Publishing captures catalog display, caution, technique, load-convention and exercise-version snapshots while retaining the canonical exercise foreign key.
- `StudentPlanAssignment` identifies student, plan, published version, trainer, start date, optional end date, and whether it is the current primary assignment. Replacing an assignment atomically deactivates the old row and inserts a new one. Prior rows are retained; there is no direct mutation of their plan-version provenance.

## Versioning and history

The plan's numeric `version` protects identity metadata edits. The version aggregate has its own optimistic draft revision; every template, exercise, reorder, duplicate, or publish command compares and increments that revision inside a transaction. Structural changes to an active program require creating a new draft version rather than editing published rows. A replacement publish **does not silently reassign students**. Their active assignment remains pinned to the previously published version (now retired) until the trainer explicitly replaces that assignment. Retired versions remain viewable by already-assigned students; they cannot receive new assignments.

Phase 4 creates a separate `WorkoutSession` and copies prescribed values from the assignment's immutable version into sealed occurrence snapshots **at scheduling**, before any set can be performed. Actual set values are stored only in execution records; `suggestedLoadKg` never becomes performed weight. Phase 3 itself introduced no session, actual-set, AI, or analytics tables.

## Lifecycle rules

1. A new plan has a `DRAFT` identity and a numbered `DRAFT` version. The trainer can edit only that draft.
2. Publish validates a non-empty program, active catalog exercises, profile-independent prescription limits, exact catalog snapshots, and unique ordering. In one transaction it freezes the draft, retires the prior active version if any, and changes plan status to `ACTIVE`.
3. Revisions clone a published version to the next numbered draft; no concurrent drafts. To discard a draft, void it with a reason.
4. Archive stops new editing and assignments, retires an active version, and requires **no active student assignments**. Replace/deactivate assignments first. A never-published `DRAFT` plan may also be archived after its unfinished version is explicitly voided. No normal hard-delete command exists for plans or published history.
5. Assignments are immediate: `startDate` is today or earlier in the organization's timezone; `endDate`, when present, is a recorded program target, not an automatic deactivation. An explicit trainer replacement/deactivation determines the current primary assignment. The database enforces at most one active assignment per organization/student.
6. Trainer/Admin may manage plans in their organization. Assignments require Admin or an active trainer-student relationship. Students may only request their own active assignment's published-version projection and cannot write any plan, template, exercise, or assignment field.

Database migrations must enforce composite tenant foreign keys, assignment-to-version plan lineage, unique active assignment/draft/active version, numeric ranges and mode-specific prescription fields, allowed transitions, and non-draft immutability. Service checks alone are insufficient. This decision updates documents 01-04, 08-10, and the proposed Prisma target; it is not an implementation of scheduling or workout execution.
