export enum Position {
  GK = 'GK',
  DEF = 'DEF',
  MID = 'MID',
  FWD = 'FWD',
}

export enum GameweekStatus {
  SCHEDULED = 'SCHEDULED',
  ACTIVE = 'ACTIVE',
  SCORING = 'SCORING',
  FINISHED = 'FINISHED',
}

export enum CompetitionType {
  LEAGUE = 'LEAGUE',
  TOTAL = 'TOTAL',
}

export interface CompetitionDto {
  id: number;
  name: string;
  shortName?: string;
  country: string;
  season: number;
  type: CompetitionType;
  gwCount: number;
  isActive: boolean;
  isAliased: boolean;
}

export interface ClubDto {
  id: number;
  name: string;
  shortName?: string;
  city?: string;
  logoUrl?: string;
  competitionId: number;
  isAliased: boolean;
}

export interface PlayerDto {
  id: number;
  name: string;
  position: Position;
  clubId: number;
  clubName: string;
  price: number;
  isAvailable: boolean;
  isAliased: boolean;
}

export interface FixtureDto {
  id: number;
  competitionId: number;
  gameweekId: number;
  homeClub: ClubDto;
  awayClub: ClubDto;
  kickoffAt: string;
  status: string;
  homeGoals?: number;
  awayGoals?: number;
}

export interface GameweekDto {
  id: number;
  competitionId: number;
  number: number;
  deadlineTime: string;
  status: GameweekStatus;
  isCurrent: boolean;
}
