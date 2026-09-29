# Fase 6: métricas deterministas y resúmenes mensuales

**Implementación:** `apps/api/src/analytics-calculations.ts` (fórmulas puras, `ANALYTICS_VERSION = 1`), `analytics.ts` (consultas, autorización y snapshots), `apps/web/components/progress-dashboard.tsx` y migración `20260928000000_monthly_progress`. No se usa IA, 1RM estimado ni adaptación de planes.

## Tiempo y atribución

- Cada alumno usa `StudentProfile.timezone ?? Organization.timezone`, zona IANA. Intervalos de fechas **locales** `[inicio, fin)`; meses del día 1 al 1 del mes siguiente; semanas empiezan lunes; últimos 30 días incluye hoy y los 29 días anteriores. Rango personalizado recibe inicio/fin inclusivos (máximo 367 días). `scheduledDate` es fecha civil sellada `YYYY-MM-DD`, sin convertir la medianoche UTC a otro huso.
- Adherencia y motivos parciales pertenecen a la **fecha programada**. Series, duración y feedback al día local de `finishedAt`, incluso si el feedback se envió después; molestia al día local de `DiscomfortReport.createdAt`; peso a `measuredAt`. Bordes de consultas de timestamps se amplían ±1 día UTC y se filtran por fecha local exacta (también para horarios nocturnos y DST).
- Mes anterior = mes civil anterior, nunca últimos 30 días. Para el bloque de últimos 30 días de un informe histórico se fija el final en el **último día de ese mes**; para el tablero actual termina hoy.

## Reglas versionadas (v1)

| Métrica | Fórmula / regla |
| --- | --- |
| Adherencia | `100 × (COMPLETED + PARTIAL) / elegibles`, 1 decimal. PARTIAL cuenta igual que COMPLETED para asistencia binaria y se informa aparte; sin ponderación oculta. Elegibles: sesiones programadas dentro del período y hasta hoy, incluidos `NOT_STARTED` vencidos, `IN_PROGRESS`, `COMPLETED`, `PARTIAL`, `SKIPPED` y cancelaciones no exentas. Cancelación exenta: `CANCELLED` por `ADMIN`/`TRAINER` **antes del día local programado**. Cancelación de estudiante o tardía queda en el denominador. Informar programados hasta hoy, elegibles, completos, parciales, omitidos, cancelados y pendientes vencidos. No inferir recurrencia ni sesiones no programadas. |
| Volumen | Suma de `actualLoadKg × loadMultiplierSnapshot × actualRepetitions` para series `COMPLETED` de sesiones finalizadas y ejercicios `WEIGHT_REPS`, con peso externo **positivo**, repeticiones presentes y multiplicador sellado positivo. Por implemento usa multiplicador snapshot para carga externa total. Peso ausente, carga cero, series incompletas, `REPS_ONLY` y sugerencias se excluyen. Se informa cantidad de series comparables. No es una medida universal de calidad. |
| Progresión | Por `exerciseId` canónico y período: serie realizada de mayor carga, empate por más repeticiones. Anterior → actual. Si repeticiones iguales, diferencia de kg; si carga igual, diferencia de repeticiones; si ambas difieren, mostrar hechos sin delta comparable. Si falta mes anterior, indicarlo. En períodos no mensuales mostrar mejor set sin comparación anterior. No declarar «más fuerte». |
| Peso | Primer y último registro **dentro del período** ordenados por `measuredAt`, luego `id`; diferencia `último − primero` sólo con 2+ registros. No transportar medición antigua a límite de mes ni interpolar. «Actual» del período es el último registro en él, no un valor inventado de hoy. Lista completa bajo gráfico SVG. |
| RPE / recuperación | Media aritmética de `SessionFeedback.sessionRpe` de sesiones finalizadas dentro del período; mostrar muestra y distribución por `recoveryState`, sin score de readiness. Tendencia cronológica en respuesta API. |
| Molestia | Agrupar reportes relacionales por `bodyRegion`: conteo, media de intensidades **informadas** (null sin muestra), último `createdAt`, frecuencias por `exerciseId` donde existe; sin diagnóstico/riesgo. Evento temprano sin reporte posterior se incluye sólo si indica zona; con reporte posterior cuenta **una sola vez** mediante la relación al evento. |
| Duración | `finishedAt − startedAt` para `COMPLETED` o `PARTIAL`, incluir sólo intervalos de **1 a 360 minutos** inclusive. Fuera de rango o sin ambos timestamps se excluye, no se corrige ni estima. Muestra, suma y media redondeada a minutos. |
| Parciales | Conteo de `PARTIAL` y distribución por `partialReason` según fecha programada, sin juicio de valor. |

