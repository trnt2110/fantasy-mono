import { IsInt, IsPositive, Min, Max, IsOptional } from 'class-validator';

export class CreateBotsDto {
  @IsInt() @IsPositive() count: number;           // number of bots to create
  @IsInt() @IsPositive() competitionId: number;   // e.g. 39 for Premier League
}

export class OpenGameweekDto {
  @IsOptional() @IsInt() @Min(5) @Max(1440) minutesFromNow: number = 60;
}
