# Alias Management System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete alias management workflow — PES-style naming reference, CSV export/import, and an admin UI — so all seeded players and clubs can be given fictional display names without using trademarked real names.

**Architecture:** Export script reads DB directly via Prisma and writes two CSVs (clubs, players). After an LLM fills the alias columns, the admin uploads them via a browser page that posts to `POST /admin/import/aliases`. The admin page also supports inline single-cell editing for corrections. A separate `/admin` route outside AppShell is role-gated on the frontend.

**Tech Stack:** NestJS + Prisma (backend), `@nestjs/platform-express` Multer (file upload), React 19 + TanStack Query v5 + Tailwind (frontend), ts-node (export script)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/references/alias_names_sample.md` | Create | PES/WE naming reference |
| `apps/api/scripts/export-aliases.ts` | Create | Dump clubs + players to CSV |
| `apps/api/.gitignore` | Create | Exclude `exports/` dir |
| `apps/api/src/modules/alias/alias.service.ts` | Modify | Add `resolveClubForAdmin`, `resolvePlayerForAdmin`, `resolveCompetitionForAdmin` |
| `apps/api/src/modules/admin/admin.service.ts` | Modify | Extend list endpoints with filter+search; add `importAliases` |
| `apps/api/src/modules/admin/admin.controller.ts` | Modify | Add filter+search params; add import endpoint |
| `apps/api/src/modules/admin/admin.service.spec.ts` | Create | Unit tests for CSV import logic |
| `apps/web/src/api/types.ts` | Modify | Add admin types |
| `apps/web/src/api/hooks/useAdminAliases.ts` | Create | All admin alias hooks |
| `apps/web/src/App.tsx` | Modify | Add `/admin` route |
| `apps/web/src/pages/admin/AdminPage.tsx` | Create | Layout + tab state |
| `apps/web/src/pages/admin/EditableCell.tsx` | Create | Reusable inline-edit cell |
| `apps/web/src/pages/admin/AdminClubs.tsx` | Create | Clubs tab: table + CSV upload |
| `apps/web/src/pages/admin/AdminPlayers.tsx` | Create | Players tab: table + CSV upload |
| `apps/web/src/pages/admin/AdminCompetitions.tsx` | Create | Competitions tab: table, inline edit only |

---

## Task 1: PES/WE Reference Document

**Files:**
- Create: `docs/references/alias_names_sample.md`

- [ ] **Step 1: Create the reference document**

```markdown
# PES / Winning Eleven Alias Naming Guide

Reference for creating fictional-but-recognisable in-game names for clubs, players, and competitions
without using trademarked real names.

---

## Club Naming Patterns

### 1. Geographic Replacement
Replace the club name with a city or region descriptor.

| Real Name | PES Alias | Short |
|---|---|---|
| Manchester United | Man Red | MRD |
| Manchester City | Man Blue | MBL |
| Liverpool | Merseyside Red | MRS |
| Arsenal | North London | NLN |
| Chelsea | West London | WLN |
| Tottenham Hotspur | North London W | NLW |
| West Ham United | East London | ELN |
| Aston Villa | Midlands Villa | MVL |
| Nottingham Forest | East Midlands | EMD |
| Newcastle United | Tyneside | TYN |

### 2. Color / Kit Identity
Use the club's traditional colors or nickname.

| Real Name | PES Alias | Short |
|---|---|---|
| Juventus | Bianconeri | BJN |
| AC Milan | Rossoneri | ROS |
| Inter Milan | Nerazzurri | NER |
| AS Roma | Giallorossi | GRS |
| Lazio | Biancocelesti | BCL |
| Bayern Munich | Die Roten | DRT |
| Borussia Dortmund | Die Gelben | DGB |
| PSG | Les Bleus de Paris | LBP |

### 3. Abbreviated City + Suffix
Short city code with a generic suffix.

| Real Name | PES Alias | Short |
|---|---|---|
| Real Madrid | Mad. Blanco | MAB |
| Atletico Madrid | Mad. Rojo | MAR |
| FC Barcelona | Barca FC | BAR |
| Sevilla | Sev. FC | SEV |
| Valencia | Val. CF | VAL |
| Villarreal | Yellow Sub. | YSB |

### 4. Phonetic Near-Miss
Slightly altered spelling that sounds similar.

| Real Name | PES Alias |
|---|---|
| Chelsea | Chelsa |
| Liverpool | Liverpule |
| Manchester | Manchesta |
| Arsenal | Arsene |
| Marseille | Marseil |

---

## Player Naming Patterns

### 1. First Name Only (most common for stars)
Works when first name is distinctive enough.

| Real Name | PES Alias |
|---|---|
| Kylian Mbappé | Kylian |
| Erling Haaland | Erling |
| Vinicius Jr. | Vinicius |
| Pedri González | Pedri |
| Jude Bellingham | Bellingham |
| Lamine Yamal | Lamine |
| Phil Foden | Foden |

### 2. Phonetic Respelling
Alter the spelling so it sounds similar but differs enough.

