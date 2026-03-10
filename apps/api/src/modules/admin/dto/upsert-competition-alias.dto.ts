import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpsertCompetitionAliasDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  shortName?: string;
}
