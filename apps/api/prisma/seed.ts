import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedExercises, exerciseSeed } from './exercises';
import { seedDemoProgram } from './plans';
import { seedDemoOccurrence } from './workouts';
import { seedDemoFeedback } from './feedback';
import { seedDemoAnalytics } from './analytics';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo account and workout seed is development-only');
  const email = process.env.SEED_ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const studentPassword = process.env.SEED_STUDENT_PASSWORD;
  if (!email || !password || password.length < 12) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (12+ characters)');
  if (!studentPassword || studentPassword.length < 12) throw new Error('Set SEED_STUDENT_PASSWORD (12+ characters)');
  if (password === 'choose-a-long-local-password' || studentPassword === 'choose-another-long-local-password' || password === studentPassword) throw new Error('Replace example passwords with two distinct private development passwords before seeding');
  const db = new PrismaClient();
  try {
    let owner = await db.membership.findFirst({ where: { user: { email }, role: 'ADMIN', status: 'ACTIVE' } });
    if (!owner) await db.$transaction(async (tx) => {
      const organization = await tx.organization.create({ data: { name: 'Machi Gym' } });
      const user = await tx.user.create({ data: { email, displayName: 'Trainer', passwordHash: await argon2.hash(password) } });
      const membership = await tx.membership.create({ data: { userId: user.id, organizationId: organization.id, role: 'ADMIN' } });
      await tx.trainerProfile.create({ data: { organizationId: organization.id, membershipId: membership.id } });
    });
    owner = await db.membership.findFirstOrThrow({ where: { user: { email }, role: 'ADMIN', status: 'ACTIVE' } });
    await seedExercises(db, owner.organizationId, owner.id);
    await seedDemoProgram(db, owner.organizationId, owner.id, studentPassword);
    await seedDemoOccurrence(db, owner.organizationId, owner.id);
    await seedDemoFeedback(db, owner.organizationId, owner.id);
    await seedDemoAnalytics(db, owner.organizationId, owner.id);
    console.info(`Trainer-owner ${email} ready with ${exerciseSeed.length} curated exercises, a scheduled workout and one fictional feedback example.`);
  } finally { await db.$disconnect(); }
}
void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
