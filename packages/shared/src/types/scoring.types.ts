export interface PointsBreakdown {
  minutes: number;
  goals: number;
  assists: number;
  cleanSheet: number;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  total: number;
}

export interface ScoringEvent {
  type:
    | 'MINUTES'
    | 'GOAL'
    | 'ASSIST'
    | 'CLEAN_SHEET'
    | 'GOALS_CONCEDED'
    | 'OWN_GOAL'
    | 'PENALTY_SAVED'
    | 'PENALTY_MISSED'
    | 'YELLOW_CARD'
    | 'RED_CARD'
    | 'SAVES'
    | 'BONUS';
  points: number;
  detail?: string;
}

export interface PlayerPerformanceDto {
  id: number;
  playerId: number;
  playerName: string;
  fixtureId?: number;
  gameweekId: number;
  minutesPlayed: number;
  goalsScored: number;
  assists: number;
  cleanSheet: boolean;
  goalsConceded: number;
  ownGoals: number;
  penaltiesSaved: number;
  penaltiesMissed: number;
  yellowCards: number;
  redCards: number;
  saves: number;
  bonus: number;
  totalPoints: number;
  pointsBreakdown: PointsBreakdown;
  isFinalised: boolean;
}