| Real Name | PES Alias |
|---|---|
| Mohamed Salah | Saleh |
| Kevin De Bruyne | De Bryan |
| Trent Alexander-Arnold | T. Arnold |
| Bukayo Saka | Saka (kept) |
| Bruno Fernandes | B. Fernandez |
| Bernardo Silva | B. Silverio |
| Rodri | Rodry |
| Bernardo | Bernando |

### 3. Surname Only (safe when surname not trademarked)
Most surnames are safe to keep as-is.

| Real Name | PES Alias |
|---|---|
| Son Heung-min | Son |
| Ederson | Ederson (kept) |
| Alisson | Alisson (kept) |
| Virgil van Dijk | Van Dijk |
| Rúben Dias | Dias |

### 4. Nationality Marker (fallback for unknowns)
Use for players with no distinctive name.

| Template | Meaning |
|---|---|
| Il Portiere | Italian GK |
| El Portero | Spanish GK |
| Der Torwart | German GK |
| Le Gardien | French GK |
| El Defensa | Spanish DEF |
| Il Difensore | Italian DEF |
| El Delantero | Spanish FWD |
| L'Attaquant | French FWD |

---

## Competition Naming Patterns

| Real Name | PES-style Alias | Short |
|---|---|---|
| Premier League | English Premier | EPL |
| La Liga | Spanish Primera | SPA |
| Serie A | Italian Serie | ITA |
| Bundesliga | German Bundesliga | GER |
| Ligue 1 | French Ligue | FRA |
| Champions League | Champions Cup | CCU |
| Europa League | Euro Challenge | ECH |

---

## Rules of Thumb

1. **Stars keep first names** — Mbappé, Haaland, Vinicius are recognisable by first name alone.
2. **Short names stay** — Son, Saka, Rodri are short enough to keep with minor respelling.
3. **Club names preserve feel** — A red club stays "Red", a city club keeps the city.
4. **Short codes are 3 letters** — All uppercase, city or color abbreviation.
5. **No real trademarks in alias** — "Manchester United" → OK to use "Man" but not "United FC".
```

- [ ] **Step 2: Commit**

```bash
git add docs/references/alias_names_sample.md
git commit -m "docs: add PES/WE alias naming reference guide"
```

---

## Task 2: Export Script

**Files:**
- Create: `apps/api/scripts/export-aliases.ts`
- Create: `apps/api/.gitignore`

- [ ] **Step 1: Create `apps/api/.gitignore`**

```
exports/
```

- [ ] **Step 2: Create `apps/api/scripts/export-aliases.ts`**

```typescript
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
```

- [ ] **Step 3: Run the script to verify it works (API server does NOT need to be running)**

```bash
cd apps/api && npx ts-node --project tsconfig.json scripts/export-aliases.ts
```

Expected output (counts depend on seeded data):
```
Exported 20 clubs → exports/clubs.csv
Exported 500 players → exports/players.csv
```

Verify the files exist and open correctly in a spreadsheet or text editor.

- [ ] **Step 4: Commit**

```bash
cd apps/api
git add .gitignore scripts/export-aliases.ts
git commit -m "feat: add alias CSV export script"
```

---

## Task 3: AliasService — Admin Resolve Methods

The admin page needs to show both `realName` (for context) and alias name (editable). The existing `resolveClub/Player/Competition` methods deliberately hide `realName`. Add separate admin variants that include it.

**Files:**
- Modify: `apps/api/src/modules/alias/alias.service.ts`

- [ ] **Step 1: Add admin response interfaces and resolve methods to `alias.service.ts`**

Add after the existing `ResolvedCompetition` interface (around line 41):

```typescript
export interface AdminResolvedClub {
  id: number;
  realName: string;
  name: string;
  shortName?: string;
  city?: string;
  competitionId: number;
  isAliased: boolean;
}

export interface AdminResolvedPlayer {
  id: number;
  realName: string;
  name: string;
  position: string;
  clubId: number;
  clubRealName?: string;
  isAliased: boolean;
}

export interface AdminResolvedCompetition {
  id: number;
  realName: string;
  name: string;
  shortName?: string;
  country: string;
  isAliased: boolean;
}
```

Add after the existing `resolveCompetition` method (before `getUnaliasedSummary`):

```typescript
resolveClubForAdmin(club: ClubWithAlias): AdminResolvedClub {
  return {
    id: club.id,
    realName: club.realName,
    name: club.alias?.name ?? '[Unnamed]',
    shortName: club.alias?.shortName ?? undefined,
    city: club.alias?.city ?? undefined,
    competitionId: club.competitionId,
    isAliased: !!club.alias,
  };
}

resolvePlayerForAdmin(player: PlayerWithAlias): AdminResolvedPlayer {
  return {
    id: player.id,
    realName: player.realName,
    name: player.alias?.name ?? '[Unnamed]',
    position: player.position,
    clubId: player.clubId,
    clubRealName: player.club?.realName ?? undefined,
    isAliased: !!player.alias,
  };
}

