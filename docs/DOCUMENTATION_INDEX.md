# Índice y autoridad de la documentación

**Inicio de una sesión nueva:** [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) → [DEVELOPMENT.md](DEVELOPMENT.md) → implementación/tests/migraciones relevantes. Los documentos numerados conservan diseño de producto y decisiones, pero **no todos describen funcionalidades existentes**. No usar una propuesta como sustituto del código.

## Documentos operativos actuales

| Fuente | Para qué sirve |
| --- | --- |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | Estado real, invariantes, decisiones respetadas, riesgos, pendientes e instrucciones para OpenCode. |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Clonar, configurar secretos locales, arrancar, migrar, sembrar, probar y diagnosticar una OS nueva. |
| [README.md](../README.md) | Entrada para humanos, comandos rápidos, producto y rutas hacia el resto de la documentación. |
| `apps/api/prisma/schema.prisma` | **Modelo relacional operativo**. |
| `apps/api/prisma/migrations/` | **Historia SQL aplicada**: FK compuestas, índices parciales y triggers además de tablas Prisma. |
| `packages/contracts/src/index.ts` | Contratos Zod de entrada y taxonomías compartidas. |
| `apps/api/src/openapi.ts` / `/api/v1/openapi.json` | Índice de rutas y esquemas de request derivados de Zod. El manifiesto OpenAPI no reemplaza las comprobaciones de negocio de cada servicio. |
| `.github/workflows/verify.yml` | Lint, tipos, tests, build, Prisma y E2E cuando la carpeta del proyecto sea la raíz Git. |

## Referencia vigente de dominio y límites

- [01 Product requirements](01-product-requirements.md): visión y permisos deseados, con ideas futuras. Su encabezado original es histórico: la UI actual y el código deciden qué existe.
- [02 Domain and data model](02-domain-and-data-model.md): nombres y distinción entre catálogo, programa reutilizable, asignación, ocurrencia, series y feedback; comprobar siempre su correspondencia con el esquema operativo.
- [03 System architecture](03-system-architecture.md): razones para el monolito, tenant, snapshots, contratos y transacciones. Sección de evolución = intención, no servicios existentes.
- [04 API architecture](04-api-architecture.md): convenciones y rutas conocidas; secciones de IA, reportes, privacidad/derechos y algunas extensiones describen **capacidades futuras**. El `openapi.ts` del código es la lista ejecutable actual.
- [06 UX/UI architecture](06-ux-ui-architecture.md): principios y flujos; rutas `/coach` y `/app` de diagramas son arquitectura objetivo. Las rutas reales están en `apps/web/app/` (`/trainer`, `/student`, etc.).
- [07 Security model](07-security-model.md): amenazas y controles deseados; separar los controles actuales de requisitos preproducción que todavía requieren revisión.
- [09 Risks and decisions](09-risks-and-decisions.md): decisiones aprobadas, elecciones postergadas y puertas legales/operativas.
- [11 Exercise/media policy](11-exercise-media-policy.md): catálogo por organización, licencias, SVG originales ilustrativos y límite actual de media.
- [12 Reusable plans](12-phase3-plan-decisions.md): planes de organización y asignaciones versionadas; **sustituye** la idea antigua de un plan identidad por alumno.
- [13 Workout execution](13-phase4-workout-execution-decisions.md): scheduling manual, snapshot al programar, estado, sets reales y timer local.
- [14 Feedback decisions](14-phase5-feedback-decisions.md): envío único en 24 h, recuperación subjetiva, molestias relacionales y evento temprano canónico.
- [15 Analítica determinista](15-phase6-deterministic-analytics.md): períodos, fórmulas v1, autorización, insuficiencia de datos y snapshots mensuales auditables.
- [16 Propuestas asistidas por IA](16-phase7-ai-proposals.md): proveedor opcional, contexto mínimo, catálogo canónico, reglas, borrador aprobado por entrenador y límites.

## Material histórico o de diseño futuro

- [05 AI architecture](05-ai-architecture.md): **propuesta histórica** con cola/worker y capacidades clínicas/narrativas aún no implementadas; la Fase 7 operativa está en [16](16-phase7-ai-proposals.md).
- [08 Implementation roadmap](08-implementation-roadmap.md): secuencia/posibles próximos trabajos, **no un límite final** del proyecto. Revalidar requisitos contra código cuando se inicie una capacidad nueva.
- [10 Pre-implementation review](10-pre-implementation-review.md): registro histórico de revisión previa, con enmiendas por decisiones posteriores. Algunas afirmaciones originales están explícitamente **superseded** y no deben reimplantarse.
- [`prisma/schema.prisma`](prisma/schema.prisma): **propuesta multietapa**, contiene modelos que no están en el esquema operativo (correcciones, IA, métricas/reportes). Se valida como documento técnico, pero **jamás se usa para `db:migrate` o seed**.

## Cuándo actualizar qué

- Cambio en comportamiento actual, comando o variable → código/tests + [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)/[DEVELOPMENT.md](DEVELOPMENT.md)/README según corresponda.
- Nueva invariante de dominio → contrato y tests + migración SQL/Prisma si aplica + documento de decisión correspondiente.
- Decisión futura que sustituye una anterior → conservar el documento antiguo como historial, marcar **superseded** explícitamente y enlazar la decisión nueva desde aquí.
- Nueva necesidad de despliegue/privacidad → documentar si está **implementada** o sigue siendo una **puerta pendiente**; no confundir una recomendación con un control ya desplegado.
