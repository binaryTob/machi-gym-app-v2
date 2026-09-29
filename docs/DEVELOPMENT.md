# Desarrollo reproducible desde un clon limpio

Esta guía es operativa y no depende de una fase del roadmap. Leer [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) antes de cambiar el dominio; las diferencias entre documentación histórica y código se explican en [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md).

## Requisitos en una OS nueva

- Acceso autenticado al repositorio **privado** de GitHub (SSH o `gh auth login`). El directorio `machi-gym-app-v2/` debe ser la raíz Git para activar `.github/workflows/verify.yml`.
- Git, Node.js **22 o superior** (probado también con Node 24), Corepack, Docker Engine/Desktop con Compose, puertos locales `3000`, `3001` y `5432` libres.
- Para E2E: Chromium administrado por Playwright; en Linux pueden requerirse sus bibliotecas del sistema. No copiar `node_modules`, `.next`, `dist` o caches del sistema anterior.

## Bootstrap exacto

```bash
git clone https://github.com/binaryTob/machi-gym-app-v2.git
cd machi-gym-app-v2
corepack enable
cp .env.example apps/api/.env
# En Windows PowerShell usar: Copy-Item .env.example apps/api/.env
```

**Detenerse aquí y editar `apps/api/.env` antes de ejecutar el resto.** Reemplazar ambas contraseñas de ejemplo por valores locales distintos y guardar una clave MFA aleatoria; el seed rechazará los placeholders. Luego:

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d db
corepack pnpm db:generate
corepack pnpm db:migrate
corepack pnpm db:seed
corepack pnpm dev
```

**Antes de `db:seed`, editar `apps/api/.env`:** elegir contraseñas locales distintas de por lo menos 12 caracteres para `SEED_ADMIN_PASSWORD` y `SEED_STUDENT_PASSWORD` y generar una **nueva** clave `MFA_ENCRYPTION_KEY` de 32 bytes / 64 dígitos hexadecimales. Ejemplo de generación en cualquier OS con Node:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copiar el resultado **sólo** a `apps/api/.env` local. No pegarlo en GitHub, issues, mensajes ni `.env.example`. Si vas a restaurar una base antigua con factores MFA ya cifrados, debés recuperar **la misma clave original mediante un canal privado**, no generar otra; si no existe, será necesario re-enrolar MFA. Para un clon con base nueva no hace falta trasladarla.

| Variable | Dónde se usa | Valor de desarrollo / advertencia |
| --- | --- | --- |
| `DATABASE_URL` | Prisma, API, seed y tests | URL PostgreSQL local de `docker-compose.yml`; el password `machi` allí es sólo para desarrollo. Nunca usar ese usuario/password en producción. |
| `WEB_ORIGIN` | CORS y protección Origin/CSRF | Exactamente `http://localhost:3000` para la UI local; no agregar `/` final. |
| `API_PORT` | NestJS | `3001` por defecto. |
| `SESSION_SECURE` | Cookie de sesión | `false` sólo con localhost HTTP; `true` detrás de HTTPS. |
| `MFA_ENCRYPTION_KEY` | Cifrar/descifrar secreto TOTP | 64 caracteres hexadecimales aleatorios; se necesita al enrolar/iniciar sesión con MFA existente. |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | Seed dev y Playwright | Identidad del dueño de ejemplo; crear contraseña local propia. |
| `SEED_STUDENT_PASSWORD` | Seed dev | Credencial del alumno ficticio; distinta del dueño. |
| `API_INTERNAL_URL` | Rewrite de Next.js (opcional) | URL interna de Nest si no es `http://127.0.0.1:3001`. |
| `NODE_ENV` | Guardia del seed | `db:seed` **rechaza** `production`; no ejecutar fixtures con datos reales. |
| `AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY` | Propuestas de Fase 7 | Opcionales. Sin proveedor el resto funciona; `AI_PROVIDER=openai` requiere modelo y clave privados. `AI_PROVIDER=fake` sólo para desarrollo/tests y no hace llamadas de red; nunca usarlo como recomendación real. |

La web está en `http://localhost:3000`; Next reescribe `/api/v1/*` hacia Nest en `http://localhost:3001`. Salud: `http://localhost:3000/api/v1/health`. OpenAPI de cuerpos de request Zod: `/api/v1/openapi.json`. La API necesita PostgreSQL disponible. El primer login del dueño usa `SEED_ADMIN_EMAIL`/password, luego el dashboard permite enrolar TOTP y guardar ocho códigos de recuperación. El alumno ficticio usa el correo `demo-<organizationId>@example.test` generado al seed; también podés crear uno desde el dashboard del entrenador y entregar manualmente el enlace de invitación de un solo uso. **No hay correo automático**.

## Checks y rutas de testing

```bash
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm --filter @machi-gym/api exec prisma validate
corepack pnpm --filter @machi-gym/api exec prisma migrate status
corepack pnpm --filter @machi-gym/web exec playwright install chromium
corepack pnpm test:e2e
```

`corepack pnpm test` ejecuta Vitest para contratos/API (incluyendo integración real contra PostgreSQL), y deja fixtures ficticios con IDs nuevos en la base. Web no tiene unit tests propios relevantes hoy; sus flujos se prueban con Playwright. `test:e2e` levanta web y API por `webServer` automáticamente, lee `apps/api/.env` y corre desktop/móvil; requiere owner sembrado y credenciales correctas. En Linux, si Chromium falla por dependencias del sistema: `corepack pnpm --filter @machi-gym/web exec playwright install --with-deps chromium` (puede requerir `sudo`). En otras OS basta `playwright install chromium`. Si `corepack` no reconoce `pnpm`, ejecutar `corepack enable` o usar siempre el prefijo `corepack pnpm`.

