import { Controller, Get, Inject } from '@nestjs/common';
import { Db, Public } from './common';
@Controller('health')
export class HealthController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get() @Public() async health(): Promise<{ status: string }> { await this.db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
}
