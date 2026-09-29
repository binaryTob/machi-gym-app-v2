# Contexto del proyecto para continuar con OpenCode

> **Leé este documento al abrir una sesión nueva.** Describe el código que existe, las decisiones que no deben romperse y cómo continuar. Para comandos de instalación y diagnóstico, seguí [DEVELOPMENT.md](DEVELOPMENT.md). El índice de documentación, incluida la distinción entre documentos vigentes e históricos, está en [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).

## Qué es Machi Gym y cuál es su estado

Machi Gym es una aplicación web móvil para entrenadores personales y sus alumnos. Permite construir un perfil, mantener un catálogo de ejercicios, prescribir programas, asignar versiones publicadas, programar sesiones, registrar **lo que efectivamente sucedió**, recoger feedback subjetivo estructurado y consultar métricas deterministas. El flujo buscado es `perfil → prescripción aprobada → asignación y sesión programada → series realizadas → feedback → métricas deterministas → propuesta de adaptación revisada por entrenador`.

El repositorio oficial se llama **`machi-gym-app-v2`**, los paquetes usan `@machi-gym/*` y la marca visible es **Machi Gym**. El código cubre el flujo manual hasta feedback y métricas deterministas con informes mensuales versionados. **No hay motor de adaptación, generación con IA, notificaciones ni integración n8n.** Es un proyecto vivo: el [roadmap](08-implementation-roadmap.md) enumera posibilidades, no una fecha de finalización ni una orden de implementar todo.

La fuente de verdad sobre comportamiento existente es el código, los tests y **`apps/api/prisma/schema.prisma` más `apps/api/prisma/migrations/`**. `docs/prisma/schema.prisma` documenta un **modelo objetivo multietapa**: contiene tablas todavía no migradas y nunca debe aplicarse en lugar del esquema operativo.

## Usuarios y autorización

| Actor | Qué puede hacer hoy |
| --- | --- |
| `ADMIN` | Dueño del espacio; cuenta con `TrainerProfile`, hereda capacidades de entrenador y administra alumnos, catálogo, programas y sesiones de su organización. Puede leer todas las fichas de esa organización. |
| `TRAINER` | Rol previsto y protegido por la API para alumnos con `TrainerStudentAssignment.active=true`; no hay interfaz de creación/gestión de equipos o entrenadores adicionales. Puede prescribir, programar y consultar información de sus alumnos asignados. |
| `STUDENT` | Accede sólo a su perfil, catálogo activo autorizado, programa asignado, sus sesiones/series y feedback. No puede modificar prescripciones, catálogo, asignaciones ni datos de otros alumnos. |

Cada usuario autenticado tiene una `Membership` activa ligada a **una organización** en el lanzamiento. El token opaco de sesión identifica usuario + membresía + organización; se vuelve a consultar su vigencia en cada request protegido. Las consultas anidan el filtro de organización y, para un entrenador, la relación activa con el alumno. Una ID conocida de otro tenant o de un alumno no asignado devuelve `404`; una acción prohibida por rol devuelve `403`. La ocultación de controles en React **no** es autorización. Los `FOREIGN KEY` compuestos, índices parciales y triggers SQL complementan esas comprobaciones: el código de la API por sí solo no debe ser la última barrera.

## Modelo de dominio actual y por qué existe

