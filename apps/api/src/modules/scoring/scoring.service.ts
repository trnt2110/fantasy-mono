import { Injectable, Logger } from '@nestjs/common';
import { Position as PrismaPosition } from '@prisma/client';
import { Position, SCORING_RULES } from '@fantasy/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

const VALID_FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];

interface PerformanceInput {
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
}

interface PointsResult {
  totalPoints: number;
  pointsBreakdown: Record<string, number>;
}

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculate fantasy points for a single player performance.
   * This is the single source of truth for scoring logic.
   */
  calculatePlayerPoints(perf: PerformanceInput, position: PrismaPosition | Position): PointsResult {
    const pos = position as Position;
    let total = 0;
    const breakdown: Record<string, number> = {};

    const add = (key: string, pts: number) => {
      if (pts !== 0) {
        breakdown[key] = pts;
        total += pts;
      }
    };

    // Minutes played
    if (perf.minutesPlayed >= 60) {
      add('minutes', SCORING_RULES.minutesPlayed.sixtyPlus);
    } else if (perf.minutesPlayed > 0) {
      add('minutes', SCORING_RULES.minutesPlayed.oneToFiftyNine);
    }

    // Goals scored
    if (perf.goalsScored > 0) {
      add('goals', SCORING_RULES.goals[pos] * perf.goalsScored);
    }

    // Assists
    if (perf.assists > 0) {
      add('assists', SCORING_RULES.assist * perf.assists);
    }

    // Clean sheet (requires >= 60 minutes played)
    const cleanSheetPts = SCORING_RULES.cleanSheet[pos];
    if (perf.cleanSheet && perf.minutesPlayed >= 60 && cleanSheetPts > 0) {
      add('cleanSheet', cleanSheetPts);
    }

    // Goals conceded (GK + DEF only): -1 per every 2 goals conceded
    if (
      SCORING_RULES.goalsConceded.applicablePositions.includes(pos) &&
      perf.goalsConceded >= 2
    ) {
      add(
        'goalsConceded',
        Math.floor(perf.goalsConceded / 2) * SCORING_RULES.goalsConceded.everyTwoGoals,
      );
    }

    // Saves (GK only): +1 per every 3 saves
    if (
      SCORING_RULES.saves.applicablePositions.includes(pos) &&
      perf.saves >= 3
    ) {
      add('saves', Math.floor(perf.saves / 3) * SCORING_RULES.saves.everyThreeSaves);
    }

    // Penalty saved
    if (perf.penaltiesSaved > 0) {
      add('penaltySaved', SCORING_RULES.penaltySaved * perf.penaltiesSaved);
    }

    // Penalty missed
    if (perf.penaltiesMissed > 0) {
      add('penaltyMissed', SCORING_RULES.penaltyMissed * perf.penaltiesMissed);
    }

    // Yellow card
    if (perf.yellowCards > 0) {
      add('yellowCard', SCORING_RULES.yellowCard * perf.yellowCards);
    }

    // Red card
    if (perf.redCards > 0) {
      add('redCard', SCORING_RULES.redCard * perf.redCards);
    }

    // Own goals
    if (perf.ownGoals > 0) {
      add('ownGoal', SCORING_RULES.ownGoal * perf.ownGoals);
    }

    // Bonus (API-Football BPS: value is 0, 1, 2, or 3 points directly)
    if (perf.bonus > 0) {
      add('bonus', perf.bonus);
    }

    return { totalPoints: total, pointsBreakdown: breakdown };
  }

  /**
   * Finalise scores for all fantasy teams in a gameweek.
   * Called by the gameweek-finalise BullMQ job (Phase 3).
   */
  async finaliseGameweekScores(gameweekId: number): Promise<void> {
    const gameweek = await this.prisma.gameweek.findUnique({
      where: { id: gameweekId },
      include: { competition: true },
    });
    if (!gameweek) throw new Error(`Gameweek ${gameweekId} not found`);

    // Load all PlayerPerformances for this GW (keyed by playerId, summed for double GWs)
    const rawPerformances = await this.prisma.playerPerformance.findMany({
      where: { gameweekId, isFinalised: true },
      include: { player: { select: { position: true } } },
    });

    // Sum points per player (handles double GW — two fixtures)
    const playerPoints = new Map<number, number>();
    for (const perf of rawPerformances) {
      const prev = playerPoints.get(perf.playerId) ?? 0;
      playerPoints.set(perf.playerId, prev + perf.totalPoints);
    }

    // Minutes played per player (sum across fixtures for double GW)
    const playerMinutes = new Map<number, number>();
    for (const perf of rawPerformances) {
      const prev = playerMinutes.get(perf.playerId) ?? 0;
      playerMinutes.set(perf.playerId, prev + perf.minutesPlayed);
    }

    // Load all fantasy teams in this competition
    const teams = await this.prisma.fantasyTeam.findMany({
      where: { competitionId: gameweek.competitionId },
    });

    for (const team of teams) {
      try {
        await this.finaliseTeamScore(team, gameweekId, playerPoints, playerMinutes);
      } catch (err) {
        this.logger.error(`Failed to finalise score for team ${team.id}: ${err}`);
      }
    }

    // Rank all teams by totalPoints DESC
    await this.rankTeams(gameweekId, gameweek.competitionId);
  }

  private async finaliseTeamScore(
    team: { id: string; freeTransfers: number },
    gameweekId: number,
    playerPoints: Map<number, number>,
    playerMinutes: Map<number, number>,
  ) {
    const picks = await this.prisma.playerPick.findMany({
      where: { fantasyTeamId: team.id, gameweekId },
      include: { player: { select: { position: true } } },
      orderBy: { benchOrder: 'asc' },
    });

    if (picks.length === 0) return;

    const starters = picks.filter((p) => p.isStarting);
    const bench = picks.filter((p) => !p.isStarting).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));

    // Apply auto-substitutions
    const finalStarters = this.applyAutoSubs(starters, bench, playerMinutes);

    // Determine captain/vice-captain multiplier
    const captainPick = finalStarters.find((p) => p.isCaptain);
    const vcPick = finalStarters.find((p) => p.isViceCaptain);
    const captainPlayed = captainPick ? (playerMinutes.get(captainPick.playerId) ?? 0) > 0 : false;
    const vcPlayed = vcPick ? (playerMinutes.get(vcPick.playerId) ?? 0) > 0 : false;

    // Sum starter points with multipliers
    let gwPoints = 0;
    for (const starter of finalStarters) {
      const pts = playerPoints.get(starter.playerId) ?? 0;
      let multiplier = 1;
      if (starter.isCaptain && captainPlayed) multiplier = 2;
      else if (starter.isViceCaptain && !captainPlayed && vcPlayed) multiplier = 2;
      gwPoints += pts * multiplier;
    }

    // Subtract transfer deductions
    const transfers = await this.prisma.transfer.findMany({
      where: { fantasyTeamId: team.id, gameweekId },
      select: { pointsDeducted: true },
    });
    const totalDeduction = transfers.reduce((sum, t) => sum + t.pointsDeducted, 0);
    gwPoints -= totalDeduction;

    // Get previous total
    const prevScore = await this.prisma.gameweekScore.findFirst({
      where: { fantasyTeamId: team.id },
      orderBy: { gameweek: { number: 'desc' } },
      select: { totalPoints: true },
    });
    const prevTotal = prevScore?.totalPoints ?? 0;

    await this.prisma.gameweekScore.upsert({
      where: { fantasyTeamId_gameweekId: { fantasyTeamId: team.id, gameweekId } },
      create: {
        fantasyTeamId: team.id,
        gameweekId,
        points: gwPoints,
        totalPoints: prevTotal + gwPoints,
        isFinalised: true,
      },
      update: {
        points: gwPoints,
        totalPoints: prevTotal + gwPoints,
        isFinalised: true,
      },
    });
  }

  private applyAutoSubs(
    starters: any[],
    bench: any[],
    playerMinutes: Map<number, number>,
  ): any[] {
    const result = [...starters];
    const remainingBench = [...bench];

    for (let i = 0; i < result.length; i++) {
      const starter = result[i];
      const minutes = playerMinutes.get(starter.playerId) ?? 0;
      if (minutes > 0) continue; // played — no auto-sub needed

      // GK exception: starting GK can only be replaced by bench GK (bench slot 1)
      if (starter.player.position === 'GK') {
        const benchGkIdx = remainingBench.findIndex(
          (b) => b.player.position === 'GK' && (playerMinutes.get(b.playerId) ?? 0) > 0,
        );
        if (benchGkIdx !== -1) {
          result[i] = remainingBench[benchGkIdx];
          remainingBench.splice(benchGkIdx, 1);
        }
        continue;
      }

      // Outfield: find first bench player who played > 0 and keeps formation valid
      for (let j = 0; j < remainingBench.length; j++) {
        const sub = remainingBench[j];
        if (sub.player.position === 'GK') continue; // bench GK reserved for GK slot
        if ((playerMinutes.get(sub.playerId) ?? 0) === 0) continue; // bench player didn't play

        // Test if the swap keeps a valid formation
        const testStarters = [...result];
        testStarters[i] = sub;
        if (this.isValidFormation(testStarters)) {
          result[i] = sub;
          remainingBench.splice(j, 1);
          break;
        }
      }
    }

    return result;
  }

  private isValidFormation(starters: { player: { position: string } }[]): boolean {
    const gk = starters.filter((p) => p.player.position === 'GK').length;
    const def = starters.filter((p) => p.player.position === 'DEF').length;
    const mid = starters.filter((p) => p.player.position === 'MID').length;
    const fwd = starters.filter((p) => p.player.position === 'FWD').length;
    if (gk !== 1) return false;
    return VALID_FORMATIONS.includes(`${def}-${mid}-${fwd}`);
  }

  private async rankTeams(gameweekId: number, competitionId: number) {
    const scores = await this.prisma.gameweekScore.findMany({
      where: { gameweekId, fantasyTeam: { competitionId } },
      orderBy: { totalPoints: 'desc' },
      select: { id: true },
    });

    await this.prisma.$transaction(
      scores.map((score, index) =>
        this.prisma.gameweekScore.update({
          where: { id: score.id },
          data: { rank: index + 1 },
        }),
      ),
    );
  }
}
