import { BadRequestException, CanActivate, Catch, ExceptionFilter, ExecutionContext, ForbiddenException, HttpException, Inject, Injectable, NestInterceptor, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Reflector } from '@nestjs/core';
import { MembershipRole, PrismaClient } from '@prisma/client';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { Observable, map } from 'rxjs';
import { z } from 'zod';

export const hashToken = (value: string): string => createHash('sha256').update(value).digest('hex');
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata('public', true);
export const Roles = (...roles: MembershipRole[]): MethodDecorator => SetMetadata('roles', roles);
export type Actor = { userId: string; membershipId: string; organizationId: string; role: MembershipRole; studentId: string | null; trainerId: string | null; sessionId: string };
export type AppRequest = Request & { actor?: Actor; requestId?: string };
export function input<S extends z.ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_ERROR', errors: parsed.error.flatten() });
  return parsed.data;
}
export function requireId(value: string): string {
  if (!z.string().min(1).max(128).safeParse(value).success) throw new BadRequestException({ code: 'INVALID_ID' });
  return value;
}

@Injectable()
export class Db extends PrismaClient {
  async onModuleInit(): Promise<void> { await this.$connect(); }
  async onModuleDestroy(): Promise<void> { await this.$disconnect(); }
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(@Inject(Db) private readonly db: Db, @Inject(Reflector) private readonly reflector: Reflector) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>('public', [context.getHandler(), context.getClass()])) return true;
    const req = context.switchToHttp().getRequest<AppRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    const token = parseCookie(req.headers.cookie ?? '').machi_session;
    if (!token) throw new UnauthorizedException();
    const session = await this.db.authSession.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true, membership: { include: { studentProfile: true, trainerProfile: true } } } });
    const now = Date.now();
    if (!session || session.revokedAt || session.idleExpiresAt.getTime() < now || session.absoluteExpiresAt.getTime() < now || session.user.disabledAt || session.membership.status !== 'ACTIVE') throw new UnauthorizedException();
    req.actor = { userId: session.userId, membershipId: session.membershipId, organizationId: session.organizationId, role: session.membership.role, studentId: session.membership.studentProfile?.id ?? null, trainerId: session.membership.trainerProfile?.id ?? null, sessionId: session.id };
    const roles = this.reflector.getAllAndOverride<MembershipRole[]>('roles', [context.getHandler(), context.getClass()]);
    if (roles && !roles.includes(req.actor.role)) throw new ForbiddenException();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin !== process.env.WEB_ORIGIN) throw new ForbiddenException('Invalid origin');
      const csrfCookie = parseCookie(req.headers.cookie ?? '').machi_csrf;
      const csrfHeader = req.headers['x-csrf-token'];
      if (!csrfCookie || typeof csrfHeader !== 'string' || csrfCookie.length !== csrfHeader.length || !timingSafeEqual(Buffer.from(csrfCookie), Buffer.from(csrfHeader))) throw new ForbiddenException('Invalid CSRF token');
    }
    // Sliding idle window never extends beyond absolute expiry.
    if (session.idleExpiresAt.getTime() - now < 12 * 60 * 60 * 1000) {
      await this.db.authSession.update({ where: { id: session.id }, data: { idleExpiresAt: new Date(Math.min(now + 24 * 60 * 60 * 1000, session.absoluteExpiresAt.getTime())) } });
    }
    res.setHeader('Cache-Control', 'no-store');
    return true;
  }
}
export const guardProvider = { provide: APP_GUARD, useClass: SessionGuard };

@Injectable()
export class OriginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AppRequest>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
    if (req.headers.origin !== process.env.WEB_ORIGIN) throw new ForbiddenException('Invalid origin');
    return true;
  }
}
export const originProvider = { provide: APP_GUARD, useClass: OriginGuard };

@Injectable()
export class Envelope implements NestInterceptor {
  intercept(context: ExecutionContext, next: { handle(): Observable<unknown> }): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    return next.handle().pipe(map((data) => ({ data, meta: { requestId: req.requestId } })));
  }
}

@Catch()
export class Problems implements ExceptionFilter {
  catch(error: unknown, host: import('@nestjs/common').ArgumentsHost): void {
    const req = host.switchToHttp().getRequest<AppRequest>();
    const res = host.switchToHttp().getResponse<Response>();
    const status = error instanceof HttpException ? error.getStatus() : 500;
    const detail = error instanceof HttpException ? error.getResponse() : null;
    const extra = typeof detail === 'object' && detail !== null ? detail as Record<string, unknown> : {};
    const code = typeof extra.code === 'string' ? extra.code : status === 500 ? 'INTERNAL_ERROR' : `HTTP_${status}`;
    if (status === 500) console.error('Internal request failure', { requestId: req.requestId, errorType: error instanceof Error ? error.name : 'unknown' });
    res.status(status).json({ type: `https://machi.gym/problems/${code.toLowerCase().replaceAll('_', '-')}`, title: status === 500 ? 'Unexpected error' : 'Request rejected', status, code, detail: status === 500 ? 'Try again later.' : typeof extra.message === 'string' ? extra.message : undefined, instance: req.url, requestId: req.requestId ?? randomUUID(), errors: extra.errors ?? [] });
  }
}
