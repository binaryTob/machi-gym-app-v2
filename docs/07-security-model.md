# Security Model

## 1. Security Objectives

- A user sees and changes only records permitted by organization, role, assignment, ownership, and resource state.
- Finalized performance and active/retired plan history cannot be silently altered.
- Sensitive wellness declarations are minimized in storage, logs, AI requests, and support tools.
- External providers and automations cannot become trusted application actors.
- Security failures fail closed without preventing safe workout exit or losing already confirmed actual data.

## 2. Authentication

Initial web authentication:

- password hashes use Argon2id with current calibrated parameters;
- a random opaque session token is stored in a `Secure`, `HttpOnly`, `SameSite=Lax` cookie and only its hash is stored server-side;
- every protected request rechecks current user, membership, assignment, and resource state; no stale role/assignment claim is trusted;
- sessions are bound to one active membership/workspace, have bounded idle and absolute expiry, and rotate after login/MFA privilege changes;
- launch enforces one active workspace membership per user, avoiding implicit workspace selection until switching is deliberately introduced;
- logout revokes server state, not only the browser cookie;
- password reset tokens are random, single-use, hashed at rest, and short-lived;
- login/reset responses prevent account enumeration;
- MFA is required for admins before broader production rollout, is delivered in Phase 1, and should be available to trainers.
- minimum-age, guardian-consent, and lawful-basis rules must be approved before collecting real student wellness data.

Prefer a same-origin deployment or reverse proxy (`app.example.com/api`) to simplify cookie and CSRF security.

## 3. Authorization

Use RBAC plus relationship/state checks:

- RBAC: `ADMIN`, `TRAINER`, `STUDENT`; the launch owner has an `ADMIN` membership plus trainer profile, and `ADMIN` inherits trainer capabilities while team/granular permissions are deferred;
- tenant check: resource belongs to the session membership's organization;
- relationship check: trainer has an active assignment or student owns the resource;
- state check: draft/in-progress/finalized state permits the operation;
- field check: request DTO exposes only fields the role may write.

Authorization belongs in application policies/guards and authorization-aware scoped queries. Controllers must not trust `studentId`, `organizationId`, `role`, or ownership supplied in request bodies.

Critical negative tests:

- trainer A cannot read trainer B's unassigned student;
- a student cannot read another student's predictable or leaked ID;
- a student cannot send prescription fields in set updates;
- a student cannot edit a finalized set/session;
- a trainer cannot edit an active or retired version;
- an admin from organization A cannot access organization B;
- disabled memberships and revoked assignments lose access immediately;
- AI workers cannot invoke trainer approval commands.

## 4. CSRF, CORS, and Browser Protections