1. **Identidad y coaching.** `Organization` es el límite de datos. `User`, `Membership`, `TrainerProfile`, `StudentProfile`, `TrainerStudentAssignment` e invitaciones modelan identidades y relaciones. Puede existir una ficha de alumno previa a la aceptación de la invitación. `birthDate` es opcional; nunca se persiste una edad calculada. Cambios de perfil/actividades/limitaciones invalidan la revisión de planificación (`planningRevision`, `reviewedPlanningRevision`). Las mediciones de peso y los eventos de auditoría son append-only mediante SQL. Actualmente hay endpoints para crear ciertas declaraciones, actividades, notas y mediciones, pero su experiencia de edición/consulta no está completa en la interfaz.
2. **Catálogo.** `Exercise` es canónico **dentro de cada organización**: slug único, nombre/alias español, músculos primarios/secundarios, equipamiento, patrón, instrucciones, precauciones, modo `WEIGHT_REPS` o `REPS_ONLY` y convención de carga. Se eligió propiedad por organización para que un entrenador no altere el catálogo de otro. `ExerciseMedia` conserva origen/licencia/atribución/verificador; sólo URLs de seis ilustraciones SVG originales incluidas con el proyecto están habilitadas hoy. GIF y video están modelados, pero no hay carga ni registro verificado de esos formatos. Un ejercicio desactivado deja de aparecer para programación nueva; referencias históricas autorizadas permanecen legibles.
3. **Prescripción reusable.** `TrainingPlan` pertenece a la organización, **no a un alumno**. `TrainingPlanVersion` guarda el programa y sus `WorkoutTemplate`/`ProgrammedExercise` ordenados. Cada entrada referencia un `exerciseId` de esa organización; un nombre libre no sirve como FK. Sólo el borrador se edita, con revisión optimista. Publicar captura nombre/técnica/convención del ejercicio en una versión inmutable y retira la versión previamente activa. Puede haber un borrador y una versión activa por plan. `StudentPlanAssignment` vincula un alumno con **una versión publicada concreta**; hay como máximo una asignación primaria activa por alumno. Publicar una nueva versión no reasigna alumnos implícitamente. Archivar un plan exige terminar/reemplazar las asignaciones y descartar el borrador pendiente.
4. **Ocurrencia y ejecución.** `WorkoutSession` es simultáneamente la ocurrencia programada y su contenedor de ejecución; no existe un segundo modelo uno-a-uno `WorkoutOccurrence`. El entrenador programa manualmente una fecha desde la asignación vigente (sin recurrencias ni fijar cada plantilla a un día de semana). En **esa misma transacción**, se crean `SessionExercise` con copia sellada de toda la prescripción y `SetPerformance` con los números de serie vacíos. Arrancar sólo pasa a `IN_PROGRESS`; no vuelve a copiar ni a inventar valores. Las cargas sugeridas son guía y **jamás** pasan a `actualLoadKg` automáticamente. Las series sólo cuentan cuando el alumno las marca explícitamente completadas. Una serie puede corregirse mientras la sesión está activa, con versión optimista; la sesión terminal y sus valores efectivos quedan inmóviles.
5. **Ciclo de sesión.** `NOT_STARTED → IN_PROGRESS → COMPLETED` si se completaron todas las series; `IN_PROGRESS → PARTIAL` si faltan series y el alumno decide terminar con motivo estructurado. `CANCELLED` exige cancelación explícita y cero series completas. `SKIPPED` exige una decisión de entrenador/admin sobre una sesión vencida que nunca arrancó. Abandonar una pestaña no cambia el estado. Hay un único `IN_PROGRESS` por alumno. La sesión conserva su versión/asignación y prescripción originales aunque posteriormente cambien el plan, la ficha o el catálogo. La API elige primero la sesión activa, después la vencida/disponible más antigua y después la próxima fecha para responder qué entrenar.
6. **Historial anterior.** Por `exerciseId` canónico, alumno y organización, se elige la última sesión `COMPLETED`/`PARTIAL` con al menos una serie efectivamente completada y `finishedAt < startedAt` de la sesión actual. La consulta SQL agrupa ejercicios en bloque y tiene índices parciales; no usa carga sugerida ni datos de otro alumno. La proyección de ejecución incluye prescripción, series guardadas, media verificada y anterior sin un request por ejercicio.
7. **Feedback y seguridad física.** Un `SessionFeedback` opcional pertenece exactamente a una sesión `COMPLETED`/`PARTIAL`. El alumno dispone de **24 horas desde `finishedAt`**, envía **una vez**, sin PATCH posterior; reintento con el mismo contenido retorna el mismo registro y contenido diferente produce conflicto. Registra `sessionRpe` (esfuerzo subjetivo 1–10 durante la sesión), `perceivedState` (cómo sintió la sesión), `recoveryState` (cómo llegó antes de entrenar), molestia sí/no y comentario opcional. Cada zona/molestia es un `DiscomfortReport` relacional, con intensidad 1–10 y ejercicio de **esa misma sesión** opcional. `SessionSafetyEvent` es el incidente canónico: si el alumno finalizó antes por molestia, el reporte **referencia** el evento temprano inmutable; no lo duplica ni reescribe. Zonas adicionales generan eventos `SESSION_FEEDBACK`. Dolor/molestia es una declaración, **no un diagnóstico ni un puntaje de riesgo**.
8. **Analítica descriptiva.** El servicio calcula desde ejecución finalizada, feedback y mediciones reales con huso horario efectivo del alumno y períodos de calendario explícitos; no usa prescripciones como datos realizados. Los tableros son live y `MonthlyProgressSnapshot` congela revisiones de meses cerrados con versión de cálculo y motivo de revisión auditable. Fórmulas, exclusiones, datos insuficientes y estrategia de correcciones: [decisiones de Fase 6](15-phase6-deterministic-analytics.md).

