import { IsBoolean, IsInt, IsOptional, IsUUID } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  fantasyTeamId: string;

  @IsInt()
  playerOutId: number;

  @IsInt()
  playerInId: number;

  @IsOptional()
  @IsBoolean()
  activateWildcard?: boolean = false;
}
