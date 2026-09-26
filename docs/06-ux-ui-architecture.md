# UX/UI Architecture

Phase 1 hardening routes the browser UI through Spanish localization keys in `apps/web/lib/i18n.ts`. Phase 2 uses the same keys for trainer catalog and mobile student technique views. Asset labels identify original SVG illustrations as visual references, not authoritative technique demonstrations.

## 1. Experience Principles

1. **The next action is obvious.** Student home centers today's workout; trainer home centers students needing attention.
2. **Execution beats administration.** The workout screen is a focused tool, not a form dashboard.
3. **Actual and suggested are unmistakable.** Historical actuals and today's entered values use stronger hierarchy than suggested load.
4. **Stopping safely is always available.** Finishing early is clear, non-punitive, and preserves completed work.
5. **Warnings state facts.** “Discomfort reported 3 times” is allowed; “injury risk” is not inferred.
6. **Progress is traceable.** Charts link back to sessions and show metric definitions.
7. **AI is visible and reversible.** AI content is labeled, reviewed, and enters only a draft.
8. **Mobile first, not mobile only.** Student execution is phone-primary; trainer planning uses responsive desktop space without failing on mobile.

## 2. Information Architecture

Las rutas implementadas están bajo `/trainer` y `/student`. Los diagramas `/coach` y `/app` más abajo son **históricos/propuestas de experiencia completa**, no URLs actuales. Ver [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md).

Phase 3 adds `/trainer/plans`, `/trainer/plans/:id`, and `/student/plan`. The trainer editor offers catalog-backed exercise selection, version-aware save/conflict handling, keyboard-accessible move controls, duplicate/void/publish actions, and explicit student assignment. The student program view is read-only and links canonical exercise IDs to the Phase 2 technique page. Session scheduling remains Phase 4.

Phase 4 adds `/student/workouts`, `/student/workouts/:id`, and `/trainer/workouts/:id` plus a scheduling panel in `/trainer/students/:id`. The API selects today's due/next or in-progress occurrence. The workout screen shows persistent actual sets, server-derived progress, prior actual sets, a technique dialog, and a reload-safe local rest timer. The browser does not turn navigation or typed-but-unsaved values into completed work.

| Ruta actual | Uso implementado |
| --- | --- |
| `/login`, `/accept?token=…` | Authentication and manually delivered student invitation |
| `/trainer`, `/trainer/students/:id` | Dashboard and student profile |
| `/trainer/exercises`, `/trainer/exercises/new`, `/trainer/exercises/:id` | Visual filtered catalog, creation, edit, status and media review |
| `/student`, `/student/exercises`, `/student/exercises/:id` | Student profile and read-only active technique references |
| `/trainer/plans`, `/trainer/plans/:id`, `/student/plan` | Edición de prescripción reusable y lectura de programa asignado |
| `/student/workouts`, `/student/workouts/:id`, `/trainer/workouts/:id` | Historial, ejecución y consulta de sesión por entrenador |
| `/student/workouts/:id/feedback` | Feedback opcional estructurado y consulta de envío histórico |

The catalog uses cards with prominent visual references on desktop and mobile. Student detail prioritizes media and instructions; trainer-only fields, unverified media, and inactive exercises never enter student projections. Browser copy is Spanish via centralized keys. The image alt text identifies the exercise; a text warning clarifies that bundled original SVG illustrations are not a substitute for individualized coaching.

### Public and authentication

```text
/login
/forgot-password
/reset-password
/accept-invitation/:token
```

### Student application

```text
/app                         Home: today/next workout and weekly progress
/app/workouts                Schedule and workout history
/app/workouts/:sessionId     Preview or active workout execution
/app/workouts/:sessionId/feedback
/app/progress                Curated statistics and exercise progression
/app/profile                 Student-visible profile and preferences
```

Primary mobile navigation: `Today`, `Workouts`, `Progress`, `Profile`.

During an active workout, normal bottom navigation is hidden or de-emphasized. A compact exit/resume pattern prevents accidental abandonment.

### Trainer application

```text
/coach                       Action-oriented dashboard
/coach/students              Assigned student list
/coach/students/new          Invitation/onboarding
/coach/students/:studentId   Student overview
/coach/students/:studentId/profile
/coach/students/:studentId/plans
/coach/students/:studentId/history
/coach/students/:studentId/progress
/coach/students/:studentId/safety
/coach/plans/:planId/versions/:versionId
/coach/students/:studentId/schedule
/coach/ai/proposals/:proposalId
/coach/exercises
/coach/exercises/:exerciseId
/coach/settings
```

Student detail uses stable sub-navigation: `Overview`, `Profile`, `Plan`, `History`, `Progress`, `Safety`.

Team management and organization switching are deferred. `/coach/reports` appears only when monthly reports ship; it is not an empty launch route.

## 3. Student Home

Hierarchy:

