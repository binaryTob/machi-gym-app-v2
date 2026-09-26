# API Architecture

## 1. Style and Conventions

- REST over HTTPS under `/api/v1`.
- JSON request and response bodies.
- Lower camel case fields and opaque string IDs.
- UTC ISO 8601 instants; local schedule dates use `YYYY-MM-DD` plus an IANA timezone in context.
- Cursor pagination for growing lists; bounded page size, default 25 and maximum 100.
- Commands use explicit action endpoints when the operation is a domain transition rather than a partial field update.
- OpenAPI is generated and checked in CI.
- Browser authentication uses secure HTTP-only cookies behind a same-origin edge; non-browser clients can be added later with scoped tokens.

## 2. Standard Response Shapes

Single resource:

```json
{
  "data": {
    "id": "...",
    "version": 3
  },
  "meta": {
    "requestId": "..."
  }
}
```

Collection:

```json
{
  "data": [],
  "page": {
    "nextCursor": null,
    "hasMore": false
  },
  "meta": {
    "requestId": "..."
  }
}
```

Error uses RFC 9457-style problem details:

```json
{
  "type": "https://machi.gym/problems/version-conflict",
  "title": "The workout changed on another device",
  "status": 409,
  "code": "WORKOUT_VERSION_CONFLICT",
  "detail": "Refresh the workout before saving this set.",
  "instance": "/api/v1/workout-sessions/ws_123/sets/set_2",
  "requestId": "req_123",
  "errors": []
}
```

Stable error codes are part of the contract. Stack traces and provider errors are never returned.

## 3. Authentication and Current Context

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/auth/login` | Establish opaque server-side session cookie |
| `POST` | `/auth/logout` | Revoke current session and clear cookie |
| `POST` | `/auth/forgot-password` | Request reset without account enumeration |
| `POST` | `/auth/reset-password` | Consume single-use reset token |
| `GET` | `/me` | Current user, launch workspace, role |

CSRF protection is required for cookie-authenticated mutations. Every protected request resolves the current opaque session and checks current user, membership, and assignment state, so account/membership revocation takes effect immediately. The organization comes from the verified membership, never a client field. Launch permits one active workspace membership per user, so login binds that sole membership deterministically; multi-workspace selection/switching requires a later design and removal of that database restriction.

## 4. Organization, Trainer, and Student Resources

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `POST` | `/student-invitations` | Admin/Trainer | Creates invitation/profile; trainer request atomically creates active self-assignment |
| `POST` | `/auth/accept-invitation` | Public with valid token in validated body | Atomically creates user, student membership, and links profile; avoids token in URL path/server access logs |
| `POST` | `/student-invitations/:invitationId/revoke` | Admin/inviting Trainer | Revokes pending invitation |

Phase 1 returns a one-time invitation token only to the authenticated trainer for manual secure delivery. A trainer can likewise issue a one-time reset token with `POST /students/:studentId/reset-link`; the public forgot-password endpoint never reveals account existence. Automatic email delivery and invitation revocation UI are not part of the Phase 1 functional acceptance path.
| `GET` | `/students` | Admin/Trainer | Admin all; trainer assigned only; filters and cursor |
| `GET` | `/students/:studentId` | Admin/assigned Trainer | Coaching summary projection |
| `PATCH` | `/students/:studentId/profile` | Admin/assigned Trainer | Profile fields only; version required |
| `POST` | `/students/:studentId/profile/confirm-ready` | Admin/assigned Trainer | Records reviewer/time after readiness validation |
| `GET` | `/students/:studentId/constraints` | Admin/assigned Trainer | Active/history according to permission |
| `POST` | `/students/:studentId/constraints` | Admin/assigned Trainer | Declared constraint; no diagnosis field |
| `PATCH` | `/students/:studentId/constraints/:constraintId` | Admin/assigned Trainer | Resolve/update with audit |
| `GET` | `/students/:studentId/weight-measurements` | Admin/assigned Trainer | Cursor list |
| `POST` | `/students/:studentId/weight-measurements` | Admin/assigned Trainer | Append measurement |
| `GET` | `/students/:studentId/notes` | Admin/assigned Trainer | Trainer-only |
| `POST` | `/students/:studentId/notes` | Admin/assigned Trainer | Trainer-only, excluded from AI by default |
| `GET` | `/student/me/profile` | Student | Own student-visible profile |
| `PATCH` | `/student/me/profile` | Student | Allowlisted factual onboarding fields; version required |
| `POST` | `/student/me/constraints` | Student | Creates own declaration; cannot resolve or alter trainer review state |
| `POST` | `/student/me/external-activities` | Student | Creates factual activity record and invalidates readiness |
| `PATCH` | `/student/me/external-activities/:activityId` | Student | Own activity only; invalidates readiness |
| `GET` | `/student/me/weight-measurements` | Student | Own measurements |
| `POST` | `/student/me/weight-measurements` | Student | Optional product policy; source marked self-reported |

All nested student endpoints perform an assignment-aware scoped query. A separate lookup followed by an unchecked update is forbidden. Student self-write, trainer profile-write, set update, and feedback use distinct strict schemas with unknown fields rejected.

## 5. Exercise Catalog

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/exercises` | Organization Trainer/Admin or Student | Cursor pagination (24), accent-insensitive name/alias search and optional muscle/equipment/pattern/difficulty filters; student sees only active records and verified media |
| `POST` | `/exercises` | Trainer/Admin | Creates organization-owned canonical exercise with structured taxonomy |
| `GET` | `/exercises/:exerciseId` | Organization Trainer/Admin or Student | Trainers may inspect inactive rows; students only active records and published technique references |
| `PATCH` | `/exercises/:exerciseId` | Trainer/Admin | Strict field allowlist and optimistic version; search text regenerated |
| `PATCH` | `/exercises/:exerciseId/status` | Trainer/Admin | Soft activate/deactivate with optimistic version; no hard delete |
| `POST` | `/exercises/:exerciseId/media` | Trainer/Admin | Adds unpublished bundled-original asset with source/license/attribution metadata |
| `POST` | `/exercises/:exerciseId/media/:mediaId/verify` | Trainer/Admin | Atomically verifies bundled asset provenance and publishes; duplicate thumbnail rejected |