resolveCompetitionForAdmin(competition: CompetitionWithAlias): AdminResolvedCompetition {
  return {
    id: competition.id,
    realName: competition.realName,
    name: competition.alias?.name ?? '[Unnamed]',
    shortName: competition.alias?.shortName ?? undefined,
    country: competition.country,
    isAliased: !!competition.alias,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/modules/alias/alias.service.ts
git commit -m "feat(alias): add admin resolve methods with realName"
```

---

## Task 4: Extend Admin List Endpoints + Add Import

**Files:**
- Modify: `apps/api/src/modules/admin/admin.service.ts`
- Modify: `apps/api/src/modules/admin/admin.controller.ts`
- Create: `apps/api/src/modules/admin/admin.service.spec.ts`

### Step A — Extend the service

- [ ] **Step 1: Write the failing unit test first**

Create `apps/api/src/modules/admin/admin.service.spec.ts`:

```typescript
import { AdminService } from './admin.service';

// Minimal mock — only the methods we need
function makeService(overrides: Partial<any> = {}): AdminService {
  const prisma = {
    club: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    player: { findMany: jest.fn(), count: jest.fn(), findUnique: jest.fn() },
    clubAlias: { upsert: jest.fn() },
    playerAlias: { upsert: jest.fn() },
    ...overrides.prisma,
  } as any;

  const aliasService = {
    resolveClubForAdmin: (c: any) => ({ id: c.id, realName: c.realName, name: c.alias?.name ?? '[Unnamed]', isAliased: !!c.alias }),
    resolvePlayerForAdmin: (p: any) => ({ id: p.id, realName: p.realName, name: p.alias?.name ?? '[Unnamed]', isAliased: !!p.alias }),
    resolveCompetitionForAdmin: jest.fn(),
    getUnaliasedSummary: jest.fn(),
    resolveClub: jest.fn(),
    resolvePlayer: jest.fn(),
    resolveCompetition: jest.fn(),
    ...overrides.aliasService,
  } as any;

  return new AdminService(prisma, aliasService, {} as any, {} as any, {} as any, {} as any, {} as any);
}

describe('AdminService.importAliases', () => {
  it('skips rows with empty alias_name', async () => {
    const svc = makeService();
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n1,Real Club,39,,, ';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.skipped).toBe(1);
    expect(result.clubs?.processed).toBe(0);
  });

  it('processes rows with alias_name, upserts alias', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({ id: 1 });
    const svc = makeService({ prisma: { club: { findUnique }, clubAlias: { upsert } } });
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n1,Real Club,39,Alias Club,ACL,London';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.processed).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { clubId: 1 },
      create: expect.objectContaining({ name: 'Alias Club', shortName: 'ACL', city: 'London' }),
    }));
  });

  it('records error for unknown club id', async () => {
    const findUnique = jest.fn().mockResolvedValue(null);
    const svc = makeService({ prisma: { club: { findUnique } } });
    const csv = 'id,real_name,competition_id,alias_name,alias_short_name,alias_city\n999,Ghost Club,39,Ghost,GHO,';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ clubs: [file] });
    expect(result.clubs?.errors).toHaveLength(1);
    expect(result.clubs?.errors[0].error).toMatch(/not found/i);
  });

  it('processes player CSV with alias_name', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const findUnique = jest.fn().mockResolvedValue({ id: 5 });
    const svc = makeService({ prisma: { player: { findUnique }, playerAlias: { upsert } } });
    const csv = 'id,real_name,position,club_id,club_real_name,alias_name\n5,Real Player,MF,1,Real Club,Alias Player';
    const file = { buffer: Buffer.from(csv) } as any;
    const result = await svc.importAliases({ players: [file] });
    expect(result.players?.processed).toBe(1);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { playerId: 5 },
      create: expect.objectContaining({ name: 'Alias Player' }),
    }));
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd apps/api && pnpm test -- --testPathPattern=admin.service
```

Expected: FAIL — `importAliases` does not exist yet.

- [ ] **Step 3: Add `importAliases` and CSV parser + extend list methods in `admin.service.ts`**

Add a CSV parser helper **above** the `AdminService` class:

```typescript
interface ImportError { row: number; id: number | string; error: string }
interface ImportSummary { processed: number; skipped: number; errors: ImportError[] }

function parseCsvRows(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const values = splitCsvRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim(); });
    return row;
  });
}

function splitCsvRow(line: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQ = !inQ; }
    } else if (ch === ',' && !inQ) {
      result.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur);
  return result;
}
```

Replace the existing `getUnaliasedClubs` and `getUnaliasedPlayers` methods with versions that accept `filter` and `search`. Also add `getCompetitions`, `importAliases`. Replace/extend `admin.service.ts` methods section (after the constructor):

```typescript
// ── Alias summary ─────────────────────────────────────────────────────────

getAliasesSummary() {
  return this.aliasService.getUnaliasedSummary();
}

// ── Club list ─────────────────────────────────────────────────────────────

