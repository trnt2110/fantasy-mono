import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RolesGuard } from './common/guards/roles.guard';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { AuthModule } from './modules/auth/auth.module';
import { AliasModule } from './modules/alias/alias.module';
import { AdminModule } from './modules/admin/admin.module';
import { SyncModule } from './modules/sync/sync.module';
import { ApiFootballModule } from './infrastructure/api-football/api-football.module';
import { CompetitionsModule } from './modules/competitions/competitions.module';
import { ClubsModule } from './modules/clubs/clubs.module';
import { PlayersModule } from './modules/players/players.module';
import { FixturesModule } from './modules/fixtures/fixtures.module';
import { GameweeksModule } from './modules/gameweeks/gameweeks.module';
import { FantasyTeamsModule } from './modules/fantasy-teams/fantasy-teams.module';
import { PicksModule } from './modules/picks/picks.module';
import { TransfersModule } from './modules/transfers/transfers.module';
import { ScoringModule } from './modules/scoring/scoring.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { FantasyLeaguesModule } from './modules/fantasy-leagues/fantasy-leagues.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: path.resolve(__dirname, '..', '.env') }),
    PrismaModule,
    RedisModule,
    ApiFootballModule,
    AuthModule,
    AliasModule,
    AdminModule,
    SyncModule,
    CompetitionsModule,
    ClubsModule,
    PlayersModule,
    FixturesModule,
    GameweeksModule,
    FantasyTeamsModule,
    PicksModule,
    TransfersModule,
    ScoringModule,
    LeaderboardModule,
    FantasyLeaguesModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