Los triggers y `CHECK` para versiones publicadas, tenant, transiciones, snapshots, exactitud de posiciones, feedback inmutable y ejercicio-en-sesión están en las migraciones SQL junto a las migraciones generadas por Prisma. **No eliminarlos al refactorizar el servicio:** `prisma validate` sólo valida el esquema declarativo, no esas reglas.

## Arquitectura y monorepo real

```text
apps/api/                         NestJS 10, Prisma 6, Node/TypeScript estricto
  src/auth.ts, common.ts           credenciales/sesiones, guards, DTO Zod, errores
  src/students.ts, exercises.ts    fichas y catálogo scoped
  src/plans.ts, programming.ts     versiones, plantillas y prescripciones
  src/assignments.ts              asignación publicada por alumno
  src/workouts.ts                  comandos de programación/ejecución
  src/workout-snapshot.ts          copia atómica de prescripción al programar
  src/workout-query.ts             proyecciones, historial anterior, paginación
  src/feedback.ts                  elegibilidad, feedback y señales descriptivas
  src/openapi.ts                   OpenAPI con cuerpos derivados de Zod
  prisma/schema.prisma             esquema ACTUAL
  prisma/migrations/               migraciones APLICADAS, SQL manual incluido
  prisma/seed.ts                   fixtures de desarrollo, nunca producción
  src/analytics-calculations.ts    fórmulas puras versionadas, sin IA
  src/analytics.ts                 consultas scoped, períodos y snapshots mensuales
apps/web/                         Next.js 15 / React 19, rutas app/ y components/
  lib/api.ts                       fetch same-origin, cookie y cabecera CSRF
  lib/i18n.ts                      claves centralizadas con español visible
  e2e/                             Playwright desktop + móvil
  public/media/exercises/          SVG propios, referencias ilustrativas
packages/contracts/src/index.ts    Zod estricto compartido; no modelos Prisma para UI
docs/                             decisiones, guía y esquema objetivo futuro
.github/workflows/verify.yml       checks al quedar ESTA carpeta como raíz Git
docker-compose.yml                 PostgreSQL 16 local, volumen Docker
```

Es un **monolito modular**, web y API en procesos separados sobre PostgreSQL transaccional. No existen Redis, BullMQ, worker, n8n, proveedor de IA, infraestructura OLAP, caché distribuida, almacenamiento S3 ni servicio de correo. Hay un dominio determinista de analítica en la API, descrito en [decisiones de Fase 6](15-phase6-deterministic-analytics.md), sin IA. La media actual se sirve desde `apps/web/public/`. Los contratos de entrada/rechazo de campos desconocidos son Zod en `packages/contracts`; los controladores delegan en servicios, las consultas Prisma viven en la API y React no importa Prisma. El frontend usa `fetch` con `cache: 'no-store'`, estado React y proyecciones específicas; **no** usa TanStack Query aunque aparezca en ideas históricas.