async getClubs(page: number, limit: number, search: string, filter: 'all' | 'unaliased' | 'aliased') {
  const skip = (page - 1) * limit;

  const aliasFilter =
    filter === 'unaliased' ? { alias: null } :
    filter === 'aliased'   ? { NOT: { alias: null } } :
    {};

  const searchFilter = search
    ? { OR: [
        { realName: { contains: search, mode: 'insensitive' as const } },
        { alias: { name: { contains: search, mode: 'insensitive' as const } } },
      ]}
    : {};

  const where = { AND: [aliasFilter, searchFilter].filter(f => Object.keys(f).length > 0) };

  const [items, total] = await Promise.all([
    this.prisma.club.findMany({ where, skip, take: limit, include: { alias: true }, orderBy: { id: 'asc' } }),
    this.prisma.club.count({ where }),
  ]);
  return { items: items.map((c) => this.aliasService.resolveClubForAdmin(c)), total, page, limit };
}

// Keep old name for backward compat with getAliasesSummary callers
async getUnaliasedClubs(page: number, limit: number) {
  return this.getClubs(page, limit, '', 'unaliased');
}

// ── Player list ───────────────────────────────────────────────────────────

async getPlayers(page: number, limit: number, search: string, filter: 'all' | 'unaliased' | 'aliased') {
  const skip = (page - 1) * limit;

  const aliasFilter =
    filter === 'unaliased' ? { alias: null } :
    filter === 'aliased'   ? { NOT: { alias: null } } :
    {};

  const searchFilter = search
    ? { OR: [
        { realName: { contains: search, mode: 'insensitive' as const } },
        { alias: { name: { contains: search, mode: 'insensitive' as const } } },
      ]}
    : {};

  const where = { AND: [aliasFilter, searchFilter].filter(f => Object.keys(f).length > 0) };

  const [items, total] = await Promise.all([
    this.prisma.player.findMany({
      where,
      skip,
      take: limit,
      include: { alias: true, club: { include: { alias: true } } },
      orderBy: { id: 'asc' },
    }),
    this.prisma.player.count({ where }),
  ]);
  return { items: items.map((p) => this.aliasService.resolvePlayerForAdmin(p)), total, page, limit };
}

async getUnaliasedPlayers(page: number, limit: number) {
  return this.getPlayers(page, limit, '', 'unaliased');
}

// ── Competition list ──────────────────────────────────────────────────────

async getCompetitions(filter: 'all' | 'unaliased' | 'aliased') {
  const where =
    filter === 'unaliased' ? { alias: null } :
    filter === 'aliased'   ? { NOT: { alias: null } } :
    {};
  const items = await this.prisma.competition.findMany({ where, include: { alias: true } });
  return items.map((c) => this.aliasService.resolveCompetitionForAdmin(c));
}

async getUnaliasedCompetitions() {
  return this.getCompetitions('unaliased');
}

// ── Import ────────────────────────────────────────────────────────────────

async importAliases(files: {
  clubs?: Express.Multer.File[];
  players?: Express.Multer.File[];
}): Promise<{ clubs?: ImportSummary; players?: ImportSummary }> {
  const result: { clubs?: ImportSummary; players?: ImportSummary } = {};
  if (files.clubs?.[0]) result.clubs = await this.importClubsCsv(files.clubs[0].buffer.toString('utf-8'));
  if (files.players?.[0]) result.players = await this.importPlayersCsv(files.players[0].buffer.toString('utf-8'));
  return result;
}

private async importClubsCsv(content: string): Promise<ImportSummary> {
  const rows = parseCsvRows(content);
  let processed = 0, skipped = 0;
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (!row.alias_name?.trim()) { skipped++; continue; }

    const id = parseInt(row.id, 10);
    if (isNaN(id)) { errors.push({ row: rowNum, id: row.id, error: 'Invalid ID' }); continue; }

    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) { errors.push({ row: rowNum, id, error: `Club ${id} not found` }); continue; }

    await this.prisma.clubAlias.upsert({
      where: { clubId: id },
      create: { clubId: id, name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null, city: row.alias_city?.trim() || null },
      update: { name: row.alias_name.trim(), shortName: row.alias_short_name?.trim() || null, city: row.alias_city?.trim() || null },
    });
    processed++;
  }

  return { processed, skipped, errors };
}

private async importPlayersCsv(content: string): Promise<ImportSummary> {
  const rows = parseCsvRows(content);
  let processed = 0, skipped = 0;
  const errors: ImportError[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    if (!row.alias_name?.trim()) { skipped++; continue; }

    const id = parseInt(row.id, 10);
    if (isNaN(id)) { errors.push({ row: rowNum, id: row.id, error: 'Invalid ID' }); continue; }

    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) { errors.push({ row: rowNum, id, error: `Player ${id} not found` }); continue; }

    await this.prisma.playerAlias.upsert({
      where: { playerId: id },
      create: { playerId: id, name: row.alias_name.trim() },
      update: { name: row.alias_name.trim() },
    });
    processed++;
  }

  return { processed, skipped, errors };
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

```bash
cd apps/api && pnpm test -- --testPathPattern=admin.service
```

