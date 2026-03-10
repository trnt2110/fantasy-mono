-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "Position" AS ENUM ('GK', 'DEF', 'MID', 'FWD');

-- CreateEnum
CREATE TYPE "GameweekStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'SCORING', 'FINISHED');

-- CreateEnum
CREATE TYPE "CompetitionType" AS ENUM ('LEAGUE', 'TOTAL');

-- CreateEnum
CREATE TYPE "ChipType" AS ENUM ('WILDCARD');

-- CreateTable
CREATE TABLE "Competition" (
    "id" INTEGER NOT NULL,
    "realName" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "type" "CompetitionType" NOT NULL DEFAULT 'LEAGUE',
    "leagueSlug" TEXT,
    "gwCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionAlias" (
    "competitionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitionAlias_pkey" PRIMARY KEY ("competitionId")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" INTEGER NOT NULL,
    "realName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "competitionId" INTEGER NOT NULL,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubAlias" (
    "clubId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "city" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubAlias_pkey" PRIMARY KEY ("clubId")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" INTEGER NOT NULL,
    "realName" TEXT NOT NULL,
    "position" "Position" NOT NULL,
    "clubId" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerAlias" (
    "playerId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerAlias_pkey" PRIMARY KEY ("playerId")
);

-- CreateTable
CREATE TABLE "PlayerCompetitionPrice" (
    "playerId" INTEGER NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "currentPrice" DECIMAL(5,1) NOT NULL,

    CONSTRAINT "PlayerCompetitionPrice_pkey" PRIMARY KEY ("playerId","competitionId")
);

-- CreateTable
CREATE TABLE "PlayerPriceHistory" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "price" DECIMAL(5,1) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gameweek" (
    "id" SERIAL NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "deadlineTime" TIMESTAMP(3) NOT NULL,
    "status" "GameweekStatus" NOT NULL DEFAULT 'SCHEDULED',
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Gameweek_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fixture" (
    "id" INTEGER NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "homeClubId" INTEGER NOT NULL,
    "awayClubId" INTEGER NOT NULL,
    "kickoffAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,

    CONSTRAINT "Fixture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPerformance" (
    "id" SERIAL NOT NULL,
    "playerId" INTEGER NOT NULL,
    "fixtureId" INTEGER,
    "gameweekId" INTEGER NOT NULL,
    "minutesPlayed" INTEGER NOT NULL DEFAULT 0,
    "goalsScored" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "cleanSheet" BOOLEAN NOT NULL DEFAULT false,
    "goalsConceded" INTEGER NOT NULL DEFAULT 0,
    "ownGoals" INTEGER NOT NULL DEFAULT 0,
    "penaltiesSaved" INTEGER NOT NULL DEFAULT 0,
    "penaltiesMissed" INTEGER NOT NULL DEFAULT 0,
    "yellowCards" INTEGER NOT NULL DEFAULT 0,
    "redCards" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "pointsBreakdown" JSONB NOT NULL,
    "isFinalised" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PlayerPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyTeam" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "budget" DECIMAL(6,1) NOT NULL DEFAULT 100.0,
    "totalValue" DECIMAL(6,1) NOT NULL DEFAULT 0.0,
    "formation" TEXT NOT NULL DEFAULT '4-4-2',
    "freeTransfers" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FantasyTeam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChipActivation" (
    "id" SERIAL NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "chip" "ChipType" NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "halfSeason" INTEGER NOT NULL,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChipActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerPick" (
    "id" SERIAL NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "playerId" INTEGER NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "isCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isViceCaptain" BOOLEAN NOT NULL DEFAULT false,
    "isStarting" BOOLEAN NOT NULL DEFAULT true,
    "benchOrder" INTEGER,
    "multiplier" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "PlayerPick_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" SERIAL NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "playerOutId" INTEGER NOT NULL,
    "playerInId" INTEGER NOT NULL,
    "priceOut" DECIMAL(5,1) NOT NULL,
    "priceIn" DECIMAL(5,1) NOT NULL,
    "isWildcard" BOOLEAN NOT NULL DEFAULT false,
    "pointsDeducted" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameweekScore" (
    "id" SERIAL NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "gameweekId" INTEGER NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalPoints" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER,
    "isFinalised" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "GameweekScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyLeague" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "competitionId" INTEGER NOT NULL,
    "adminTeamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FantasyLeague_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FantasyLeagueMembership" (
    "id" SERIAL NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "fantasyTeamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rank" INTEGER,

    CONSTRAINT "FantasyLeagueMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerPriceHistory_playerId_competitionId_changedAt_idx" ON "PlayerPriceHistory"("playerId", "competitionId", "changedAt");

-- CreateIndex
CREATE INDEX "Gameweek_competitionId_isCurrent_idx" ON "Gameweek"("competitionId", "isCurrent");

-- CreateIndex
CREATE UNIQUE INDEX "Gameweek_competitionId_number_key" ON "Gameweek"("competitionId", "number");

-- CreateIndex
CREATE INDEX "Fixture_gameweekId_status_idx" ON "Fixture"("gameweekId", "status");

-- CreateIndex
CREATE INDEX "Fixture_kickoffAt_idx" ON "Fixture"("kickoffAt");

-- CreateIndex
CREATE INDEX "PlayerPerformance_gameweekId_playerId_idx" ON "PlayerPerformance"("gameweekId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPerformance_playerId_fixtureId_key" ON "PlayerPerformance"("playerId", "fixtureId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_revoked_idx" ON "RefreshToken"("userId", "revoked");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyTeam_userId_competitionId_key" ON "FantasyTeam"("userId", "competitionId");

-- CreateIndex
CREATE INDEX "ChipActivation_fantasyTeamId_idx" ON "ChipActivation"("fantasyTeamId");

-- CreateIndex
CREATE UNIQUE INDEX "ChipActivation_fantasyTeamId_chip_halfSeason_key" ON "ChipActivation"("fantasyTeamId", "chip", "halfSeason");

-- CreateIndex
CREATE INDEX "PlayerPick_fantasyTeamId_gameweekId_idx" ON "PlayerPick"("fantasyTeamId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerPick_fantasyTeamId_playerId_gameweekId_key" ON "PlayerPick"("fantasyTeamId", "playerId", "gameweekId");

-- CreateIndex
CREATE INDEX "Transfer_fantasyTeamId_gameweekId_idx" ON "Transfer"("fantasyTeamId", "gameweekId");

-- CreateIndex
CREATE INDEX "GameweekScore_gameweekId_points_idx" ON "GameweekScore"("gameweekId", "points");

-- CreateIndex
CREATE UNIQUE INDEX "GameweekScore_fantasyTeamId_gameweekId_key" ON "GameweekScore"("fantasyTeamId", "gameweekId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyLeague_code_key" ON "FantasyLeague"("code");

-- CreateIndex
CREATE INDEX "FantasyLeagueMembership_leagueId_idx" ON "FantasyLeagueMembership"("leagueId");

-- CreateIndex
CREATE UNIQUE INDEX "FantasyLeagueMembership_leagueId_fantasyTeamId_key" ON "FantasyLeagueMembership"("leagueId", "fantasyTeamId");

-- AddForeignKey
ALTER TABLE "CompetitionAlias" ADD CONSTRAINT "CompetitionAlias_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Club" ADD CONSTRAINT "Club_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubAlias" ADD CONSTRAINT "ClubAlias_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerAlias" ADD CONSTRAINT "PlayerAlias_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCompetitionPrice" ADD CONSTRAINT "PlayerCompetitionPrice_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerCompetitionPrice" ADD CONSTRAINT "PlayerCompetitionPrice_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceHistory" ADD CONSTRAINT "PlayerPriceHistory_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPriceHistory" ADD CONSTRAINT "PlayerPriceHistory_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gameweek" ADD CONSTRAINT "Gameweek_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_homeClubId_fkey" FOREIGN KEY ("homeClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fixture" ADD CONSTRAINT "Fixture_awayClubId_fkey" FOREIGN KEY ("awayClubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPerformance" ADD CONSTRAINT "PlayerPerformance_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPerformance" ADD CONSTRAINT "PlayerPerformance_fixtureId_fkey" FOREIGN KEY ("fixtureId") REFERENCES "Fixture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPerformance" ADD CONSTRAINT "PlayerPerformance_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyTeam" ADD CONSTRAINT "FantasyTeam_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChipActivation" ADD CONSTRAINT "ChipActivation_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChipActivation" ADD CONSTRAINT "ChipActivation_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPick" ADD CONSTRAINT "PlayerPick_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPick" ADD CONSTRAINT "PlayerPick_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerPick" ADD CONSTRAINT "PlayerPick_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerOutId_fkey" FOREIGN KEY ("playerOutId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_playerInId_fkey" FOREIGN KEY ("playerInId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameweekScore" ADD CONSTRAINT "GameweekScore_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameweekScore" ADD CONSTRAINT "GameweekScore_gameweekId_fkey" FOREIGN KEY ("gameweekId") REFERENCES "Gameweek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLeague" ADD CONSTRAINT "FantasyLeague_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "Competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLeagueMembership" ADD CONSTRAINT "FantasyLeagueMembership_leagueId_fkey" FOREIGN KEY ("leagueId") REFERENCES "FantasyLeague"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLeagueMembership" ADD CONSTRAINT "FantasyLeagueMembership_fantasyTeamId_fkey" FOREIGN KEY ("fantasyTeamId") REFERENCES "FantasyTeam"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FantasyLeagueMembership" ADD CONSTRAINT "FantasyLeagueMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partial index for blank-GW PlayerPerformance uniqueness (fixtureId IS NULL)
-- Cannot be expressed in Prisma schema, added via raw SQL
CREATE UNIQUE INDEX IF NOT EXISTS "pp_blank_gw_unique" ON "PlayerPerformance" ("playerId", "gameweekId") WHERE "fixtureId" IS NULL;