## Seguridad operativa real

- Contraseñas Argon2id. Cookie `machi_session` opaca de 32 bytes, `HttpOnly`, `SameSite=Lax`, `Secure` cuando `SESSION_SECURE=true`; en PostgreSQL sólo se guarda SHA-256 del token. Inactividad máxima 24 h y límite absoluto 7 días. Logout/revocación es del servidor.
- Token de invitación y reset de contraseña: aleatorio, un solo uso, hash en base de datos. El entrenador recibe el enlace/token sólo en la respuesta autenticada para **entrega manual segura**; `forgot-password` no revela si la cuenta existe, pero **no envía correos**. No existe hoy una interfaz pública completa de reset ni proveedor de email.
- `ADMIN` puede enrolar TOTP; secreto cifrado AES-256-GCM con `MFA_ENCRYPTION_KEY` de 64 dígitos hexadecimales y ocho códigos de recuperación de uso único hasheados. La sesión se revoca tras verificar el enrolamiento. El primer login del administrador puede hacerse antes de enrolar: **antes de usar datos reales/desplegar se debe verificar el requisito de MFA del producto**.
- Mutaciones exigen `Origin === WEB_ORIGIN`; las autenticadas requieren además cookie `machi_csrf` legible por el navegador y cabecera `X-CSRF-Token` idéntica. Next.js reescribe `/api/v1/*` hacia Nest para que browser y API compartan origen. Las pruebas API deben enviar ambas protecciones explícitamente.
- Proyecciones y endpoints hacen RBAC **en el backend** y `organizationId` viene de la membresía, nunca del body. La mayoría de FKs relevantes son compuestas. Aún no hay Row Level Security, ni una auditoría de seguridad de producción, ni un sistema de consentimiento/retención/erasure listo para usuarios reales.
- `apps/api/.env`, volúmenes Docker, claves, credenciales GitHub, datos de pruebas, `.next/`, `dist/` y `node_modules/` **no pertenecen al repositorio**. `.env.example` tiene valores ilustrativos, no secretos reutilizables. Si se restaura una base real con TOTP previamente enrolado, hay que recuperar su **clave MFA original** mediante canal seguro o volver a enrolar; no subirla a Git.

## Estado implementado frente a pendientes

**Fase 6 implementada y verificada en PostgreSQL/desktop/móvil:** login/invitaciones/perfil básico y RBAC; MFA y reset manual; catálogo español y media original verificada; programas reusables con versión, duplicado, reordenamiento, publicación y asignación; sesiones fechadas, ejecución/series, persistencia de progreso, historial anterior, técnica en overlay, timer local; feedback opcional estructurado/inmutable y reportes de molestia múltiples; analítica determinista por período, vista de alumno/entrenador, roster e informes mensuales finalizables/versionados. Seed idempotente crea ejemplos ficticios de historial, pesos, RPE y molestia; falla con `NODE_ENV=production`.

**Parcial o deliberadamente pospuesto:** UI de perfil/limitaciones/notas/mediciones no cubre todas las capacidades ya disponibles en API; lista de planes y fichas usa ventanas paginadas; la búsqueda del catálogo está normalizada por tildes. Media SVG sirve como **ilustración**, no video técnico ni carga de terceros. El rest timer y ediciones locales no sincronizadas usan `localStorage` y no son un modo offline/PWA. Programación es manual con fecha: sin motor de recurrencia. Las sesiones sólo capturan repeticiones y carga, no duración/distancia/calorías. No hay entrega automática de invitaciones, recuperación de feedback editado, importación de datos ni experiencia completa de exportación/erasure.

**No implementado:** correcciones auditadas de series finalizadas, catálogo multimedia subido por usuarios, IA/generación/adaptación autónoma, proveedor LLM, Redis/worker/colas, notificaciones/n8n, multitenancy con selector/equipos, analítica de riesgos clínicos. No presentar estas ideas como funcionalidades entregadas. [Roadmap histórico](08-implementation-roadmap.md) y [esquema objetivo futuro](prisma/schema.prisma) detallan opciones, no dan permiso para cambiar la arquitectura sin revisar la implementación.