Expected: 4 tests PASS.

### Step B — Update the controller

- [ ] **Step 5: Install `@types/multer` for TypeScript types**

```bash
cd apps/api && pnpm add -D @types/multer
```

- [ ] **Step 6: Update `admin.controller.ts`**

Replace the `getUnaliasedClubs`, `getUnaliasedPlayers`, and `getUnaliasedCompetitions` handlers and add the import endpoint. The full updated controller:

```typescript
import {
  Controller,
  DefaultValuePipe,
  Get,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Post,
  HttpCode,
  HttpStatus,
  Query,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminService } from './admin.service';
import { UpsertClubAliasDto } from './dto/upsert-club-alias.dto';
import { UpsertPlayerAliasDto } from './dto/upsert-player-alias.dto';
import { UpsertCompetitionAliasDto } from './dto/upsert-competition-alias.dto';
import { BootstrapDto } from './dto/bootstrap.dto';

@Controller('admin')
@Roles(Role.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Alias overview ───────────────────────────────────────────────────────

  @Get('aliases')
  getAliasesSummary() {
    return this.adminService.getAliasesSummary();
  }

  @Get('aliases/clubs')
  getClubs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return this.adminService.getClubs(page, limit, search, filter);
  }

  @Get('aliases/players')
  getPlayers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('search', new DefaultValuePipe('')) search: string,
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return this.adminService.getPlayers(page, limit, search, filter);
  }

  @Get('aliases/competitions')
  getCompetitions(
    @Query('filter', new DefaultValuePipe('all')) filter: 'all' | 'unaliased' | 'aliased',
  ) {
    return this.adminService.getCompetitions(filter);
  }

  // ─── Club aliases ─────────────────────────────────────────────────────────

  @Put('aliases/clubs/:id')
  upsertClubAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertClubAliasDto) {
    return this.adminService.upsertClubAlias(id, dto);
  }

  @Delete('aliases/clubs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteClubAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteClubAlias(id);
  }

  // ─── Player aliases ───────────────────────────────────────────────────────

  @Put('aliases/players/:id')
  upsertPlayerAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertPlayerAliasDto) {
    return this.adminService.upsertPlayerAlias(id, dto);
  }

  @Delete('aliases/players/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePlayerAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deletePlayerAlias(id);
  }

  // ─── Competition aliases ──────────────────────────────────────────────────

  @Put('aliases/competitions/:id')
  upsertCompetitionAlias(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCompetitionAliasDto) {
    return this.adminService.upsertCompetitionAlias(id, dto);
  }

  @Delete('aliases/competitions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCompetitionAlias(@Param('id', ParseIntPipe) id: number) {
    return this.adminService.deleteCompetitionAlias(id);
  }

  // ─── Bulk import ──────────────────────────────────────────────────────────

  @Post('import/aliases')
  @UseInterceptors(FileFieldsInterceptor([
    { name: 'clubs', maxCount: 1 },
    { name: 'players', maxCount: 1 },
  ]))
  importAliases(
    @UploadedFiles() files: { clubs?: Express.Multer.File[]; players?: Express.Multer.File[] },
  ) {
    return this.adminService.importAliases(files ?? {});
  }

  // ─── Sync triggers ────────────────────────────────────────────────────────

  @Post('sync/bootstrap')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerBootstrap(@Body() dto: BootstrapDto) {
    return this.adminService.triggerBootstrap(dto.season, dto.force);
  }

  @Post('sync/players/:leagueId')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerPlayerSync(@Param('leagueId', ParseIntPipe) leagueId: number) {
    return this.adminService.triggerPlayerSync(leagueId);
  }

  @Post('sync/fixture/:id')
  @HttpCode(HttpStatus.ACCEPTED)
  triggerPerformanceSync(@Param('id', ParseIntPipe) fixtureId: number) {
    return this.adminService.triggerPerformanceSync(fixtureId);
  }

  @Get('sync/status')
  getQueueStatus() {
    return this.adminService.getQueueStatus();
  }

  @Get('sync/rate-limit')
  getRateLimitStatus() {
    return this.adminService.getRateLimitStatus();
  }
}
```

- [ ] **Step 7: TypeScript check**

```bash
cd apps/api && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Run all tests**

```bash
cd apps/api && pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/alias/alias.service.ts \
        apps/api/src/modules/admin/admin.service.ts \
        apps/api/src/modules/admin/admin.service.spec.ts \
        apps/api/src/modules/admin/admin.controller.ts \
        apps/api/package.json apps/api/pnpm-lock.yaml
git commit -m "feat(admin): extend list endpoints with filter+search; add CSV import endpoint"
```

---

## Task 5: Frontend Types + Admin Hooks

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Create: `apps/web/src/api/hooks/useAdminAliases.ts`

- [ ] **Step 1: Add admin types to `apps/web/src/api/types.ts`**

Append at the end of the file:

```typescript
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
export interface ImportResult { clubs?: ImportSummary; players?: ImportSummary }
```

- [ ] **Step 2: Create `apps/web/src/api/hooks/useAdminAliases.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type {
  AdminClub, AdminPlayer, AdminCompetition,
  AdminListResponse, ImportResult,
} from '../types'

