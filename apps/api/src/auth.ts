import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject, Injectable, NotFoundException, Param, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { acceptInvitationSchema, emailSchema, loginSchema, resetPasswordSchema } from '@machi-gym/contracts';
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Response } from 'express';
import { AppRequest, Db, hashToken, input, Public, Roles } from './common';
import { z } from 'zod';

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
const token = () => randomBytes(32).toString('base64url');
const dummyPasswordHash = argon2.hash('unused-invalid-account-password');
const cookieOptions = () => ({ httpOnly: true, secure: process.env.SESSION_SECURE === 'true', sameSite: 'lax' as const, path: '/' });
function mfaKey(): Buffer {
  const value = process.env.MFA_ENCRYPTION_KEY;
  if (!value || !/^[a-f0-9]{64}$/i.test(value)) throw new Error('MFA_ENCRYPTION_KEY (64 hex characters) is required for MFA enrollment');
  return Buffer.from(value, 'hex');
}
function encrypt(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', mfaKey(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}
function decrypt(value: string): string {
  const parts = value.split('.');
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) throw new Error('Invalid factor');
  const decipher = createDecipheriv('aes-256-gcm', mfaKey(), Buffer.from(parts[0], 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[1], 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2], 'base64url')), decipher.final()]).toString('utf8');
}
function totp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', Buffer.from(secret, 'base64url')).update(buf).digest();
  const offset = (digest.at(-1) ?? 0) & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');
}
function validTotp(secret: string, code: string): boolean {
  const step = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((delta) => timingSafeEqual(Buffer.from(totp(secret, step + delta)), Buffer.from(code)));
}
function base32(bytes: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) { result += alphabet[(value >>> (bits -= 5)) & 31]; }
  }
  if (bits > 0) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

