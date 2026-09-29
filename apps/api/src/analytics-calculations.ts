// Pure, versioned formulas. Dates in Period are local calendar dates (inclusive start, exclusive end).
export const ANALYTICS_VERSION = 1;
export type Period = { start: string; end: string; label: string };
export const localDate = (instant: Date, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const field = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${field('year')}-${field('month')}-${field('day')}`;
};
const utcDate = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: string, days: number) => dateKey(new Date(utcDate(date).getTime() + days * 86_400_000));
export function periodFor(kind: string, timezone: string, now: Date, start?: string, end?: string): Period {
  const today = localDate(now, timezone);
  const first = `${today.slice(0, 7)}-01`;
  const previous = dateKey(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)));
  const next = dateKey(new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1)));
  const weekStart = addDays(today, -((utcDate(today).getUTCDay() + 6) % 7));
  switch (kind) {
    case 'current-week': return { start: weekStart, end: addDays(weekStart, 7), label: kind };
    case 'previous-week': return { start: addDays(weekStart, -7), end: weekStart, label: kind };
    case 'current-month': return { start: first, end: next, label: kind };
    case 'previous-month': return { start: previous, end: first, label: kind };
    case 'last-30-days': return { start: addDays(today, -29), end: addDays(today, 1), label: kind };
    case 'custom': {
      const valid = (value: string | undefined) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && dateKey(utcDate(value)) === value;
      if (!valid(start) || !valid(end) || start! > end! || (utcDate(end!).getTime() - utcDate(start!).getTime()) / 86_400_000 > 366) throw new Error('Invalid custom date range (maximum 367 days)');
      return { start: start!, end: addDays(end!, 1), label: kind };
    }
    default: throw new Error('Unknown analytics period');
  }
}
export const inPeriod = (date: string, period: Period) => date >= period.start && date < period.end;
const rounded = (value: number, places = 1) => Number(value.toFixed(places));

export type SessionFact = { scheduledDate: string | Date; status: string; cancelledAt?: Date | null; cancellationActorType?: string | null; partialReason?: string | null; startedAt?: Date | null; finishedAt?: Date | null; workoutTemplateId?: string };
export function adherence(sessions: SessionFact[], period: Period, today: string, timezone: string) {
  const scheduled = (session: SessionFact) => typeof session.scheduledDate === 'string' ? session.scheduledDate : session.scheduledDate.toISOString().slice(0, 10);
  const due = sessions.filter((session) => inPeriod(scheduled(session), period) && scheduled(session) <= today);
  const cancelled = due.filter((session) => session.status === 'CANCELLED').length;
  const completed = due.filter((session) => session.status === 'COMPLETED').length;
  const partial = due.filter((session) => session.status === 'PARTIAL').length;
  const skipped = due.filter((session) => session.status === 'SKIPPED').length;
  // Administrative cancellations before the due date are exempt; other cancellations remain eligible.
  const exempt = due.filter((session) => session.status === 'CANCELLED' && ['ADMIN', 'TRAINER'].includes(session.cancellationActorType ?? '') &&
    session.cancelledAt && localDate(session.cancelledAt, timezone) < scheduled(session)).length;
  const eligible = due.length - exempt;
  return { scheduled: due.length, eligible, completed, partial, skipped, cancelled, pending: due.filter((session) => ['NOT_STARTED', 'IN_PROGRESS'].includes(session.status)).length,
    adherencePercent: eligible ? rounded(100 * (completed + partial) / eligible) : null };
}

export type PerformedSet = { exerciseId: string; name: string; mode: string; convention: string | null; multiplier: number; load: number | null; reps: number | null; completed: boolean; performedAt: Date; sessionId: string };
export function volume(sets: PerformedSet[]) {
  const byExercise = new Map<string, { exerciseId: string; name: string; volumeKgReps: number; sets: number; repetitions: number; lastPerformedAt: Date }>();
  for (const set of sets) {
    if (!set.completed || set.reps === null) continue;
    const previous = byExercise.get(set.exerciseId) ?? { exerciseId: set.exerciseId, name: set.name, volumeKgReps: 0, sets: 0, repetitions: 0, lastPerformedAt: set.performedAt };
    previous.sets++; previous.repetitions += set.reps;
    if (set.performedAt > previous.lastPerformedAt) previous.lastPerformedAt = set.performedAt;
    // Only explicitly recorded external loads. PER_IMPLEMENT uses the sealed multiplier.
    if (set.mode === 'WEIGHT_REPS' && set.load !== null && set.load > 0 && set.multiplier > 0) previous.volumeKgReps += set.load * set.multiplier * set.reps;
    byExercise.set(set.exerciseId, previous);
  }
  const exercises = [...byExercise.values()].sort((a, b) => a.name.localeCompare(b.name) || a.exerciseId.localeCompare(b.exerciseId)).map((row) => ({ ...row, volumeKgReps: rounded(row.volumeKgReps, 2) }));
  const comparableSets = sets.filter((set) => set.completed && set.mode === 'WEIGHT_REPS' && set.load !== null && set.load > 0 && set.reps !== null && set.multiplier > 0).length;
  return { comparableSets, volumeKgReps: comparableSets ? rounded(exercises.reduce((sum, row) => sum + row.volumeKgReps, 0), 2) : null, exercises };
}
export function exerciseProgress(previous: PerformedSet[], current: PerformedSet[]) {
  const best = (sets: PerformedSet[]) => {
    const map = new Map<string, PerformedSet>();
    for (const set of sets) {
      if (!set.completed || set.mode !== 'WEIGHT_REPS' || set.load === null || set.reps === null) continue;
      const old = map.get(set.exerciseId);
      if (!old || set.load > old.load! || (set.load === old.load && set.reps > old.reps!)) map.set(set.exerciseId, set);
    }
    return map;
  };
  const prior = best(previous); const recent = best(current);
  return [...recent].map(([exerciseId, set]) => {
    const before = prior.get(exerciseId);
    const comparison = before && before.reps === set.reps ? { kind: 'LOAD', delta: rounded(set.load! - before.load!, 2) }
      : before && before.load === set.load ? { kind: 'REPS', delta: set.reps! - before.reps! } : null;
    return { exerciseId, name: set.name, previous: before ? { loadKg: before.load, reps: before.reps } : null,
      current: { loadKg: set.load, reps: set.reps }, comparison };
  }).sort((a, b) => a.name.localeCompare(b.name) || a.exerciseId.localeCompare(b.exerciseId));
}
export type WeightFact = { weightKg: number; measuredAt: Date; id: string };
export function weights(facts: WeightFact[], period: Period, timezone: string) {
  const history = facts.filter((row) => inPeriod(localDate(row.measuredAt, timezone), period))
    .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime() || a.id.localeCompare(b.id))
    .map((row) => ({ date: localDate(row.measuredAt, timezone), weightKg: row.weightKg, measuredAt: row.measuredAt }));
  const start = history[0] ?? null; const end = history.at(-1) ?? null;
  return { start, end, current: end, deltaKg: history.length >= 2 ? rounded(end!.weightKg - start!.weightKg, 2) : null, history };
}
export type FeedbackFact = { sessionRpe: number; recoveryState: string; at: Date };
export function feedback(facts: FeedbackFact[]) {
  const recovery: Record<string, number> = {};
  for (const row of facts) recovery[row.recoveryState] = (recovery[row.recoveryState] ?? 0) + 1;
  return { sampleSize: facts.length, averageRpe: facts.length ? rounded(facts.reduce((sum, row) => sum + row.sessionRpe, 0) / facts.length) : null,
    recovery, trend: [...facts].sort((a, b) => a.at.getTime() - b.at.getTime()).map((row) => ({ at: row.at, rpe: row.sessionRpe })) };
}
export type DiscomfortFact = { bodyRegion: string; intensity: number | null; createdAt: Date; exerciseId: string | null; exerciseName: string | null };
export function discomfort(facts: DiscomfortFact[]) {
  const byRegion = new Map<string, DiscomfortFact[]>();
  for (const row of facts) byRegion.set(row.bodyRegion, [...(byRegion.get(row.bodyRegion) ?? []), row]);
  return [...byRegion].map(([bodyRegion, rows]) => ({ bodyRegion, count: rows.length,
    averageIntensity: rows.some((row) => row.intensity !== null) ? rounded(rows.reduce((sum, row) => sum + (row.intensity ?? 0), 0) / rows.filter((row) => row.intensity !== null).length) : null,
    lastReportedAt: new Date(Math.max(...rows.map((row) => row.createdAt.getTime()))),
    exercises: [...new Set(rows.filter((row) => row.exerciseId).map((row) => row.exerciseId!))].map((exerciseId) => ({ exerciseId,
      name: rows.find((row) => row.exerciseId === exerciseId)?.exerciseName ?? exerciseId, count: rows.filter((row) => row.exerciseId === exerciseId).length }))
  })).sort((a, b) => b.count - a.count || a.bodyRegion.localeCompare(b.bodyRegion));
}
export function duration(sessions: SessionFact[]) {
  const minutes = sessions.filter((session) => ['COMPLETED', 'PARTIAL'].includes(session.status) && session.startedAt && session.finishedAt)
    .map((session) => (session.finishedAt!.getTime() - session.startedAt!.getTime()) / 60_000)
    .filter((value) => value >= 1 && value <= 360);
  return { sampleSize: minutes.length, totalMinutes: minutes.length ? rounded(minutes.reduce((a, b) => a + b, 0), 0) : null,
    averageMinutes: minutes.length ? rounded(minutes.reduce((a, b) => a + b, 0) / minutes.length, 0) : null };
}