1. greeting and current date;
2. today/next workout card;
3. primary action: start or resume;
4. weekly completion strip;
5. concise latest progress insight;
6. any actionable account/error state.

Example content:

```text
Good morning, Juan

TODAY
Push
Chest · Shoulders · Triceps
About 55 min

[ START WORKOUT ]

This week
● Monday   ● Wednesday   ○ Friday
```

Do not show admin tables, dense filters, all profile fields, or AI controls here.

Empty states:

- no workout today: show next scheduled workout and date;
- no plan: explain that the trainer has not assigned one yet;
- offline: show last known schedule, but do not claim a session can start unless required snapshot data is safely available;
- schedule error: show retry and support request ID.

## 4. Workout Execution

### Screen structure

- workout heading with name/date and sticky persisted-progress summary;
- compact progress: exercise position and completed sets;
- ordered exercise cards in a single accessible scroll;
- previous performance disclosure, expanded by default on first visit if space permits;
- technique media/instructions dialog that preserves set inputs;
- set rows with large weight/repetition inputs and completion control;
- target RIR/RPE and rest presented near each row without dominating it;
- prominent finish action after the exercise cards; no navigation-only completion.

### Previous performance

Show actual values from the latest eligible `COMPLETED` or `PARTIAL` session that contains a completed set, finished before the current session started:

```text
Previous · Sep 15
70 kg × 10 · RIR 2
70 kg × 9  · RIR 1
70 kg × 8  · RIR 1
```

The start/resume payload includes previous performance for every exercise, so expanding it never triggers one request per card. If none exists, say “No previous performance yet.” Never prefill today's actual fields as if already performed. A deliberate “Use as input” shortcut may be evaluated later, but it must remain editable and clearly user-triggered.

### Set entry

- Numeric keyboard where supported.
- Minimum 44 by 44 CSS pixel touch targets; target 48.
- One row per programmed set.
- Load entry explains the exercise convention, such as `per dumbbell`, `total external load`, or `machine stack`; persistence stores kilograms plus the snapshotted convention/multiplier.
- Completion is explicit, not inferred merely because inputs have values.
- Suggested load appears as clearly secondary guidance, never as a performed value or automatic progression.
- Save state: `Saving…`, `Saved`, `Not saved`, `Conflict - refresh`.
- Failed saves remain visually attached to the affected set.

### Finish flow

Finish action is always reachable.

If complete:

1. show the persisted completed set count;
2. finalize;
3. show an immutable completion summary. Detailed feedback begins in Phase 5.

If incomplete:

1. state exactly what remains;
2. primary safe option: “Finish as partial”;
3. secondary option: “Continue workout”;
4. one quick required reason choice: lack of time, fatigue, discomfort/pain, feeling unwell, other;
5. if discomfort/pain, atomically save the reported-discomfort fact and offer body location/intensity without blocking urgent exit;
6. finalize performed work; Phase 5 may attach detailed feedback to the existing canonical safety event.

Do not use shame-oriented red warnings for partial workouts.

### Resume and recovery

- Home changes primary action to `Resume workout` while one is in progress.
- Reopening restores server-confirmed values and identifies unsent local edits.
- If another device changed the session, show a specific conflict resolution view rather than overwriting.
- A student may have at most one in-progress session initially; starting another prompts resumption/cancellation of the first.

## 5. Feedback UX

Phase 5 implements `/student/workouts/:id/feedback` as an optional, one-shot, 24-hour form. It opens from the completion state or the student's own history. Phase 4's quick partial-finish reason remains authoritative; its early safety event is referenced by a new detail row instead of being edited or duplicated.

The feedback form should take about 30 seconds when there is no discomfort:

1. session RPE large 1-10 scale with endpoint labels;
2. perceived workout-state chips (very good to very difficult);
3. recovery-on-arrival chips (very recovered to very tired);
4. explicit discomfort yes/no;
5. conditional one-or-more structured body location/intensity rows with optional same-session exercise, location detail and note;
6. optional general comment, submit and lightweight locked-feedback confirmation.

`Ahora no` returns home without invalidating the workout; history remains a way back to feedback for 24 hours. Early discomfort preselects “Sí” and known location/intensity. Submitting feedback links a detail record to the unchanged early event. Submitted feedback remains read-only; later notes require an audited correction workflow rather than silent rewriting.

If the user selects discomfort, use calm language: “¿Dónde sentiste la molestia?” Avoid medical conclusions. Provide generic guidance to consult an appropriate professional when a concern is severe; jurisdiction-specific emergency language still requires review before real-user rollout. The trainer session view shows factual reports; the student overview shows only cheap descriptive latest signals and distinct affected sessions, not a risk score.

## 6. Trainer Dashboard

The default view is an attention queue plus roster summary.

Priority groups:

- `Needs attention`: recurring discomfort, repeated partials, overdue workouts, high recent RPE;
- `Review`: AI proposals, draft plans, monthly reports;
- `On track`: stable students with next workout and progress direction.

