import { IsBoolean, IsInt, IsOptional, Min, Max } from 'class-validator';

export class BootstrapDto {
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2030)
  season?: number;

  /**
   * Set to true to allow re-bootstrap when fantasy teams already exist.
   * WARNING: re-bootstrap may orphan existing picks/transfers if player IDs change.
   */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