Exercise deletion is not exposed in normal product APIs.

Phase 2 selects organization ownership under the approved tenant model. AI use in later phases resolves IDs within the current organization and rejects stale/inactive IDs; it cannot provide a free-text exercise as a substitute. Media URLs are restricted to the application-owned manifest and database constraint. The source vector assets are explicitly illustrative placeholders, not authoritative technique demonstrations.

## 6. Training Plans

Phase 3 plans are reusable organization resources. Every write below is Trainer/Admin only, authorized in the active organization; only assignment commands additionally require Admin or an active relationship with that student. Draft edit commands carry the plan-version aggregate `revision`; metadata changes to the plan identity carry its `version`. Published content and assignment provenance are never mutated in place.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET / POST` | `/training-plans` | Trainer/Admin | Scoped list with cursor, name/status filters; create reusable plan plus initial draft |
| `GET / PATCH` | `/training-plans/:planId` | Trainer/Admin | Version summary; parent metadata may be edited only before initial publish |
| `POST` | `/training-plans/:planId/versions` | Trainer/Admin | Transactional next numbered draft, optionally cloned from a published version; no second draft |
| `POST` | `/training-plans/:planId/duplicate` | Trainer/Admin | Independent new draft; no student assignment copied |
| `POST` | `/training-plans/:planId/archive` | Trainer/Admin | Requires no active assignments or unfinished draft; retires active version |
| `GET / PATCH` | `/plan-versions/:versionId` | Trainer/Admin | Full builder projection; only draft metadata is mutable |
| `POST` | `/plan-versions/:versionId/publish` | Trainer/Admin | Snapshot catalog, validate, freeze, activate and retire prior version atomically |
| `POST` | `/plan-versions/:versionId/void` | Trainer/Admin | Discard draft with required reason |
| `POST` | `/plan-versions/:versionId/workouts` | Trainer/Admin | Add draft workout |
| `POST` | `/plan-versions/:versionId/workouts/reorder` | Trainer/Admin | Requires exact set of child IDs and aggregate revision |
| `PATCH` | `/workout-templates/:templateId` | Trainer/Admin | Draft workout metadata |
| `POST` | `/workout-templates/:templateId/duplicate` or `/remove` | Trainer/Admin | Draft-only copy or remove, retaining contiguous order |
| `POST` | `/workout-templates/:templateId/exercises` | Trainer/Admin | Organization-owned active `exerciseId` required; no free-text substitute |
| `POST` | `/workout-templates/:templateId/exercises/reorder` | Trainer/Admin | Exact child IDs, transactionally reordered |
| `PATCH` | `/programmed-exercises/:id` | Trainer/Admin | Draft-only prescription edit; no performed fields |
| `POST` | `/programmed-exercises/:id/remove` | Trainer/Admin | Draft-only removal |
| `GET / POST` | `/students/:studentId/plan-assignment` | Admin/assigned Trainer | Current assignment or assign a published version |
| `POST` | `/students/:studentId/plan-assignment/replace` or `/end` | Admin/assigned Trainer | Explicit, audited assignment transition |
| `GET` | `/student/me/plan` | Owning Student | Read-only projection from current version-pinned assignment; excludes trainer notes and administrative metadata |

Bulk reorder request example:

```json
{
  "revision": 7,
  "orderedIds": ["pe_1", "pe_3", "pe_2"]
}
```

The server validates that the IDs are exactly the current children and increments the draft revision atomically. The Phase 1 API's `/api/v1/openapi.json` exposes the Zod-derived Phase 3 request schemas as well.

## 7. Scheduling and Workout Sessions

Phase 4 uses `WorkoutSession` as the scheduled occurrence and execution parent. Scheduling seals prescription snapshots immediately; start changes only state/time. Student reads are self-scoped; trainer reads and scheduling require Admin or a current trainer-student relationship in the organization. `NOT_STARTED` becomes available on its local scheduled date. A request key prevents duplicate occurrences for retried scheduling; student home resolves in-progress, due and next from the API.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `POST` | `/students/:studentId/workout-sessions` | Admin/assigned Trainer | Schedule from current student's pinned published assignment; snapshot prescriptions and sets atomically |
| `GET` | `/students/:studentId/workout-sessions` | Admin/assigned Trainer | Scoped list and status/cursor filters |
| `GET` | `/student/me/workouts` | Student | Own scheduled and historical occurrences |
| `GET` | `/student/home` | Student | Server-selected in-progress, due or next session plus lightweight weekly completion count |
| `GET` | `/workout-sessions/:sessionId` | Role-scoped | One execution projection: snapshots, actual sets, verified media metadata, and batched previous actual performance |
| `POST` | `/workout-sessions/:sessionId/start` | Owning Student | Idempotent state transition; snapshots already sealed at scheduling |
| `PUT` | `/workout-sessions/:sessionId/sets/:setId` | Owning Student | Actual fields only, in-progress only |
| `POST` | `/workout-sessions/:sessionId/finish` | Owning Student | Server computes completed/partial; partial needs structured reason; repeated finish is idempotent |
| `POST` | `/workout-sessions/:sessionId/cancel` | Owning Student or assigned Trainer/Admin | Actor and reason retained; zero completed sets only |
| `POST` | `/workout-sessions/:sessionId/skip` | Assigned Trainer/Admin | Past-due `NOT_STARTED` only; never automatic |

Set update request:

```json
{
  "version": 2,
  "completionState": "COMPLETED",
  "actualLoadKg": "77.50",
  "actualRepetitions": 8,
  "rir": 2,
  "rpe": null
}
```

Rules:

- Decimal values cross JSON as strings to avoid silent precision changes.
- The server ignores/rejects prescription fields in this command.
- Actual intensity fields must match the snapshotted prescription mode: only `rir` for `RIR`, only `rpe` for `RPE`, and neither for `NONE`; the selected value is optional unless product policy later requires it.
- `version` is the set row's optimistic version. Ordinary set saves do not change session version.
- An immediate exact `PUT` retry is safe; a stale competing version returns `409`, after which the client reloads authoritative state rather than overwriting it.
- Student may save `NOT_STARTED` draft values without implying completion; `COMPLETED` requires explicit intent and mode-compatible required actual fields. Active completed sets can be edited until the parent session finalizes.

Finish request:

```json
{
  "version": 14,
  "partialReason": "LACK_OF_TIME",
  "partialReasonDetail": null,
  "bodyRegion": null,
  "intensity": null
}
```

The request does not include the desired terminal status. If any set remains incomplete, `partialReason` is required; if every set is complete, omit it. Free-text detail and discomfort location/intensity are optional.

When `partialReason` is `DISCOMFORT_OR_PAIN` or `FEELING_UNWELL`, the server creates a minimal event of the matching safety type in the same transaction and returns its ID. Optional applicable detail may be included, but missing detail never prevents urgent safe exit. Phase 5 feedback links a detail row to the immutable early event instead of creating a duplicate incident.

Cancellation policy is explicit: students can cancel only their own not-started/in-progress session; assigned trainers/admins can cancel student sessions. An in-progress session with any completed set cannot be cancelled and must finish as `PARTIAL` or `COMPLETED`. Audited cancellation excusal and finalized trainer corrections are later-phase commands, not Phase 4 endpoints.

## 8. Feedback

Phase 5 adds optional, one-shot structured feedback to eligible finalized sessions. No student edit endpoint exists. Exact request retries return the same feedback ID; differing resubmissions return `409`. Phase 4 early safety events are reused through `DiscomfortReport.safetyEventId` without modifying terminal workout history.

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/workout-sessions/:sessionId/feedback` | Owning Student or Admin/assigned Trainer | Eligibility, 24-hour deadline, existing feedback, early safety facts and session exercise options |
| `POST` | `/workout-sessions/:sessionId/feedback` | Owning Student | Immutable structured submission within window; one per completed/partial session |
| `GET` | `/students/:studentId/feedback-signals` | Admin/assigned Trainer | Last subjective effort/recovery/discomfort and distinct sessions reporting discomfort in 28 days; factual only |