type AliasFilter = 'all' | 'unaliased' | 'aliased'

// ── Clubs ─────────────────────────────────────────────────────────────────

export function useAdminClubs(page: number, search: string, filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'clubs', page, search, filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminListResponse<AdminClub> }>(
        '/admin/aliases/clubs',
        { params: { page, limit: 50, search, filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdateClubAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, shortName, city }: { id: number; name: string; shortName?: string; city?: string }) =>
      apiClient.put(`/admin/aliases/clubs/${id}`, { name, shortName, city }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clubs'] }),
  })
}

// ── Players ───────────────────────────────────────────────────────────────

export function useAdminPlayers(page: number, search: string, filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'players', page, search, filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminListResponse<AdminPlayer> }>(
        '/admin/aliases/players',
        { params: { page, limit: 50, search, filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdatePlayerAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiClient.put(`/admin/aliases/players/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'players'] }),
  })
}

// ── Competitions ──────────────────────────────────────────────────────────

export function useAdminCompetitions(filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'competitions', filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminCompetition[] }>(
        '/admin/aliases/competitions',
        { params: { filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdateCompetitionAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, shortName }: { id: number; name: string; shortName?: string }) =>
      apiClient.put(`/admin/aliases/competitions/${id}`, { name, shortName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'competitions'] }),
  })
}

// ── Bulk import ───────────────────────────────────────────────────────────

export function useImportAliases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const r = await apiClient.post<{ data: ImportResult }>(
        '/admin/import/aliases',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return r.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'players'] })
      qc.invalidateQueries({ queryKey: ['admin', 'competitions'] })
    },
  })
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/hooks/useAdminAliases.ts
git commit -m "feat(admin): add frontend admin types and alias hooks"
```

---

## Task 6: Admin Route + Layout Shell

**Files:**
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/pages/admin/AdminPage.tsx`
- Create: `apps/web/src/pages/admin/EditableCell.tsx`

- [ ] **Step 1: Add `/admin` route to `apps/web/src/App.tsx`**

```typescript
import { Routes, Route, Navigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Onboarding } from './pages/Onboarding'
import { AdminPage } from './pages/admin/AdminPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { useAuthStore } from './store/auth.store'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><Onboarding /></ProtectedRoute>
      } />
      <Route path="/admin" element={
        <AdminRoute><AdminPage /></AdminRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute><AppShell /></ProtectedRoute>
      } />
    </Routes>
  )
}
```

- [ ] **Step 2: Create `apps/web/src/pages/admin/EditableCell.tsx`**

Reusable inline-edit cell used by all three admin tabs:

```typescript
import { useState, useRef, useEffect } from 'react'

interface EditableCellProps {
  value: string
  onSave: (value: string) => void
  placeholder?: string
  className?: string
}

export function EditableCell({ value, onSave, placeholder = '—', className = '' }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])
  useEffect(() => { setDraft(value) }, [value])

  function commit() {
    setEditing(false)
    if (draft.trim() !== value) onSave(draft.trim())
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        className={`bg-white/10 border border-game-neon/50 rounded px-2 py-0.5 text-sm
          text-white outline-none w-full min-w-0 ${className}`}
      />
    )
  }

  return (
    <span
      onClick={() => setEditing(true)}
      title="Click to edit"
      className={`cursor-pointer hover:text-game-neon transition-colors truncate block ${
        value ? 'text-slate-200' : 'text-slate-600 italic'
      } ${className}`}
    >
      {value || placeholder}
    </span>
  )
}
```

- [ ] **Step 3: Create `apps/web/src/pages/admin/AdminPage.tsx`**

```typescript
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useLogout } from '../../api/hooks'
import { AdminClubs } from './AdminClubs'
import { AdminPlayers } from './AdminPlayers'
import { AdminCompetitions } from './AdminCompetitions'

type Tab = 'clubs' | 'players' | 'competitions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'clubs', label: 'Clubs' },
  { id: 'players', label: 'Players' },
  { id: 'competitions', label: 'Competitions' },
]

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('clubs')
  const user = useAuthStore(s => s.user)
  const { mutate: logout } = useLogout()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-game-bg text-white flex flex-col">
      {/* Header */}
      <header className="bg-game-card border-b border-white/10 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="font-bangers text-xl tracking-widest">
          FANTASY<span className="text-game-neon">FOOTY</span>
          <span className="text-slate-500 text-sm ml-3 font-nunito font-normal tracking-normal">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">{user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-white text-sm transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-game-card border-b border-white/10 px-6 flex gap-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-game-neon text-game-neon'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {tab === 'clubs'        && <AdminClubs />}
        {tab === 'players'      && <AdminPlayers />}
        {tab === 'competitions' && <AdminCompetitions />}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: errors only for missing `AdminClubs`, `AdminPlayers`, `AdminCompetitions` imports (not yet created).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/App.tsx \
        apps/web/src/pages/admin/AdminPage.tsx \
        apps/web/src/pages/admin/EditableCell.tsx
