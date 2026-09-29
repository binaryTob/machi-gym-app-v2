# Machi Gym

Machi Gym es una aplicación web móvil para entrenadores y alumnos: separa prescripción, sesión programada, ejecución real y feedback estructurado. `machi-gym-app-v2` es su repositorio oficial y **un proyecto vivo**, no una implementación terminada en una fase determinada. Para continuar desde otra máquina u otra sesión de OpenCode, empezar por **[PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md)**, la [guía de desarrollo](docs/DEVELOPMENT.md) y el [índice de documentación](docs/DOCUMENTATION_INDEX.md).

## Inicio rápido local

Requisitos: Node.js 22+, Corepack y Docker con Compose. Los secretos locales van en `apps/api/.env` (ignorado por Git), nunca en `.env.example`. Para instalación desde cero y diagnóstico ver [DEVELOPMENT.md](docs/DEVELOPMENT.md).

```bash
cp .env.example apps/api/.env
# ANTES de continuar: editar apps/api/.env, sustituir ambas contraseñas de ejemplo
# y generar MFA_ENCRYPTION_KEY con: openssl rand -hex 32
corepack pnpm install
docker compose up -d db
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

Abrir `http://localhost:3000`. Entrar con `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, enrolar TOTP desde el panel, guardar los códigos de recuperación de un solo uso e iniciar sesión nuevamente. El entrenador puede crear alumnos y entregar **manualmente** un enlace de invitación; el reset también se entrega manualmente mediante `POST /api/v1/students/:id/reset-link` autenticado. **No hay proveedor de correo.**

`db:seed` agrega 22 ejercicios, ilustraciones SVG propias, un alumno ficticio (`demo-<organizationId>@example.test`, contraseña `SEED_STUDENT_PASSWORD`), un programa publicado, una sesión programada y un pequeño historial ficticio de sesiones, series, pesos y feedback/molestias. Es idempotente y **no corre con `NODE_ENV=production`**. El entrenador navega por `/trainer/students/:id/progress`, y el alumno por `/student/progress` para ver sus métricas.

Nest escucha en `http://localhost:3001`, con `/api/v1/health` y `/api/v1/openapi.json` (contratos Zod); Next reescribe `/api/v1/*` en el puerto 3000 para sesiones/CSRF same-origin. `API_INTERNAL_URL` cambia el destino interno del rewrite. `SESSION_SECURE=true` es obligatorio detrás de HTTPS; `false` sólo en localhost HTTP.

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm --filter @machi-gym/web exec playwright install chromium
corepack pnpm test:e2e
corepack pnpm build
corepack pnpm --filter @machi-gym/api exec prisma validate
```

Los tests API usan PostgreSQL real: cubren permisos/RBAC/MFA, tenant, catálogo, programas/versiones, snapshots y series efectivas, feedback inmutable y reutilización del evento temprano de molestia. Playwright recorre los flujos en desktop y móvil. Los tests dejan fixtures ficticios con ID nuevo en la base usada; **no ejecutarlos sobre datos reales**. Para una comprobación limpia usar otra base `DATABASE_URL` como indica [DEVELOPMENT.md](docs/DEVELOPMENT.md). Si Chromium necesita librerías Linux: `corepack pnpm --filter @machi-gym/web exec playwright install --with-deps chromium` con permisos apropiados.

## Estructura actual

- `apps/web`: Next.js, pantallas del entrenador/alumno, ejecución móvil, feedback e interfaz en español con claves en `lib/i18n.ts`.
- `apps/api`: NestJS, seguridad/RBAC, servicios de dominio y Prisma. El esquema **aplicado** y las migraciones SQL viven en `apps/api/prisma/`.
- `packages/contracts`: esquemas Zod de escritura estrictos y taxonomías compartidas; también generan cuerpos de request de OpenAPI.
- `docs/prisma/schema.prisma`: modelo objetivo **futuro**, no una migración ni el esquema operativo.

El código operativo soporta perfil con `birthDate` opcional (sin edad persistida), ejercicios canónicos por organización y media verificada, planes reusables publicados e inmutables con asignación versionada, ocurrencias programadas y series realmente realizadas, feedback opcional/inmutable en 24 horas, métricas de período e informes mensuales finalizables. **Todavía no existen** correcciones de historia finalizada, IA, notificaciones ni colas. Ver [decisiones analíticas](docs/15-phase6-deterministic-analytics.md) y el [contexto](docs/PROJECT_CONTEXT.md).

## Continuidad, seguridad y raíz Git

La continuación natural tras la analítica es definir correcciones auditadas de datos fuente y propuestas de adaptación revisadas por entrenador, sin modificación automática. **No es un despliegue de producción**: hay que aprobar privacidad/jurisdicción/consentimiento/retención, backup/restore y seguridad operativa. Invitaciones/reset siguen siendo manuales y los SVG son ilustraciones, no videos técnicos autorizados. Las decisiones por dominio siguen disponibles en [media](docs/11-exercise-media-policy.md), [planes](docs/12-phase3-plan-decisions.md), [sesiones](docs/13-phase4-workout-execution-decisions.md), [feedback](docs/14-phase5-feedback-decisions.md) y [analítica](docs/15-phase6-deterministic-analytics.md).

El workflow está en `.github/workflows/verify.yml`. GitHub lo descubre sólo si esta carpeta es la **raíz del repositorio Git**:

```text
machi-gym-app-v2/           # git rev-parse --show-toplevel must return this directory
  .github/workflows/verify.yml
  apps/api/                  # owns applied Prisma migrations
  apps/web/                  # owns browser routes and original media
  packages/contracts/       # shared Zod transport contracts
  docs/                     # architecture and media policy
  pnpm-workspace.yaml
