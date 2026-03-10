export const LEAGUE_IDS = {
  PREMIER_LEAGUE: 39,
  LA_LIGA: 140,
  SERIE_A: 135,
  BUNDESLIGA: 78,
  LIGUE_1: 61,
} as const;

export const LEAGUE_SLUGS: Record<number, string> = {
  [LEAGUE_IDS.PREMIER_LEAGUE]: 'premier-league',
  [LEAGUE_IDS.LA_LIGA]: 'la-liga',
  [LEAGUE_IDS.SERIE_A]: 'serie-a',
  [LEAGUE_IDS.BUNDESLIGA]: 'bundesliga',
  [LEAGUE_IDS.LIGUE_1]: 'ligue-1',
};

export const LEAGUE_GW_COUNTS: Record<number, number> = {
  [LEAGUE_IDS.PREMIER_LEAGUE]: 38,
  [LEAGUE_IDS.LA_LIGA]: 38,
  [LEAGUE_IDS.SERIE_A]: 38,
  [LEAGUE_IDS.BUNDESLIGA]: 34,
  [LEAGUE_IDS.LIGUE_1]: 34,
};

export const ALL_LEAGUE_IDS = Object.values(LEAGUE_IDS);

/** Sentinel ID for the cross-league Total mode competition */
export const TOTAL_MODE_COMPETITION_ID = 0;
