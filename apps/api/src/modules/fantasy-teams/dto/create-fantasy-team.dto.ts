import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsObject,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateFantasyTeamDto {
  @IsInt()
  competitionId: number;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name: string;

  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(15)
  @ArrayMaxSize(15)
  playerIds: number[];

  @IsString()
  formation: string;

  @IsArray()
  @IsInt({ each: true })
  @ArrayMinSize(11)
  @ArrayMaxSize(11)
  startingIds: number[];

  @IsInt()
  captainId: number;

  @IsInt()
  viceCaptainId: number;

  // playerId (as string key) → bench position (1–4)
  @IsObject()
  benchOrder: Record<string, number>;
}
