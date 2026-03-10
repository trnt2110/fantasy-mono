import { Global, Module } from '@nestjs/common';
import { ApiFootballClient } from './api-football.client';

@Global()
@Module({
  providers: [ApiFootballClient],
  exports: [ApiFootballClient],
})
export class ApiFootballModule {}