- Mutation requests require same-site cookie plus CSRF token/header validation.
- CORS uses an exact allowlist and never combines wildcard origin with credentials.
- Content Security Policy restricts scripts, frames, media, and connections.
- Use `frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, strict referrer policy, and HSTS.
- Render user text as text; no unsanitized HTML.
- Protect state-changing forms from clickjacking and duplicate submission.

## 5. API and Data Validation

- Parse all external data with strict Zod schemas.
- Reject unknown write fields.
- Bound string lengths, arrays, numeric ranges, and nesting depth.
- Decimal load values use validated strings and Prisma Decimal.
- File uploads use signed URLs, MIME/content checks, size limits, malware scanning, and isolated object keys.
- Rate limits key on account/organization as well as IP where appropriate.
- Stable errors disclose no SQL, stack, provider prompt, or cross-tenant existence.

## 6. Sensitive Data and Privacy

Sensitive wellness data includes declared injuries, limitations, recurring discomfort, body location/intensity, and trainer notes.

Controls:

- collect only data needed for coaching;
- separate trainer-only notes from student-visible profile;
- exclude trainer notes from AI unless an explicit future field is approved for that purpose;
- do not include free-text wellness fields in ordinary logs or analytics telemetry;
- encrypt database/storage volumes and backups;
- TLS for every connection;
- production access through least-privilege service accounts;
- document data export, correction, and erasure workflows before launch;
- define launch-jurisdiction privacy basis and retention with legal review;
- use de-identified data for AI evaluation fixtures.
- classify every JSON column with a runtime schema and retention rule; avoid full sensitive response copies in audit, idempotency, outbox, and correction records;

Field-level encryption may be added for especially sensitive free text if the threat model or jurisdiction requires it. Encryption keys must live outside the database.

## 7. Historical Integrity and Audit

Audit events are append-only and include:

- actor and active membership;
- organization and affected resource;
- action and timestamp;
- request ID and source type;
- before/after field names or safe diff, excluding secrets and sensitive free text;
- reason for correction, cancellation, approval, or privileged access.

Audit these actions at minimum:

- membership/role/assignment changes;
- profile constraint creation/resolution;
- plan publication and retirement;
- finalized workout correction;
- AI request, apply, and rejection;
- exercise media license verification;
- exports, erasure, and admin support access.

PostgreSQL triggers reject normal updates/deletes to finalized execution, all non-draft plan content, submitted feedback/discomfort, audit events, and correction revisions. Phase 5 links a new immutable `DiscomfortReport` to an existing early safety event rather than updating the early event; extra locations append feedback-source canonical events. Corrections are typed append-only replacement revisions with actor and reason; generic JSON diffs are not the source of truth.

## 8. AI and External Provider Security

- Provider key is stored in a secret manager and used only by workers.
- Queue payload contains an internal request ID, not the context.
- Context is assembled after job claim and authorization/state recheck.
- Provider receives minimized, pseudonymous data.
- Contracts prohibit provider training/retention where supported; vendor terms require review.
- Outputs are untrusted and validated before storage.
- Provider has no application tools or database connectivity.
- Prompts and responses do not enter generic logs.
- A provider outage or compromise cannot activate plans or alter history.
- Prompt injection in user text has no mutation path.

## 9. n8n and Optional Integrations

n8n is outside the trusted core and optional. V1 integrations are outbound-only, carry opaque IDs/minimum notification facts, and cannot call back to change core state. A transactional outbox is introduced only when guaranteed delivery becomes a real requirement.

For a future inbound-webhook feature, receivers must:

- sign payloads with HMAC using per-endpoint rotating secrets;
- include timestamp, event ID, and schema version;
- reject expired timestamps and replayed event IDs;
- use constant-time signature comparison;
- retry idempotently with dead-letter visibility;
- provide minimum data per event;
- never accept a webhook as trainer approval or workout completion.

## 10. Threat Model Summary

| Threat | Example | Primary controls |
| --- | --- | --- |
| Broken object authorization | Student changes URL to another session | Scoped queries, ownership policy, negative tests, opaque IDs |
| Cross-tenant access | Admin accesses another organization | Active membership context, tenant predicates, 404 hiding |
| Privilege escalation | Student submits plan fields | Role-specific DTOs, state policy, strict schemas |
| Historical tampering | Modify old loads to inflate progress | Finalization lock, correction events, audit |
| Session theft | Stolen opaque session token | HttpOnly/Secure cookie, hashed server record, rotation, bounded expiry, revocation |
| CSRF | Malicious page finishes workout | CSRF token, SameSite, origin checks |
| Injection/XSS | Notes contain script/prompt injection | Text rendering, CSP, schema bounds, tool-less AI |
| AI hallucination | Unknown exercise or invented metric | Allowlisted IDs, deterministic metrics, strict validation |
| Sensitive log leakage | Pain notes in error tracking | Structured allowlisted logging, redaction tests |
| Queue replay | Duplicate proposal/report | Idempotency keys, unique request purpose keys, transactional state |
| Media license violation | Unlicensed GIF published | License metadata, verification gate, archival workflow |
| Availability attack | Repeated expensive AI requests | Quotas, rate limits, queue isolation, circuit breaker |

## 11. Secrets and Supply Chain

- No secrets in repository, Docker images, browser bundles, or logs.
- `.env.example` contains names and safe placeholders only.
- Lock dependencies and run vulnerability/license scanning in CI.
- Pin production container images by digest where practical.
- Generate SBOMs for releases.
- Use least-privilege CI credentials and protected environments.
- Review third-party exercise media and AI SDK supply chains.

## 12. Retention and Recovery

Proposed starting policy, pending legal/product approval:

- active coaching data retained during the relationship;
- inactive account data retained for a defined period, initially proposed 24 months;
- AI raw provider responses/context snapshots retained briefly, initially proposed 30 days, while validated proposal/provenance may follow plan retention;
- audit records retained according to compliance needs, initially proposed 24 months;
- revoked server sessions retained until expiration plus security investigation window;
- backups follow a documented rolling schedule and deletion propagation policy.

Recovery requirements:

- PostgreSQL point-in-time recovery;
- encrypted backups with quarterly restore tests;
- defined recovery point and recovery time objectives before production;
- Redis queue loss must be recoverable by reconciling non-terminal database request states;
- media inventory and licensing metadata included in backup/restore validation.

## 13. Security Verification Gates

- threat-model review before Phase 1 authentication implementation;
- automated authorization matrix tests in every protected module;
- dependency/secret/SAST checks in CI;
- DAST and manual object-access testing before beta;
- AI prompt-injection and malformed-output fixtures before AI phase release;
- backup restoration exercise before production;
- privacy and medical-language review before collecting real discomfort data;
- tested data export and erasure/anonymization workflows before production;
- incident response runbook and contact ownership before launch.
