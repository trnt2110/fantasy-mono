import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { Position } from '@prisma/client';

export class GetPlayersDto {
  @Type(() => Number)
  @IsInt()
  competitionId: number;

  @IsOptional()
  @IsEnum(Position)
  position?: Position;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clubId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  maxPrice?: number;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