git commit -m "feat(admin): add /admin route, layout shell, and EditableCell component"
```

---

## Task 7: AdminClubs Tab

**Files:**
- Create: `apps/web/src/pages/admin/AdminClubs.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/admin/AdminClubs.tsx`**

```typescript
import { useState, useRef } from 'react'
import { useAdminClubs, useUpdateClubAlias, useImportAliases } from '../../api/hooks/useAdminAliases'
import { EditableCell } from './EditableCell'
import type { AdminClub, ImportResult } from '../../api/types'

type Filter = 'all' | 'unaliased' | 'aliased'

export function AdminClubs() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useAdminClubs(page, search, filter)
  const updateAlias = useUpdateClubAlias()
  const importAliases = useImportAliases()

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleSave(club: AdminClub, field: 'name' | 'shortName' | 'city', value: string) {
    const name = field === 'name' ? value : (club.isAliased ? club.name : '')
    if (!name.trim()) return // alias_name is required; can't save shortName/city without it
    updateAlias.mutate({
      id: club.id,
      name,
      shortName: field === 'shortName' ? value : club.shortName,
      city: field === 'city' ? value : club.city,
    })
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('clubs', file)
    importAliases.mutate(fd, {
      onSuccess: (result: ImportResult) => {
        const s = result.clubs
        showToast(s
          ? `Clubs: ${s.processed} aliased, ${s.skipped} skipped${s.errors.length ? `, ${s.errors.length} errors` : ''}`
          : 'No clubs file processed'
        )
      },
      onError: () => showToast('Import failed — check console'),
    })
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search real name or alias..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
            placeholder:text-slate-500 outline-none focus:border-game-neon/50 w-64"
        />

        <select
          value={filter}
          onChange={e => { setFilter(e.target.value as Filter); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All clubs</option>
          <option value="unaliased">Unnamed only</option>
          <option value="aliased">Aliased only</option>
        </select>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={importAliases.isPending}
          className="ml-auto px-4 py-2 bg-game-neon/10 border border-game-neon/30 text-game-neon
            rounded-lg text-sm hover:bg-game-neon/20 transition-colors disabled:opacity-50"
        >
          {importAliases.isPending ? 'Importing...' : 'Import clubs CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Stats */}
      {data && (
        <p className="text-slate-500 text-xs">
          {data.total} clubs · page {data.page} of {totalPages}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-left">
              <th className="px-3 py-2 w-16">ID</th>
              <th className="px-3 py-2">Real Name</th>
              <th className="px-3 py-2">Alias Name</th>
              <th className="px-3 py-2 w-24">Short</th>
              <th className="px-3 py-2 w-32">City</th>
              <th className="px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {data?.items.map(club => (
              <tr key={club.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{club.id}</td>
                <td className="px-3 py-2 text-slate-400">{club.realName}</td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={club.isAliased ? club.name : ''}
                    onSave={v => handleSave(club, 'name', v)}
                    placeholder="Click to add alias"
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={club.shortName ?? ''}
                    onSave={v => handleSave(club, 'shortName', v)}
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={club.city ?? ''}
                    onSave={v => handleSave(club, 'city', v)}
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    club.isAliased
                      ? 'bg-game-neon/10 text-game-neon'
                      : 'bg-game-fire/10 text-game-fire'
                  }`}>
                    {club.isAliased ? 'Aliased' : 'Unnamed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-end">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-slate-500 text-sm">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-game-card border border-white/10 rounded-xl
          px-4 py-3 text-sm text-white shadow-lg z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/admin/AdminClubs.tsx
git commit -m "feat(admin): add clubs tab with inline edit and CSV upload"
```

---

## Task 8: AdminPlayers Tab

**Files:**
- Create: `apps/web/src/pages/admin/AdminPlayers.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/admin/AdminPlayers.tsx`**

```typescript
import { useState, useRef } from 'react'
import { useAdminPlayers, useUpdatePlayerAlias, useImportAliases } from '../../api/hooks/useAdminAliases'
import { EditableCell } from './EditableCell'
import type { ImportResult } from '../../api/types'

type Filter = 'all' | 'unaliased' | 'aliased'

export function AdminPlayers() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useAdminPlayers(page, search, filter)
  const updateAlias = useUpdatePlayerAlias()
  const importAliases = useImportAliases()

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('players', file)
    importAliases.mutate(fd, {
      onSuccess: (result: ImportResult) => {
        const s = result.players
        showToast(s
          ? `Players: ${s.processed} aliased, ${s.skipped} skipped${s.errors.length ? `, ${s.errors.length} errors` : ''}`
          : 'No players file processed'
        )
      },
      onError: () => showToast('Import failed — check console'),
    })
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search real name or alias..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
            placeholder:text-slate-500 outline-none focus:border-game-neon/50 w-64"
        />

        <select
          value={filter}
          onChange={e => { setFilter(e.target.value as Filter); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All players</option>
          <option value="unaliased">Unnamed only</option>
          <option value="aliased">Aliased only</option>
        </select>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={importAliases.isPending}
          className="ml-auto px-4 py-2 bg-game-neon/10 border border-game-neon/30 text-game-neon
            rounded-lg text-sm hover:bg-game-neon/20 transition-colors disabled:opacity-50"
        >
          {importAliases.isPending ? 'Importing...' : 'Import players CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
      </div>

      {/* Stats */}
      {data && (
        <p className="text-slate-500 text-xs">
          {data.total} players · page {data.page} of {totalPages}
        </p>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-left">
              <th className="px-3 py-2 w-16">ID</th>
              <th className="px-3 py-2">Real Name</th>
              <th className="px-3 py-2 w-12">Pos</th>
              <th className="px-3 py-2">Club</th>
              <th className="px-3 py-2">Alias Name</th>
              <th className="px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {data?.items.map(player => (
              <tr key={player.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{player.id}</td>
                <td className="px-3 py-2 text-slate-400">{player.realName}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{player.position}</td>
                <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[140px]">{player.clubRealName}</td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={player.isAliased ? player.name : ''}
                    onSave={v => updateAlias.mutate({ id: player.id, name: v })}
                    placeholder="Click to add alias"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    player.isAliased
                      ? 'bg-game-neon/10 text-game-neon'
                      : 'bg-game-fire/10 text-game-fire'
                  }`}>
                    {player.isAliased ? 'Aliased' : 'Unnamed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-end">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-slate-500 text-sm">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-game-card border border-white/10 rounded-xl
          px-4 py-3 text-sm text-white shadow-lg z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/admin/AdminPlayers.tsx
git commit -m "feat(admin): add players tab with inline edit and CSV upload"
```

---

## Task 9: AdminCompetitions Tab + Final Verification

**Files:**
- Create: `apps/web/src/pages/admin/AdminCompetitions.tsx`

- [ ] **Step 1: Create `apps/web/src/pages/admin/AdminCompetitions.tsx`**

```typescript
import { useState } from 'react'
import { useAdminCompetitions, useUpdateCompetitionAlias } from '../../api/hooks/useAdminAliases'
import { EditableCell } from './EditableCell'

type Filter = 'all' | 'unaliased' | 'aliased'

export function AdminCompetitions() {
  const [filter, setFilter] = useState<Filter>('all')
  const { data, isLoading } = useAdminCompetitions(filter)
  const updateAlias = useUpdateCompetitionAlias()

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex gap-3 items-center">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as Filter)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All competitions</option>
          <option value="unaliased">Unnamed only</option>
          <option value="aliased">Aliased only</option>
        </select>
        <p className="text-slate-500 text-xs ml-auto">{data?.length ?? 0} competitions</p>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-left">
              <th className="px-3 py-2 w-16">ID</th>
              <th className="px-3 py-2">Real Name</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Alias Name</th>
              <th className="px-3 py-2 w-24">Short</th>
              <th className="px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {data?.map(comp => (
              <tr key={comp.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{comp.id}</td>
                <td className="px-3 py-2 text-slate-400">{comp.realName}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{comp.country}</td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={comp.isAliased ? comp.name : ''}
                    onSave={v => updateAlias.mutate({ id: comp.id, name: v, shortName: comp.shortName })}
                    placeholder="Click to add alias"
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={comp.shortName ?? ''}
                    onSave={v => {
                      if (!comp.isAliased) return // must set alias name first
                      updateAlias.mutate({ id: comp.id, name: comp.name, shortName: v })
                    }}
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    comp.isAliased
                      ? 'bg-game-neon/10 text-game-neon'
                      : 'bg-game-fire/10 text-game-fire'
                  }`}>
                    {comp.isAliased ? 'Aliased' : 'Unnamed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Final TypeScript check (both apps)**

```bash
cd apps/api && npx tsc --noEmit && echo "API OK"
cd apps/web && npx tsc --noEmit && echo "WEB OK"
```

Expected: both print "OK".

- [ ] **Step 3: Final test run**

```bash
cd apps/api && pnpm test
```

Expected: 4 tests PASS.

- [ ] **Step 4: Manual smoke test**

Start both servers:
```bash
# Terminal 1
cd apps/api && pnpm start:dev

# Terminal 2
cd apps/web && pnpm dev
```

Verify:
1. Navigate to `http://localhost:5173/admin` as a non-admin user → should redirect to `/`
2. Log in as an ADMIN user → navigate to `/admin` → should see the admin page with three tabs
3. Clubs tab: table loads, click a cell → input appears, type + Enter → alias saves
4. Players tab: same inline edit works
5. Run export script: `cd apps/api && npx ts-node scripts/export-aliases.ts` → two CSV files created
6. Upload the clubs CSV on the Clubs tab → toast shows summary

- [ ] **Step 5: Final commit**

```bash
git add apps/web/src/pages/admin/AdminCompetitions.tsx
git commit -m "feat(admin): add competitions tab; complete alias management system"
```
