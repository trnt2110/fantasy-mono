import { IsInt, Min, Max } from 'class-validator';

export class BootstrapDto {
  @IsInt()
  @Min(2020)
  @Max(2030)
  season: number;
}
