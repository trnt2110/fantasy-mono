import { IsString, MinLength } from 'class-validator';

export class UpsertPlayerAliasDto {
  @IsString()
  @MinLength(1)
  name: string;
}
