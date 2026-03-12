import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt, IsObject, IsUUID } from 'class-validator';

export class SubmitPicksDto {
  @IsUUID()
  fantasyTeamId: string;

  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  startingPlayerIds: number[];

  @IsInt()
  captainId: number;

  @IsInt()
  viceCaptainId: number;

  // playerId (as string key) → bench position (1–4)
  @IsObject()
  benchOrder: Record<string, number>;
}
