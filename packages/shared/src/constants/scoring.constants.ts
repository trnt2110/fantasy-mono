import { Position } from '../types/football.types';

export interface PositionScoringRules {
  goalPoints: number;
  cleanSheetPoints: number;
}

export const SCORING_RULES = {
  minutesPlayed: {
    oneToFiftyNine: 1,
    sixtyPlus: 2,
  },
  goals: {
    [Position.GK]: 10,
    [Position.DEF]: 6,
    [Position.MID]: 5,
    [Position.FWD]: 4,
  } as Record<Position, number>,
  assist: 3,
  cleanSheet: {
    [Position.GK]: 4,
    [Position.DEF]: 4,
    [Position.MID]: 1,
    [Position.FWD]: 0,
  } as Record<Position, number>,
  goalsConceded: {
    // -1 point per 2 goals conceded for GK and DEF
    everyTwoGoals: -1,
    applicablePositions: [Position.GK, Position.DEF] as Position[],
  },
  ownGoal: -2,
  penaltySaved: 5,
  penaltyMissed: -2,
  yellowCard: -1,
  redCard: -3,
  saves: {
    // 1 point per 3 saves for GK
    everyThreeSaves: 1,
    applicablePositions: [Position.GK] as Position[],
  },
  captainMultiplier: 2,
  extraTransferCost: -4,
} as const;