Para validar un bootstrap sin tocar los fixtures de la base habitual, crear una **base PostgreSQL descartable distinta** e indicar su URL mediante variable de entorno. Por ejemplo, desde Bash:

La Fase 6 agrega `MonthlyProgressSnapshot` y un índice parcial activo por alumno/mes/versión, un trigger de inmutabilidad y un índice de mediciones. `db:migrate` debe ejecutarse **antes** de abrir `/student/progress` o `/trainer/students/:id/progress`. Los informes de meses cerrados se finalizan sólo por entrenador/admin mediante el endpoint documentado en [decisiones analíticas](15-phase6-deterministic-analytics.md); las vistas sin snapshot indican cálculo provisional. El seed añade un historial ficticio pequeño y es repetible; si la asignación demo ya existía con inicio posterior a las fechas de ejemplo, se omiten esas sesiones sin editar su procedencia.

La Fase 7 agrega `AiTrainingProposal` y sus FK/trigger. `db:migrate` también debe ejecutarse antes de usar `/trainer/students/:id/ai`. El seed nuevo habilita los ejercicios ficticios iniciales para el fake sin llamar proveedores. **En bases ya sembradas, el seed no sobreescribe la elección previa de elegibilidad:** el entrenador puede habilitar expresamente los ejercicios activos desde su ficha. Para E2E sobre una base **descartable recién sembrada**, exportar también `AI_PROVIDER=fake` junto con `DATABASE_URL` y credenciales seed; la aplicación puede arrancar sin las variables AI. Ver [decisiones Fase 7](16-phase7-ai-proposals.md).

```bash
docker compose exec db createdb -U machi machi_verify
DATABASE_URL='postgresql://machi:machi@localhost:5432/machi_verify?schema=public' corepack pnpm db:migrate
DATABASE_URL='postgresql://machi:machi@localhost:5432/machi_verify?schema=public' corepack pnpm db:seed
DATABASE_URL='postgresql://machi:machi@localhost:5432/machi_verify?schema=public' corepack pnpm test
```

Para Playwright sobre esa base hay que exportar `DATABASE_URL` **y** las credenciales seed de esa misma base a los procesos de tests/webServer; el `.env` de la API sólo aporta valores no sobrescritos por el entorno. No ejecutar pruebas que crean datos sobre una base real. La base operativa es `apps/api/prisma/schema.prisma`, y `db:migrate` llama a **`prisma migrate deploy`**, que aplica las migraciones ya existentes. Para futuras migraciones, generar un nuevo archivo aditivo, revisar el SQL manual de triggers/checks e integrar pruebas negativas; no modificar las migraciones ya compartidas ni usar `docs/prisma/schema.prisma` como entrada de migración.

## Diagnóstico rápido

| Síntoma | Qué comprobar primero |
| --- | --- |
| API/Prisma no conecta | `docker compose ps`, puerto `5432`, `DATABASE_URL` en `apps/api/.env`, `corepack pnpm db:migrate` y `db:generate`. |
| `PrismaClient` no generado o import `@machi-gym/contracts` falla | `corepack pnpm db:generate` y `corepack pnpm --filter @machi-gym/contracts build` (el script raíz `dev` también construye contratos). |
| `403` al mutar | `Origin` exactamente igual a `WEB_ORIGIN`; sesión válida; cookie `machi_csrf` y cabecera `X-CSRF-Token` iguales. Desde navegador usar `apps/web/lib/api.ts`, no `fetch` manual sin CSRF. |
| `404` con una ID que parece existir | Revisar organización activa, rol, asignación entrenador-alumno vigente y propiedad del alumno. Se oculta deliberadamente la existencia de recursos ajenos. |
| `409` en perfil/plan/serie o feedback | Recargar estado servidor; revisar `version`/`revision`. Planes publicados/sesiones terminadas/feedback enviado no admiten edición normal. |
| MFA no permite entrar | Verificar que `MFA_ENCRYPTION_KEY` es la usada al cifrar el factor; revisar código TOTP/hora local o código de recuperación sin consumir. |
| Se intenta arrancar otro workout | Hay un único `IN_PROGRESS` por alumno: reanudar o finalizar/cancelar el anterior según las reglas del dominio. |
| Playwright no inicia o ve otra cuenta | Instalar Chromium/dependencias, confirmar owner del seed y `WEB_ORIGIN`, comprobar que no quedó otro servidor en `3000/3001`; `reuseExistingServer` se usa sólo fuera de CI. |
| Migración SQL falla aunque `prisma validate` pasa | Revisar `apps/api/prisma/migrations/` (FK compuestas, índices parciales, triggers de inmutabilidad/estado); `docs/prisma/` es objetivo futuro. Ver `prisma migrate status`. |

Las contraseñas y cuentas del seed son **ejemplos locales**, no credenciales de producción. El volumen Docker y los datos sintéticos de pruebas no se suben a Git: un clon limpio los reconstruye. Si hay **datos reales** locales que necesiten migrarse, detenerse y planificar un respaldo cifrado **fuera del repositorio privado** y un procedimiento de restauración; el repositorio sólo respalda código, esquema, migraciones, fixtures ficticios y decisiones.
