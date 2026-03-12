import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Club, Player, Competition, ClubAlias, PlayerAlias, CompetitionAlias } from '@prisma/client';

type ClubWithAlias = Club & { alias?: ClubAlias | null };
type PlayerWithAlias = Player & { alias?: PlayerAlias | null; club?: ClubWithAlias };
type CompetitionWithAlias = Competition & { alias?: CompetitionAlias | null };

export interface ResolvedClub {
  id: number;
  name: string;
  shortName?: string;
  city?: string;
  logoUrl?: string;
  competitionId: number;
  isAliased: boolean;
}

export interface ResolvedPlayer {
  id: number;
  name: string;
  position: string;
  clubId: number;
  clubName?: string;
  currentPrice?: number;
  isAvailable: boolean;
  isAliased: boolean;
}

export interface ResolvedCompetition {
  id: number;
  name: string;
  shortName?: string;
  country: string;
  season: number;
  type: string;
  leagueSlug?: string;
  gwCount: number;
  isActive: boolean;
  isAliased: boolean;
}

@Injectable()
export class AliasService {
  constructor(private readonly prisma: PrismaService) {}

  resolveClub(club: ClubWithAlias): ResolvedClub {
    return {
      id: club.id,
      name: club.alias?.name ?? '[Unnamed]',
      shortName: club.alias?.shortName ?? undefined,
      city: club.alias?.city ?? undefined,
      logoUrl: club.logoUrl ?? undefined,
      competitionId: club.competitionId,
      isAliased: !!club.alias,
    };
  }

  resolvePlayer(player: PlayerWithAlias, currentPrice?: number): ResolvedPlayer {
    return {
      id: player.id,
      name: player.alias?.name ?? '[Unnamed]',
      position: player.position,
      clubId: player.clubId,
      clubName: player.club ? this.resolveClub(player.club).name : undefined,
      currentPrice,
      isAvailable: player.isAvailable,
      isAliased: !!player.alias,
    };
  }

  resolveCompetition(competition: CompetitionWithAlias): ResolvedCompetition {
    return {
      id: competition.id,
      name: competition.alias?.name ?? '[Unnamed]',
      shortName: competition.alias?.shortName ?? undefined,
      country: competition.country,
      season: competition.season,
      type: competition.type,
      leagueSlug: competition.leagueSlug ?? undefined,
      gwCount: competition.gwCount,
      isActive: competition.isActive,
      isAliased: !!competition.alias,
    };
  }

  async getUnaliasedSummary() {
    const [clubs, players, competitions] = await Promise.all([
      this.prisma.club.count({ where: { alias: null } }),
      this.prisma.player.count({ where: { alias: null } }),
      this.prisma.competition.count({ where: { alias: null } }),
    ]);
    return { clubs, players, competitions };
  }
}
