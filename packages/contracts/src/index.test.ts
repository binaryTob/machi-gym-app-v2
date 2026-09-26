import { describe, expect, it } from 'vitest';
import { studentSelfProfileSchema, studentProfileSchema } from './index';
describe('write boundaries', () => {
  it('rejects privileged and unknown student fields', () => {
    expect(studentSelfProfileSchema.safeParse({ version: 1, status: 'READY' }).success).toBe(false);
    expect(studentProfileSchema.safeParse({ version: 1, trainerNotes: 'x' }).success).toBe(false);
  });
});
