import { IsString, IsOptional, MinLength } from 'class-validator';

export class UpsertClubAliasDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  shortName?: string;

  @IsOptional()
  @IsString()
  city?: string;
}
