import { PlayerDto } from './football.types';

export interface FantasyTeamDto {
  id: string;
  userId: string;
  competitionId: number;
  name: string;
  budget: number;
  totalValue: number;
  formation: string;
  freeTransfers: number;
}

export interface PlayerPickDto {
  id: number;
  fantasyTeamId: string;
  player: PlayerDto;
  gameweekId: number;
  isCaptain: boolean;
  isViceCaptain: boolean;
  isStarting: boolean;
  benchOrder?: number;
  multiplier: number;
}

export interface TransferDto {
  id: number;
  fantasyTeamId: string;
  gameweekId: number;
  playerOut: PlayerDto;
  playerIn: PlayerDto;
  priceOut: number;
  priceIn: number;
  isWildcard: boolean;
  pointsDeducted: number;
  createdAt: string;
}

export interface GameweekScoreDto {
  id: number;
  fantasyTeamId: string;
  fantasyTeamName: string;
  gameweekId: number;
  points: number;
  totalPoints: number;
  rank?: number;
  isFinalised: boolean;
}

export interface LeaderboardEntryDto {
  rank: number;
  fantasyTeamId: string;
  fantasyTeamName: string;
  userId: string;
  username: string;
  totalPoints: number;
  gameweekPoints?: number;
}

export interface FantasyLeagueDto {
  id: number;
  name: string;
  code: string;
  competitionId: number;
  adminTeamId: string;
  memberCount: number;
}