@Injectable()
export class AuthService {
  private readonly attempts = new Map<string, { count: number; until: number }>();
  constructor(@Inject(Db) private readonly db: Db) {}
  private incrementLimit(key: string, maximum: number): void {
    const now = Date.now();
    const previous = this.attempts.get(key);
    const current = !previous || previous.until < now ? { count: 0, until: now + 15 * 60_000 } : previous;
    if (current.count >= maximum) throw new HttpException('Too many attempts', 429);
    current.count++;
    this.attempts.set(key, current);
    if (this.attempts.size > 10_000) for (const [entry, value] of this.attempts) if (value.until < now) this.attempts.delete(entry);
  }
  private accountKey(ip: string, action: string, email: string): string { return `${action}:account:${ip}:${hashToken(email)}`; }
  private limitIp(ip: string, action: string): void { this.incrementLimit(`${action}:ip:${ip}`, 100); }
  async login(body: unknown, res: Response, ip: string): Promise<{ role: string; requiresMfaEnrollment: boolean }> {
    this.limitIp(ip, 'login');
    const { email, password, totpCode, recoveryCode } = input(loginSchema, body);
    this.incrementLimit(this.accountKey(ip, 'login', email), 12);
    const user = await this.db.user.findUnique({ where: { email }, include: { memberships: { where: { status: 'ACTIVE' }, include: { trainerProfile: true } }, mfaFactor: { include: { recoveryCodes: true } } } });
    // Equal-cost invalid credentials: do not reveal whether a user exists.
    const valid = await argon2.verify(user?.passwordHash ?? await dummyPasswordHash, password).catch(() => false);
    if (!user || !valid || user.disabledAt || user.memberships.length !== 1) throw new UnauthorizedException('Invalid credentials');
    const membership = user.memberships[0]!;
    if (user.mfaFactor?.verifiedAt) {
      const factor = user.mfaFactor;
      if (totpCode && validTotp(decrypt(factor.secretCiphertext), totpCode)) {
        // Valid current TOTP.
      } else if (recoveryCode) {
        const used = await this.db.mfaRecoveryCode.updateMany({ where: { factorId: factor.id, hash: hashToken(recoveryCode), usedAt: null }, data: { usedAt: new Date() } });
        if (used.count !== 1) throw new UnauthorizedException('Invalid credentials');
      } else throw new UnauthorizedException('MFA code required');
    }
    const raw = token();
    await this.db.authSession.create({ data: { userId: user.id, membershipId: membership.id, organizationId: membership.organizationId, tokenHash: hashToken(raw), idleExpiresAt: hours(24), absoluteExpiresAt: hours(24 * 7) } });
    res.cookie('machi_session', raw, cookieOptions());
    res.cookie('machi_csrf', token(), { ...cookieOptions(), httpOnly: false });
    this.attempts.delete(this.accountKey(ip, 'login', email));
    return { role: membership.role, requiresMfaEnrollment: membership.role === 'ADMIN' && !user.mfaFactor?.verifiedAt };
  }
  async logout(req: AppRequest, res: Response): Promise<{ ok: boolean }> {
    await this.db.authSession.update({ where: { id: req.actor!.sessionId }, data: { revokedAt: new Date() } });
    res.clearCookie('machi_session', cookieOptions());
    res.clearCookie('machi_csrf', { ...cookieOptions(), httpOnly: false });
    return { ok: true };
  }
  async accept(body: unknown): Promise<{ ok: boolean }> {
    const { token: raw, password } = input(acceptInvitationSchema, body);
    const invitation = await this.db.studentInvitation.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) throw new BadRequestException('Invalid or expired invitation');
    const passwordHash = await argon2.hash(password);
    try {
      await this.db.$transaction(async (tx) => {
        const claim = await tx.studentInvitation.updateMany({ where: { id: invitation.id, status: 'PENDING', expiresAt: { gt: new Date() } }, data: { status: 'ACCEPTED', acceptedAt: new Date() } });
        if (claim.count !== 1) throw new ConflictException('Invitation already used');
        const student = await tx.studentProfile.findUniqueOrThrow({ where: { id: invitation.studentId } });
        if (student.membershipId) throw new ConflictException('Student already activated');
        const user = await tx.user.create({ data: { email: invitation.email, displayName: student.displayName, passwordHash } });
        const membership = await tx.membership.create({ data: { userId: user.id, organizationId: invitation.organizationId, role: 'STUDENT' } });
        await tx.studentProfile.update({ where: { id: student.id }, data: { membershipId: membership.id } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Account already exists or invitation already used');
      throw error;
    }
    return { ok: true };
  }
  async requestReset(body: unknown, ip: string): Promise<{ ok: boolean }> {
    this.limitIp(ip, 'reset');
    const { email } = input(emailSchema, body);
    this.incrementLimit(this.accountKey(ip, 'reset', email), 12);
    // No user-existence disclosure. The owning trainer issues a one-time link via authenticated channel.
    return { ok: true };
  }
  async issueReset(studentId: string, actor: NonNullable<AppRequest['actor']>): Promise<{ resetToken: string }> {
    const student = await this.db.studentProfile.findFirst({ where: { id: studentId, organizationId: actor.organizationId, ...(actor.role === 'TRAINER' ? { assignments: { some: { trainerId: actor.trainerId!, active: true } } } : {}) }, include: { membership: true } });
    if (!student?.membership) throw new NotFoundException();
    const raw = token();
    await this.db.passwordResetToken.create({ data: { userId: student.membership.userId, tokenHash: hashToken(raw), expiresAt: hours(1) } });
    return { resetToken: raw };
  }
  async reset(body: unknown): Promise<{ ok: boolean }> {
    const { token: raw, password } = input(resetPasswordSchema, body);
    const reset = await this.db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(raw) } });
    if (!reset || reset.usedAt || reset.expiresAt < new Date()) throw new BadRequestException('Invalid or expired reset token');
    const passwordHash = await argon2.hash(password);
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictException('Token already used');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.authSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }
  async enroll(userId: string): Promise<{ secret: string; uri: string }> {
    const user = await this.db.user.findUniqueOrThrow({ where: { id: userId }, include: { mfaFactor: true } });
    if (user.mfaFactor?.verifiedAt) throw new ConflictException('MFA already enabled');
    const secret = randomBytes(20).toString('base64url');
    await this.db.mfaFactor.upsert({ where: { userId }, update: { secretCiphertext: encrypt(secret) }, create: { userId, secretCiphertext: encrypt(secret) } });
    return { secret: base32(Buffer.from(secret, 'base64url')), uri: `otpauth://totp/Machi%20Gym:${encodeURIComponent(user.email)}?secret=${base32(Buffer.from(secret, 'base64url'))}&issuer=Machi%20Gym` };
  }
  async verifyMfa(userId: string, body: unknown): Promise<{ recoveryCodes: string[] }> {
    const { code } = input(z.object({ code: z.string().regex(/^\d{6}$/) }).strict(), body);
    const factor = await this.db.mfaFactor.findUnique({ where: { userId } });
    if (!factor || factor.verifiedAt || !validTotp(decrypt(factor.secretCiphertext), code)) throw new BadRequestException('Invalid MFA code');
    const codes = Array.from({ length: 8 }, () => token().slice(0, 16));
    await this.db.$transaction(async (tx) => {
      await tx.mfaFactor.update({ where: { id: factor.id }, data: { verifiedAt: new Date() } });
      await tx.mfaRecoveryCode.createMany({ data: codes.map((raw) => ({ factorId: factor.id, hash: hashToken(raw) })) });
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    return { recoveryCodes: codes };
  }
}

@Controller()
export class AuthController {
  constructor(@Inject(AuthService) private readonly service: AuthService, @Inject(Db) private readonly db: Db) {}
  @Post('auth/login') @Public() @HttpCode(200) login(@Body() body: unknown, @Res({ passthrough: true }) res: Response, @Req() req: AppRequest) { return this.service.login(body, res, req.ip ?? 'unknown'); }
  @Post('auth/logout') @HttpCode(200) logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) { return this.service.logout(req, res); }
  @Post('auth/forgot-password') @Public() @HttpCode(200) forgot(@Body() body: unknown, @Req() req: AppRequest) { return this.service.requestReset(body, req.ip ?? 'unknown'); }
  @Post('auth/reset-password') @Public() @HttpCode(200) reset(@Body() body: unknown) { return this.service.reset(body); }
  @Post('auth/accept-invitation') @Public() @HttpCode(200) accept(@Body() body: unknown) { return this.service.accept(body); }
  @Post('auth/mfa/enroll') @Roles('ADMIN') enroll(@Req() req: AppRequest) { return this.service.enroll(req.actor!.userId); }
  @Post('auth/mfa/verify') @Roles('ADMIN') verify(@Req() req: AppRequest, @Body() body: unknown) { return this.service.verifyMfa(req.actor!.userId, body); }
  @Post('students/:id/reset-link') @Roles('ADMIN', 'TRAINER') resetLink(@Param('id') id: string, @Req() req: AppRequest) { return this.service.issueReset(id, req.actor!); }
  @Get('me') async me(@Req() req: AppRequest) {
    const actor = req.actor!;
    const user = await this.db.user.findUniqueOrThrow({ where: { id: actor.userId }, select: { displayName: true, email: true, mfaFactor: { select: { verifiedAt: true } } } });
    return { ...actor, displayName: user.displayName, email: user.email, mfaEnabled: Boolean(user.mfaFactor?.verifiedAt) };
  }
}
