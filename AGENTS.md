# Instrucciones del repositorio para agentes

Antes de comenzar cualquier tarea, leer [`docs/PROJECT_CONTEXT.md`](docs/PROJECT_CONTEXT.md), [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) y el [índice](docs/DOCUMENTATION_INDEX.md). Contrastar la documentación histórica con el código y los tests: `apps/api/prisma/schema.prisma` + `apps/api/prisma/migrations/` son el esquema **actual**; `docs/prisma/schema.prisma` es una propuesta futura, no una migración.

- Este proyecto es un monolito modular Next.js + NestJS + PostgreSQL con contratos Zod en `packages/contracts`; trabajar por cortes pequeños sin reintroducir infraestructura distribuida prematura.
- Proteger siempre autorización de servidor, tenant/estudiante, pertenencia de ejercicios, CSRF, sesión opaca, diferencia entre prescrito y realizado, snapshots versionados e historia de feedback/molestia inmutable.
- Ejecutar tests relevantes antes/después de cambios, además de lint/tipos/build/Prisma y Playwright si cambia UX. Usar base de pruebas, no datos reales.
- Actualizar el contexto y las decisiones si cambia la arquitectura. No asumir que existe una función sólo porque figure en un roadmap o documento propuesto.
- No versionar secretos, `.env`, volúmenes/bases locales, dumps, `node_modules`, builds ni trazas de navegador. Antes de un commit revisar `git status`, `git diff --cached` y los ignorados. La marca pública es «Machi Gym»; el repo oficial `machi-gym-app-v2`.
