// Envelope wrappers
export interface ApiResponse<T> { data: T }
export interface ApiListResponse<T> { data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } }

// Auth
export interface AuthTokens { accessToken: string; refreshToken: string }
export interface AuthUser { id: string; email: string; username: string; role: 'USER' | 'ADMIN' }

// Competitions
export interface ApiCompetition {
  id: number; name: string; shortName: string; country: string
  type: 'LEAGUE' | 'TOTAL'; leagueSlug: string | null; gwCount: number; season: number; isAliased: boolean
}

// Clubs
export interface ApiClub {
  id: number; name: string; shortName: string; city?: string; logoUrl?: string; isAliased: boolean
}

// Players
export interface ApiPlayer {
  id: number; name: string; position: 'GKP' | 'DEF' | 'MID' | 'FWD'
  clubId: number; clubName: string; currentPrice: number; isAvailable: boolean; isAliased: boolean
}
export interface ApiPlayerDetail extends ApiPlayer {
  ownershipPct: number
}
export interface ApiPlayerPerformance {
  gameweekId: number; gameweekNumber: number; fixtureId: number | null
  minutesPlayed: number; goalsScored: number; assists: number; cleanSheet: boolean
  goalsConceded: number; ownGoals: number; penaltiesSaved: number; penaltiesMissed: number
  yellowCards: number; redCards: number; saves: number
  bonus: number; totalPoints: number
  pointsBreakdown: Record<string, number>; isFinalised: boolean
}

// Gameweeks
export interface ApiGameweek {
  id: number; competitionId: number; number: number
  deadlineTime: string; status: 'SCHEDULED' | 'ACTIVE' | 'SCORING' | 'FINISHED'; isCurrent: boolean
}
export interface ApiGameweekSummary {
  id: number; number: number
  status: 'SCHEDULED' | 'ACTIVE' | 'SCORING' | 'FINISHED'; deadlineTime: string
}

// Fixtures
export interface ApiFixture {
  id: number; gameweekId: number
  homeClubId: number; homeClubName: string
  awayClubId: number; awayClubName: string
  kickoffAt: string; status: string
  homeGoals: number | null; awayGoals: number | null
}

// Fantasy teams
export interface ApiFantasyTeam {
  id: string; userId: string; username: string; competitionId: number
  name: string; budget: number; totalValue: number; formation: string; freeTransfers: number
}
export interface ApiFantasyTeamScore {
  gameweekId: number; gameweekNumber: number; points: number; totalPoints: number; rank: number | null; isFinalised: boolean
}

// Picks
export type PickPosition = 'GKP' | 'DEF' | 'MID' | 'FWD'
export interface ApiPick {
  playerId: number; playerName: string; position: PickPosition; clubId: number; clubName: string
  isStarting: boolean; isCaptain: boolean; isViceCaptain: boolean
  benchOrder: number | null; multiplier: number; gwPoints: number | null
}

// Leaderboard
export interface ApiLeaderboardEntry {
  rank: number; fantasyTeamId: string; teamName: string; username: string; gwPoints: number; totalPoints: number
}

// Fantasy Leagues
export interface ApiFantasyLeague {
  id: number; name: string; code: string; competitionId: number
  memberCount: number; joinedAt: string
}
export interface ApiLeagueStanding extends ApiLeaderboardEntry {
  joinedAt: string
}

// Admin — alias management
export interface AdminClub {
  id: number; realName: string; name: string; shortName?: string; city?: string
  competitionId: number; isAliased: boolean
}
export interface AdminPlayer {
  id: number; realName: string; name: string; position: string
  clubId: number; clubRealName?: string; isAliased: boolean
}
export interface AdminCompetition {
  id: number; realName: string; name: string; shortName?: string
  country: string; isAliased: boolean
}
export interface AdminListResponse<T> { items: T[]; total: number; page: number; limit: number }
export interface ImportError { row: number; id: number | string; error: string }
export interface ImportSummary { processed: number; skipped: number; errors: ImportError[] }
export interface ImportResult { clubs?: ImportSummary; players?: ImportSummary; competitions?: ImportSummary }

// ─── Simulation ───────────────────────────────────────────────────────────────

export interface SimulationCurrentGw {
  id: number
  number: number
  status: 'SCHEDULED' | 'ACTIVE' | 'SCORING' | 'FINISHED'
  deadlineTime: string
}

export interface SimulationFinishedGw {
  id: number
  number: number
  teamsScored: number
  deadlineTime: string
}

export interface SimulationStatus {
  botCount: number
  competitionId: number
  currentGameweek: SimulationCurrentGw | null
  finishedGameweeks: SimulationFinishedGw[]
}

export interface CreateBotsResult { created: number; skipped: number; botIds: string[] }
export interface OpenGwResult { gameweekId: number; deadlineTime: string }
export interface BotPicksResult { bots: number; picksSeeded: number }
export interface FinalizeGwResult { gameweekId: number; teamsScored: number; nextGameweekId: number | null }