Ausencia y cero son distintos: adherencia sin elegibles, volumen sin series externas, RPE sin feedback, duración sin timestamps válidos y diferencia de peso con menos de dos mediciones devuelven `null`. Un cero auténtico (cero parciales, cero delta con dos mediciones) sigue siendo cero. Precisión: RPE/adherencia/intensidad 1 decimal; volumen/delta carga y peso hasta 2 decimales en cálculo desde Decimal, presentación hasta 1 decimal. Tiempo en horas/minutos enteros.

## Persistencia y correcciones

- Tableros `GET .../analytics` son **live** desde PostgreSQL; meses sin finalizar `GET .../analytics/monthly/:year/:month` se identifican como provisionales. Entrenador/admin puede `POST .../finalize` sólo **48 h después del fin UTC del mes**, margen conservador que abarca todos los husos IANA y la ventana de feedback de 24 h de una sesión nocturna. Se guarda JSON de métricas, `[periodStart,periodEnd)` como `DATE`, `timezone`, `analyticsVersion=1`, revisión 1 y `generatedAt`; repetir sin corrección devuelve el mismo snapshot. No hay cron/worker.
- Corrección de datos originales terminados **no existe** en esta fase: mantienen restricciones de inmutabilidad. Si otra fase habilita una corrección autorizada/auditada, `POST .../revise` con motivo explícito crea revisión nueva; la anterior conserva su JSON y sólo recibe `supersededAt`. Bloqueo de fila del alumno y `AuditEvent` registran la transición; índice parcial garantiza una sola revisión activa por alumno/mes/versión, FK compuesta restringe organización y trigger impide alterar payload o borrar historia. Nuevas versiones de cálculo pueden convivir con v1. No usar revisión para alterar datos fuente.
- Para meses históricos sin snapshot se informa reconstrucción provisional, no informe final. Al existir varias versiones activas de un mismo mes se lee la versión numérica mayor; si sólo existe v1, permanece visible aunque el código introduzca v2. La tarjeta «mes anterior» integrada en snapshot queda congelada con esa revisión.

## Acceso y costes

La organización viene de sesión opaca y backend comprueba rol/asignación activa antes de consultar fuentes o snapshots. El alumno usa únicamente `/student/me/...`; no elige ID. Entrenadores leen sólo fichas asignadas, dueño sólo su organización; IDs ajenos responden `404` donde corresponde. Roster usa página de 25 alumnos autorizados y carga fuentes por lotes (sesiones/series/feedback, pesos, molestias), sin N+1 por alumno. Mutaciones de snapshots conservan Origin + CSRF. Índices nuevos cubren peso por `(organizationId,studentId,measuredAt)` y snapshot mensual. Sin OLAP ni caché.

## Límites

`REPS_ONLY` no tiene comparación de cargas; sí figura en frecuencia de series/repeticiones agregadas. No se calcula 1RM, volumen corporal, repetición equivalente a otro rango, ni cumplimiento de frecuencia semanal declarada. El seed es pequeño, con fechas relativas y claves estables; en bases antiguas con asignación demo iniciada hoy las sesiones previas incompatibles se omiten sin cambiar procedencia inmutable.
