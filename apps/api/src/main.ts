import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './module';
import { Envelope, Problems, AppRequest } from './common';
import { randomUUID } from 'node:crypto';

export async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true });
  app.use((req: AppRequest, res: import('express').Response, next: () => void) => { req.requestId = randomUUID(); res.setHeader('X-Request-Id', req.requestId); next(); });
  app.useGlobalInterceptors(new Envelope());
  app.useGlobalFilters(new Problems());
  await app.listen(Number(process.env.API_PORT ?? 3001), '0.0.0.0');
}
void bootstrap();
