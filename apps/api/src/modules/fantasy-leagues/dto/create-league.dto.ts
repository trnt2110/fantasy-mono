import { IsString, IsNotEmpty, IsInt, IsUUID, MaxLength } from 'class-validator';

export class CreateLeagueDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @IsInt()
  competitionId: number;

  @IsUUID()
  fantasyTeamId: string;
}
