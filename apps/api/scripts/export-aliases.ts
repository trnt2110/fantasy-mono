import { PrismaClient } from '@prisma/client';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

function csvEscape(val: string | null | undefined): string {
  const s = val ?? '';
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const exportsDir = join(__dirname, '../exports');
  mkdirSync(exportsDir, { recursive: true });

  // ── Clubs ─────────────────────────────────────────────────────────────────
  const clubs = await prisma.club.findMany({
    include: { alias: true },
    orderBy: [{ competitionId: 'asc' }, { id: 'asc' }],
  });

  const clubLines = ['id,real_name,competition_id,alias_name,alias_short_name,alias_city'];
  for (const club of clubs) {
    clubLines.push(
      [
        club.id,
        csvEscape(club.realName),
        club.competitionId,
        csvEscape(club.alias?.name),
        csvEscape(club.alias?.shortName),
        csvEscape(club.alias?.city),
      ].join(','),
    );
  }
  writeFileSync(join(exportsDir, 'clubs.csv'), clubLines.join('\n'), 'utf-8');
  console.log(`Exported ${clubs.length} clubs → exports/clubs.csv`);

  // ── Players ───────────────────────────────────────────────────────────────
  const players = await prisma.player.findMany({
    include: { alias: true, club: true },
    orderBy: [{ clubId: 'asc' }, { id: 'asc' }],
  });

  const playerLines = ['id,real_name,position,club_id,club_real_name,alias_name'];
  for (const player of players) {
    playerLines.push(
      [
        player.id,
        csvEscape(player.realName),
        player.position,
        player.clubId,
        csvEscape(player.club.realName),
        csvEscape(player.alias?.name),
      ].join(','),
    );
  }
  writeFileSync(join(exportsDir, 'players.csv'), playerLines.join('\n'), 'utf-8');
  console.log(`Exported ${players.length} players → exports/players.csv`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
