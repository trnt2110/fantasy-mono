import { IsString, IsNotEmpty, IsUUID, Length } from 'class-validator';

export class JoinLeagueDto {
  @IsString()
  @IsNotEmpty()
  @Length(8, 8)
  code: string;

  @IsUUID()
  fantasyTeamId: string;
}