**Riesgos y decisiones pendientes:** privacidad/jurisdicción, edades mínimas/consentimiento, retención, recuperación y borrado de datos, licencias para media externa, objetivos de disponibilidad/backup y términos de proveedor IA siguen sin aprobación para producción. Tampoco hay configuración de despliegue público: la API escucha en `0.0.0.0:3001` en desarrollo y requiere perímetro/TLS/reverse proxy antes de exposición real. Los tests de integración dejan datos sintéticos en PostgreSQL; usar una base descartable. El workflow GitHub sólo se activa si `machi-gym-app-v2` es la raíz del repositorio.

## Cómo comprobar y continuar

1. Seguí **literalmente** [DEVELOPMENT.md](DEVELOPMENT.md) desde un clon limpio. El seed reconstruye ejemplos; la base Docker y los datos de prueba existentes **no** se transfieren al clonar. No incluyas dumps con datos de alumnos ni secretos en Git.
2. Verificá `corepack pnpm lint`, `typecheck`, `test`, `test:e2e`, `build` y ambas validaciones Prisma. Los tests API usan PostgreSQL real y Playwright levanta web/API automáticamente. Si algo falla en una OS nueva, diagnosticá versiones/servicios/browser antes de cambiar lógica.
3. Inspeccioná el esquema **operativo**, las migraciones y los tests al tocar invariantes. Añadí migraciones aditivas y SQL de restricciones/triggers junto con pruebas negativas; jamás edites una migración ya publicada ni apliques el esquema multietapa de `docs/prisma/` como si fuera la base actual.
4. Las métricas deterministas, períodos, denominadores y snapshots se describen en [decisiones de Fase 6](15-phase6-deterministic-analytics.md). La continuación natural, **sin convertirla en obligación automática**, es definir correcciones históricas autorizadas/auditables de los datos fuente y propuestas de adaptación revisadas por el entrenador. Antes de una beta real hay que resolver privacidad/consentimiento/retención, revisar licencias y preparar backups/restauración. Antes de IA se requieren límites de contexto, términos de proveedor y revisión humana; IA no modifica ejecución ni publica planes.

## Instructions for future OpenCode sessions

- Leer **primero** este documento, [DEVELOPMENT.md](DEVELOPMENT.md) y [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md); seguir los enlaces relevantes antes de implementar.
- Inspeccionar el código, el esquema operativo, las migraciones y los tests **antes** de asumir que un documento antiguo describe algo existente. Si documento y código divergen, investigar y dejar constancia de la corrección.
- Mantener el monolito modular y las decisiones de dominio salvo razón fundada. No introducir colas, IA, capas genéricas, eventos de analítica ni rediseñar entidades sólo porque un documento futuro las proyecte.
- Preservar RBAC de servidor, aislamiento por organización/alumno, CSRF, pertenencia de ejercicios, distinción prescrito/programado/realizado, versiones inmutables, feedback bloqueado y evento canónico de seguridad. Añadir pruebas negativas de otros tenants y roles.
- Trabajar en cortes pequeños. Ejecutar tests relevantes **antes y después** de cambios y los checks completos cuando afecten contrato/esquema/autorización. Validar Playwright desktop/móvil para flujos visibles.
- Actualizar este contexto y la documentación relacionada si cambia una decisión importante. Señalar expresamente lo superseded; no borrar documentación histórica útil ni tratarla como autoridad superior al código reciente.
- No subir `.env`, claves MFA, credenciales Git, volúmenes, dumps, datos reales ni artefactos generados. Sólo fixtures ficticios; verificar `git diff --cached` antes de cada commit/push.
- Continuar desde el estado **real** y verificable del repositorio. No depender de esta conversación, de una memoria del agente o de una fase numerada como límite del proyecto.
