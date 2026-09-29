import { describe, expect, it } from 'vitest';
import { adherence, discomfort, duration, exerciseProgress, feedback, inPeriod, localDate, periodFor, volume, weights, type PerformedSet } from './analytics-calculations';

const now = new Date('2026-09-28T02:30:00Z');
const month = periodFor('current-month', 'America/Argentina/Buenos_Aires', now);
const session = (scheduledDate: string, status: string, extra = {}) => ({ scheduledDate, status, ...extra });
const set = (exerciseId: string, load: number | null, reps: number | null, extra: Partial<PerformedSet> = {}): PerformedSet => ({
  exerciseId, name: exerciseId, load, reps, mode: 'WEIGHT_REPS', convention: 'TOTAL_EXTERNAL_LOAD', multiplier: 1,
  completed: true, performedAt: now, sessionId: 'session', ...extra,
});
const weight = (id: string, weightKg: number, date: string) => ({ id, weightKg, measuredAt: new Date(date) });
describe('version 1 deterministic analytics formulas', () => {
  it('uses real calendar weeks and months in the student timezone, including midnight boundaries', () => {
    expect(month).toEqual({ start: '2026-09-01', end: '2026-10-01', label: 'current-month' });
    expect(periodFor('previous-month', 'UTC', now).start).toBe('2026-08-01');
    expect(periodFor('current-week', 'UTC', now).start).toBe('2026-09-28');
    expect(periodFor('previous-week', 'UTC', now).end).toBe('2026-09-28');
    expect(periodFor('last-30-days', 'UTC', now).start).toBe('2026-08-30');
    expect(periodFor('custom', 'UTC', now, '2026-02-28', '2026-03-01').end).toBe('2026-03-02');
    expect(() => periodFor('custom', 'UTC', now, '2026-02-30', '2026-03-01')).toThrow();
    expect(localDate(new Date('2026-10-01T02:59:00Z'), 'America/Argentina/Buenos_Aires')).toBe('2026-09-30');
    expect(localDate(new Date('2026-11-01T04:30:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(localDate(new Date('2026-11-01T06:30:00Z'), 'America/New_York')).toBe('2026-11-01');
    expect(periodFor('previous-month', 'UTC', new Date('2024-03-01T00:01:00Z')).end).toBe('2024-03-01');
    expect(inPeriod('2026-10-01', month)).toBe(false);
  });
  it('counts completed, partial, skipped, overdue pending; exempts early administrative cancellation and future sessions', () => {
    expect(adherence([session('2026-09-05', 'COMPLETED'), session('2026-09-06', 'PARTIAL'), session('2026-09-07', 'SKIPPED'),
      session('2026-09-08', 'CANCELLED', { cancellationActorType: 'ADMIN', cancelledAt: new Date('2026-09-07T10:00:00Z') }),
      session('2026-09-09', 'CANCELLED', { cancellationActorType: 'STUDENT', cancelledAt: new Date('2026-09-08T10:00:00Z') }),
      session('2026-09-10', 'NOT_STARTED'), session('2026-09-30', 'NOT_STARTED')], month, '2026-09-27', 'UTC'))
      .toMatchObject({ eligible: 5, scheduled: 6, completed: 1, partial: 1, skipped: 1, cancelled: 2, pending: 1, adherencePercent: 40 });
    expect(adherence([session('2026-09-01', 'COMPLETED')], month, '2026-09-27', 'UTC').adherencePercent).toBe(100);
    expect(adherence([], month, '2026-09-27', 'UTC').adherencePercent).toBeNull();
  });
  it('uses completed actual sets only; ignores missing load, bodyweight-only, zero external load and suggestions', () => {
    expect(volume([set('a', 70, 8), set('a', 30, 10, { multiplier: 2, convention: 'PER_IMPLEMENT' }),
      set('a', 90, 8, { completed: false }), set('b', null, 9), set('c', 0, 8), set('d', 20, 10, { mode: 'REPS_ONLY' })]))
      .toMatchObject({ volumeKgReps: 1160, comparableSets: 2 });
    expect(volume([set('a', null, 8)]).volumeKgReps).toBeNull();
  });
  it('compares canonical exercise sets by load and repetitions without opaque strength percentages', () => {
    const previous = [set('same-id', 70, 8), set('other-id', 40, 10)];
    expect(exerciseProgress(previous, [set('same-id', 70, 10)])[0]?.comparison).toEqual({ kind: 'REPS', delta: 2 });
    expect(exerciseProgress(previous, [set('same-id', 77.5, 8)])[0]?.comparison).toEqual({ kind: 'LOAD', delta: 7.5 });
    expect(exerciseProgress(previous, [set('same-id', 80, 6)])[0]?.comparison).toBeNull();
    expect(exerciseProgress(previous, [set('new-id', 70, 8)])[0]?.previous).toBeNull();
    expect(exerciseProgress(previous, [set('same-id', 99, 8, { completed: false })])).toEqual([]);
  });
  it('uses only recorded weight in the requested calendar period and requires two measurements for change', () => {
    const list = [weight('a', 82.4, '2026-08-31T23:00:00Z'), weight('b', 81.7, '2026-09-01T12:00:00Z'), weight('c', 80.8, '2026-09-30T12:00:00Z'), weight('d', 80, '2026-10-01T12:00:00Z')];
    expect(weights(list, month, 'UTC')).toMatchObject({ deltaKg: -0.9, start: { weightKg: 81.7 }, end: { weightKg: 80.8 } });
    expect(weights(list.slice(0, 2), month, 'UTC').deltaKg).toBeNull();
    expect(weights([], month, 'UTC').end).toBeNull();
  });
  it('averages submitted RPE and distributes recovery without deriving it from workload', () => {
    expect(feedback([{ sessionRpe: 8, recoveryState: 'TIRED', at: now }, { sessionRpe: 7, recoveryState: 'TIRED', at: now }, { sessionRpe: 6, recoveryState: 'RECOVERED', at: now }]))
      .toMatchObject({ sampleSize: 3, averageRpe: 7, recovery: { TIRED: 2, RECOVERED: 1 } });
    expect(feedback([]).averageRpe).toBeNull();
  });
  it('groups multiple reported locations, intensity, last occurrence and associated exercises', () => {
    const reports = discomfort([{ bodyRegion: 'RIGHT_KNEE', intensity: 4, createdAt: now, exerciseId: 'squat', exerciseName: 'Sentadilla' },
      { bodyRegion: 'RIGHT_KNEE', intensity: 6, createdAt: new Date('2026-09-20T10:00:00Z'), exerciseId: 'squat', exerciseName: 'Sentadilla' },
      { bodyRegion: 'LOWER_BACK', intensity: 2, createdAt: now, exerciseId: null, exerciseName: null }]);
    expect(reports[0]).toMatchObject({ bodyRegion: 'RIGHT_KNEE', count: 2, averageIntensity: 5, lastReportedAt: now, exercises: [{ exerciseId: 'squat', count: 2 }] });
    expect(reports[1]).toMatchObject({ bodyRegion: 'LOWER_BACK', count: 1, averageIntensity: 2 });
    expect(discomfort([{ bodyRegion: 'LEFT_KNEE', intensity: null, createdAt: now, exerciseId: null, exerciseName: null }])[0])
      .toMatchObject({ count: 1, averageIntensity: null });
  });
  it('requires reliable start and end and deterministically excludes <1 or >360 minutes', () => {
    expect(duration([session('2026-09-01', 'COMPLETED', { startedAt: new Date('2026-09-01T10:00:00Z'), finishedAt: new Date('2026-09-01T10:50:00Z') }),
      session('2026-09-02', 'PARTIAL', { startedAt: new Date('2026-09-02T10:00:00Z'), finishedAt: new Date('2026-09-02T10:30:00Z') }),
      session('2026-09-03', 'COMPLETED', { startedAt: new Date('2026-09-03T10:00:00Z') }),
      session('2026-09-04', 'COMPLETED', { startedAt: new Date('2026-09-04T10:00:00Z'), finishedAt: new Date('2026-09-05T10:00:00Z') })]))
      .toEqual({ sampleSize: 2, totalMinutes: 80, averageMinutes: 40 });
    expect(duration([]).averageMinutes).toBeNull();
  });
});