Student card example:

```text
Juan Pérez                         Needs attention
92% completion adherence · 28 days
Bench press estimated strength rising
Right knee discomfort · 3 sessions
Next: Lower A · Friday
```

Every warning opens the supporting records. Color is supplementary to icon and text.

## 7. Plan Builder and AI Review

Desktop uses a two-pane or three-pane workspace:

- plan/workout navigation;
- editable prescription canvas;
- student context/constraint panel.

The student plan area also exposes dated scheduling as an explicit panel after publication. Publishing never silently creates sessions.

Mobile trainer UX uses stacked steps rather than compressing desktop columns.

Draft builder requirements:

- drag-and-drop plus keyboard-accessible reorder controls;
- exercise search filtered by equipment, muscle, active state;
- inline sets/reps/intensity/rest editing;
- duration estimate;
- validation summary with blocking errors and warnings;
- persistent draft save state and version conflict handling;
- publish action separated visually from save; publish is the trainer approval and activation step.

AI review is a comparison/review experience, not a chat box:

- proposal label and provenance;
- constraints and metrics used;
- warnings first;
- assumptions;
- structured workouts;
- per-item accept into draft or apply entire proposal;
- reject/regenerate;
- mandatory normal draft review before publish.

## 8. Progress and History

Student progress prioritizes understandable metrics:

- workout consistency;
- body weight trend when recorded;
- selected exercise performance;
- best completed-set load or estimated strength only where the versioned metric contract supports it;
- average session effort.

Trainer views can expose deeper filters and comparisons.

Charts must:

- include a table/list alternative;
- label units and date range;
- avoid misleading smoothed trends by default;
- explain insufficient data;
- link points to source workout details;
- distinguish external-load volume from bodyweight/unquantified work.

## 9. Design System Direction

### Visual character

Confident, focused, athletic, and calm. Avoid generic admin-dashboard styling and aggressive “no pain, no gain” imagery. The execution UI should feel like equipment: direct, durable, legible, and fast.

### Color

- Neutral surfaces carry most of the interface in both themes.
- One energetic brand accent marks primary actions and current progress.
- Semantic colors are reserved for success, warning, danger, and information.
- Discomfort warnings use accessible text/icon treatment, not color alone.
- Dark mode is designed independently, not produced by simple color inversion.

Exact palette and typeface require a separate design-system approval. All tokens live as CSS variables consumed by Tailwind/shadcn variants.

### Typography

- Highly legible sans serif for interface and numeric entry.
- Tabular numerals for loads, repetitions, timers, and metrics.
- Minimum 16px body/input text on mobile to avoid zoom and fatigue.
- Strong but restrained heading scale.

### Spacing and components

- 4px base spacing scale with most layout increments at 8px.
- Touch controls target 48px height.
- Core components: app shell, workout card, set row, metric tile, status badge, attention item, exercise selector, feedback scale, empty state, error state, skeleton, save indicator, bottom sheet, confirmation dialog.
- Use shadcn/ui primitives as accessible foundations, not as the final visual identity.

## 10. Responsive Behavior

Target viewports:

- 360px small phone baseline;
- 390-430px current phone focus;
- tablet portrait/landscape;
- 1280px trainer desktop;
- 1440px wide desktop.

Rules:

- no horizontal scrolling in student execution;
- sticky controls must not cover fields or browser safe areas;
- use `env(safe-area-inset-bottom)` for mobile action bars;
- trainer tables collapse into purposeful cards, not arbitrary hidden columns;
- dialogs become full-height sheets on narrow screens;
- media preserves aspect ratio and provides text instructions as fallback.

## 11. Accessibility

- WCAG 2.2 AA target.
- Full keyboard operation for trainer builder and student flow.
- Visible focus, logical focus order, and focus restoration after dialogs/sheets.
- Programmatic labels for every numeric input and set position.
- Screen-reader announcements for save success/failure without excessive noise.
- Reduced-motion preference respected.
- 200% zoom and text resizing without loss of action access.
- Charts include accessible summaries/data tables.
- RPE scales do not rely solely on color or unlabeled numbers.
- Technique media includes captions/transcript where applicable and complete text instructions.

## 12. Loading, Empty, and Error States

Every page map entry must define:

- initial skeleton that matches final layout;
- empty state with one next action;
- recoverable error with retry;
- permission/not-found state that does not leak resources;
- offline or stale data indicator where relevant;
- destructive/terminal confirmation state.

Avoid global spinners for set saves. Keep the workout interactive and show row-level state.

## 13. UX Validation

Before each phase ships:

- test at 360px and 390px widths;
- keyboard-only test applicable trainer pages;
- screen-reader smoke test for active workout and feedback;
- verify light/dark contrast;
- run Playwright journeys with success, empty, error, and slow-network cases;
- conduct task tests with at least one trainer and two students before AI plan generation is considered production-ready.