Example:

```json
{
  "sessionRpe": 8,
  "perceivedState": "VERY_DIFFICULT",
  "recoveryState": "TIRED",
  "discomfortPresent": true,
  "generalNotes": "Me sentí sin energía.",
  "discomfortReports": [
    {
      "bodyRegion": "RIGHT_KNEE",
      "otherLocation": null,
      "intensity": 4,
      "exerciseId": null,
      "notes": "Noté la molestia al bajar."
    }
  ]
}
```

If `discomfortPresent` is true, one or more distinct body-region rows are required; if false, the array must be empty. When an early discomfort event exists, the server links it to the matching (or first previously unspecified) region and rejects contradictions; further regions create distinct canonical events. The optional `exerciseId` must occur in that same student's session. Feedback is optional for 24 hours; skipping it never reopens or invalidates the workout.

## 9. Analytics and Reports

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/students/:studentId/analytics/overview` | Admin/assigned Trainer | Date range and metric definition version |
| `GET` | `/students/:studentId/analytics/exercises/:exerciseId` | Admin/assigned Trainer or self-shaped Student | Actual-set progression |
| `GET` | `/students/:studentId/history` | Role-scoped | Finalized sessions, cursor pagination |
| `GET` | `/student/me/progress` | Student | Curated own metrics |
| `POST` | `/students/:studentId/monthly-summaries` | Admin/assigned Trainer | Calculate source metrics; optional async narrative |
| `GET` | `/monthly-summaries/:summaryId` | Role-scoped | Metrics, formula version, narrative provenance |

Every analytics response includes:

- requested period and timezone;
- deterministic metric version;
- definitions/denominators where ambiguity exists;
- `insufficientData` markers instead of invented values.

## 10. AI Endpoints

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `POST` | `/students/:studentId/ai/plan-proposals` | Admin/assigned Trainer | Returns `202 Accepted` and request ID |
| `GET` | `/ai/generation-requests/:requestId` | Admin/currently assigned Trainer | Job status and safe errors |
| `GET` | `/ai/proposals/:proposalId` | Admin/assigned Trainer | Validated proposal, warnings, rationale, provenance |
| `POST` | `/ai/proposals/:proposalId/apply` | Admin/assigned Trainer | Explicitly creates/updates a draft |
| `POST` | `/ai/proposals/:proposalId/reject` | Admin/assigned Trainer | Records optional structured reason |
| `POST` | `/ai/generation-requests/:requestId/cancel` | Admin/currently assigned Trainer | Cancels only before proposal readiness |

The create request allows trainer intent such as number of weeks or emphasis, but not arbitrary provider prompts. Free text is bounded and treated as untrusted context.

## 11. Dashboard Endpoints

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `GET` | `/trainer/dashboard` | Admin/Trainer | Actionable cards scoped by role |
| `GET` | `/student/home` | Student | Today/next workout, weekly progress, alerts |

These are composed query endpoints, not generic resource dumps.

## 12. Privacy and Account Rights

| Method | Path | Role | Notes |
| --- | --- | --- | --- |
| `POST` | `/me/data-exports` | Authenticated | Creates an auditable asynchronous export |
| `GET` | `/me/data-exports/:exportId` | Requesting user | Expiring download status/URL |
| `POST` | `/me/erasure-requests` | Authenticated | Starts reviewed deletion/anonymization workflow |
| `GET` | `/admin/audit-events` | Admin | Scoped, filtered, no sensitive free-text payloads |
| `PATCH` | `/organization/settings` | Admin | Timezone, default units, retention-approved settings |

## 13. Authorization Rules

Every protected handler evaluates:

1. authenticated user;
2. active, non-disabled organization membership;
3. role for the action;
4. resource belongs to active organization;
5. trainer assignment or student self-ownership;
6. resource state permits the command.

Each opaque session is bound to one membership and organization. At launch an `ADMIN` owner has a trainer profile and inherits trainer capabilities; general organization switching is not implemented.

Return `404` instead of `403` when revealing existence would leak another tenant's data. Return `403` for known resources where the authenticated user can know the resource exists but lacks an action permission.

## 14. Rate Limits and Payload Limits

- Login and password reset: strict account/IP adaptive limits.
- AI generation: per-organization and per-trainer quotas with one active duplicate request per student/purpose.
- Set logging: generous user-based limit suitable for rapid entry, strict payload limits, and per-set optimistic concurrency.
- Free text: explicit length limits; strip control characters and render as text, never HTML.
- Media: allowlisted MIME types, bounded size, malware scan for uploads.

## 15. Contract Testing

- Zod schema tests cover accepted boundaries and rejected unknown fields.
- Controller tests assert authentication, authorization, and error mapping.
- Application integration tests use PostgreSQL and verify transactions/invariants.
- OpenAPI snapshots catch accidental contract drift.
- Playwright covers browser flows against the real API.
- Consumer tests ensure workout UI does not rely on Prisma or undocumented fields.
