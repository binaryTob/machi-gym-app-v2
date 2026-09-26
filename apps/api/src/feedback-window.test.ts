import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { feedbackWindow } from './feedback';

describe('feedback deadline', () => {
  const finished = new Date('2026-09-20T12:00:00.000Z');
  it('accepts completed and partial feedback until the exact 24-hour boundary', () => {
    expect(feedbackWindow('COMPLETED', finished, finished.getTime() + 24 * 60 * 60 * 1000).eligible).toBe(true);
    expect(feedbackWindow('PARTIAL', finished, finished.getTime() + 24 * 60 * 60 * 1000 + 1)).toEqual({ eligible: false, reason: 'EXPIRED', deadline: new Date('2026-09-21T12:00:00.000Z') });
  });
  it('never accepts unfinished, cancelled or skipped sessions', () => {
    for (const status of ['NOT_STARTED', 'IN_PROGRESS', 'CANCELLED', 'SKIPPED'] as const) expect(feedbackWindow(status, finished, finished.getTime()).reason).toBe('INVALID_STATUS');
  });
});
