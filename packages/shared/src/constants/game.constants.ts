export const SQUAD_SIZE = 15;
export const STARTING_XI_SIZE = 11;
export const BENCH_SIZE = 4;

export const BUDGET = 100.0;

export const MAX_PER_CLUB = 3;

export const POSITION_LIMITS = {
  GK: { min: 2, max: 2 },
  DEF: { min: 5, max: 5 },
  MID: { min: 5, max: 5 },
  FWD: { min: 3, max: 3 },
} as const;

export const STARTING_POSITION_LIMITS = {
  GK: { min: 1, max: 1 },
  DEF: { min: 3, max: 5 },
  MID: { min: 2, max: 5 },
  FWD: { min: 1, max: 3 },
} as const;

export const FREE_TRANSFERS_PER_GW = 1;
export const MAX_BANKED_FREE_TRANSFERS = 2;
export const EXTRA_TRANSFER_COST = -4;

export const WILDCARD_HALF_SEASON_BOUNDARY = 19; // GW1-19 = half 1; GW20-38 = half 2

export const DEADLINE_OFFSET_MINUTES = 120; // deadline = first kickoff - 120 minutes (FPL standard)