```

La carpeta se desarrolló inicialmente bajo el Git ajeno de `scripts/`. Se prepara **un repositorio propio** para que el workflow se active sin trasladar otros proyectos; si `git rev-parse --show-toplevel` apunta afuera, no publicar el repositorio padre. Versionar `.github/`, `pnpm-lock.yaml`, migraciones, tests, docs y SVG; dejar afuera `.env`, volúmenes y artefactos.

## Ciclo de producto

`student profile -> approved training plan -> scheduled workout -> actual set execution -> structured feedback -> deterministic metrics -> trainer-reviewed adaptation`

La IA **no está implementada**. Si se agrega, sólo podrá sugerir propuestas validadas que el entrenador apruebe; nunca publicar planes, cambiar historia ni completar entrenamientos automáticamente.

## Documentación

La guía completa está en [DOCUMENTATION_INDEX.md](docs/DOCUMENTATION_INDEX.md). Los documentos históricos y de planificación no prueban que una capacidad exista en código.

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/01-product-requirements.md) | Scope, roles, permissions, journeys, requirements, and success criteria |
| [Domain and data model](docs/02-domain-and-data-model.md) | Domain language, aggregates, invariants, state machines, and data ownership |
| [System architecture](docs/03-system-architecture.md) | Runtime topology, module boundaries, data flow, and engineering conventions |
| [API architecture](docs/04-api-architecture.md) | REST resources, commands, contracts, errors, concurrency, and authorization |
| [AI architecture](docs/05-ai-architecture.md) | Controlled context, provider abstraction, validation, review, and observability |
| [UX/UI architecture](docs/06-ux-ui-architecture.md) | Page map, mobile workout UX, design system direction, and accessibility |
| [Security model](docs/07-security-model.md) | Authentication, authorization, privacy, audit, threats, and retention |
| [Implementation roadmap](docs/08-implementation-roadmap.md) | Testable phases, acceptance gates, and delivery sequence |
| [Risks and decisions](docs/09-risks-and-decisions.md) | Open questions, recommended defaults, assumptions, and approval checklist |
| [Pre-implementation review](docs/10-pre-implementation-review.md) | Critical review findings, corrections, database gates, and Phase 1 verdict |
| [Contexto OpenCode](docs/PROJECT_CONTEXT.md) | Estado real, decisiones, invariantes y próximos trabajos sin depender de esta conversación |
| [Desarrollo reproducible](docs/DEVELOPMENT.md) | Clonar, configurar entorno, migrar, probar y depurar desde otra OS |
| [Índice documental](docs/DOCUMENTATION_INDEX.md) | Fuentes operativas, documentos históricos y propuestas futuras |
| [Analítica determinista](docs/15-phase6-deterministic-analytics.md) | Fórmulas v1, períodos locales y reportes mensuales revisables |
| [Exercise/media policy](docs/11-exercise-media-policy.md) | Phase 2 ownership decision, seed and media provenance rules |
| [Phase 3 plan decisions](docs/12-phase3-plan-decisions.md) | Reusable programs, immutable versions, primary assignments, and future session snapshots |
| [Phase 4 workout decisions](docs/13-phase4-workout-execution-decisions.md) | Explicit scheduling, sealed occurrences, performed-set mutability, rest and safety semantics |
| [Phase 5 feedback decisions](docs/14-phase5-feedback-decisions.md) | Immutable 24-hour feedback, recovery/effort meaning, canonical discomfort merge and privacy |
| [Proposed Prisma schema](docs/prisma/schema.prisma) | Concrete database proposal for review; not an applied migration |

## Estado de desarrollo

**Operativo:** ciclo manual de entrenamiento y feedback estructurado, con pruebas. **Pendiente:** métricas/versiones analíticas, correcciones históricas, requisitos legales/operativos y posteriores extensiones. El proyecto continúa evolucionando; ninguna numeración histórica es un cierre de alcance.

Los requisitos iniciales fueron aprobados como base de arquitectura, con cambios de dominio posteriores documentados. Jurisdicción/retención y eventuales términos de proveedor IA siguen pendientes; el estado actual siempre se contrasta con código y migraciones.

## Referencia anterior

La implementación anterior `../machi-gym-app` fue una referencia **sólo de lectura** y puede no estar presente en una OS nueva. No es dependencia, base de código ni fuente de verdad para este proyecto.

Lección preservada: la sesión/ocurrencia debe permanecer separada del plan y la plantilla; agrupa series efectivamente realizadas y feedback histórico.
