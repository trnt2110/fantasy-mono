# Simulation UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Simulation tab to the admin page with a bot setup card, current-GW stepper with action buttons, and a GW history table — all wired to the simulation REST endpoints.

**Architecture:** One new backend endpoint (`GET /admin/simulate/status`) added to the existing `SimulationService`/`SimulationController`. Frontend is a single `AdminSimulation.tsx` tab component (same pattern as existing admin tabs) backed by `useAdminSimulation.ts` hooks. All simulation state comes from the status query which is invalidated after every mutation.

**Tech Stack:** NestJS (backend), React 19, TanStack Query v5, Tailwind CSS, existing admin design system (game-bg/game-card/game-neon palette, Bangers + Nunito fonts).

> **Prerequisite:** The simulation POST endpoints (`/admin/simulate/bots`, `/admin/simulate/gw/:id/open`, `/admin/simulate/gw/:id/bot-picks`, `/admin/simulate/gw/:id/finalize`) must exist. Implement `docs/superpowers/plans/2026-06-02-gameplay-simulation.md` first if you haven't already. The `SimulationService`, `SimulationController`, and `AdminModule` wiring from that plan are required before Task 1 below.

---

## Files

### Create
- `apps/web/src/api/hooks/useAdminSimulation.ts` — TanStack Query hooks for all simulation endpoints
- `apps/web/src/pages/admin/AdminSimulation.tsx` — the simulation tab component

### Modify
- `apps/api/src/modules/admin/simulation.service.ts` — add `getStatus()` method
- `apps/api/src/modules/admin/simulation.controller.ts` — add `GET /admin/simulate/status` endpoint
- `apps/web/src/api/types.ts` — add simulation type definitions
- `apps/web/src/pages/admin/AdminPage.tsx` — add `'simulation'` tab

---

## Task 1: Backend — `getStatus` endpoint

**Files:**
- Modify: `apps/api/src/modules/admin/simulation.service.ts`
- Modify: `apps/api/src/modules/admin/simulation.controller.ts`

**What it returns:**
```json
{
  "data": {
    "botCount": 5,
    "competitionId": 39,
    "currentGameweek": { "id": 4, "number": 4, "status": "SCHEDULED", "deadlineTime": "2024-09-14T12:00:00Z" },
    "finishedGameweeks": [
      { "id": 3, "number": 3, "teamsScored": 6, "deadlineTime": "2024-09-07T12:00:00Z" }
    ]
  }
}
```

- `botCount`: count of `User` rows where `email` contains `@sim.test`
- `currentGameweek`: the single `Gameweek` where `isCurrent = true` for competition 39; `null` if none
- `finishedGameweeks`: all `Gameweek` rows where `status = 'FINISHED'` for competition 39, sorted `number DESC`; each has `teamsScored` = count of `GameweekScore` rows for that gameweek

- [ ] **Step 1: Add `getStatus` to SimulationService**

Open `apps/api/src/modules/admin/simulation.service.ts`. Add this method before the closing brace of the class:

```typescript
async getStatus(competitionId: number) {
  const botCount = await this.prisma.user.count({
    where: { email: { contains: '@sim.test' } },
  });

  const currentGameweek = await this.prisma.gameweek.findFirst({
    where: { competitionId, isCurrent: true },
    select: { id: true, number: true, status: true, deadlineTime: true },
  });

  const finishedGws = await this.prisma.gameweek.findMany({
    where: { competitionId, status: 'FINISHED' },
    orderBy: { number: 'desc' },
    select: { id: true, number: true, deadlineTime: true },
  });

  const finishedGameweeks = await Promise.all(
    finishedGws.map(async (gw) => ({
      ...gw,
      teamsScored: await this.prisma.gameweekScore.count({ where: { gameweekId: gw.id } }),
    })),
  );

  return { botCount, competitionId, currentGameweek: currentGameweek ?? null, finishedGameweeks };
}
```

- [ ] **Step 2: Add GET endpoint to SimulationController**

Open `apps/api/src/modules/admin/simulation.controller.ts`. Add the `Get` import to the existing NestJS imports line, then add this method:

```typescript
@Get('status')
async getStatus() {
  return { data: await this.simulation.getStatus(39) };
}
```

The import line at the top should include `Get`:
```typescript
import { Controller, Post, Get, Param, ParseIntPipe, Body, HttpCode, HttpStatus } from '@nestjs/common';
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/api && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Smoke test the endpoint**

Start the API if not running:
```bash
cd /Users/trung/fantasy/apps/api && pnpm start:dev
```

Get an admin JWT first (substitute your credentials):
```bash
TOKEN=$(curl -s -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your-admin@email.com","password":"yourpassword"}' \
  | jq -r '.data.accessToken')

curl -s http://localhost:3001/admin/simulate/status \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected response shape:
```json
{
  "data": {
    "botCount": 0,
    "competitionId": 39,
    "currentGameweek": { "id": 1, "number": 1, "status": "SCHEDULED", "deadlineTime": "..." },
    "finishedGameweeks": []
  }
}
```

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy && git add apps/api/src/modules/admin/simulation.service.ts apps/api/src/modules/admin/simulation.controller.ts
git commit -m "feat(simulate): add GET /admin/simulate/status endpoint"
```

---

## Task 2: Frontend types

**Files:**
- Modify: `apps/web/src/api/types.ts`

- [ ] **Step 1: Add simulation types**

Open `apps/web/src/api/types.ts` and append at the end of the file:

```typescript
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy && git add apps/web/src/api/types.ts
git commit -m "feat(simulate): add simulation TypeScript types"
```

---

## Task 3: Frontend hooks

**Files:**
- Create: `apps/web/src/api/hooks/useAdminSimulation.ts`

- [ ] **Step 1: Create the hooks file**

```typescript
// apps/web/src/api/hooks/useAdminSimulation.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type {
  SimulationStatus,
  CreateBotsResult,
  OpenGwResult,
  BotPicksResult,
  FinalizeGwResult,
} from '../types'

const STATUS_KEY = ['admin', 'simulation', 'status']

export function useSimulationStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const r = await apiClient.get<{ data: SimulationStatus }>('/admin/simulate/status')
      return r.data.data
    },
  })
}

export function useCreateBots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { count: number; competitionId: number }) => {
      const r = await apiClient.post<{ data: CreateBotsResult }>('/admin/simulate/bots', body)
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useOpenGameweek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ gwId, minutesFromNow = 60 }: { gwId: number; minutesFromNow?: number }) => {
      const r = await apiClient.post<{ data: OpenGwResult }>(
        `/admin/simulate/gw/${gwId}/open`,
        { minutesFromNow },
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useSubmitBotPicks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gwId: number) => {
      const r = await apiClient.post<{ data: BotPicksResult }>(
        `/admin/simulate/gw/${gwId}/bot-picks`,
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useFinalizeGameweek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gwId: number) => {
      const r = await apiClient.post<{ data: FinalizeGwResult }>(
        `/admin/simulate/gw/${gwId}/finalize`,
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy && git add apps/web/src/api/hooks/useAdminSimulation.ts
git commit -m "feat(simulate): add useAdminSimulation hooks"
```

---

## Task 4: AdminSimulation component

**Files:**
- Create: `apps/web/src/pages/admin/AdminSimulation.tsx`

The component has three visual sections. Styling follows the existing admin tab pattern: `bg-game-card` cards, `border-white/10` borders, `text-game-neon` accents, `text-slate-400` muted text, neon-outline action buttons.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/pages/admin/AdminSimulation.tsx
import { useState } from 'react'
import {
  useSimulationStatus,
  useCreateBots,
  useOpenGameweek,
  useSubmitBotPicks,
  useFinalizeGameweek,
} from '../../api/hooks/useAdminSimulation'
import type { FinalizeGwResult, BotPicksResult, SimulationCurrentGw } from '../../api/types'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isPast(iso: string) {
  return new Date(iso) <= new Date()
}

// ─── step indicator ──────────────────────────────────────────────────────────

function StepDot({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
      ${done ? 'bg-green-500 text-white' : active ? 'bg-game-neon text-game-bg' : 'bg-white/10 text-slate-400'}`}>
      {done ? '✓' : n}
    </div>
  )
}

// ─── action button ────────────────────────────────────────────────────────────

function ActionBtn({
  label, onClick, isPending, disabled = false, variant = 'neon',
}: {
  label: string
  onClick: () => void
  isPending: boolean
  disabled?: boolean
  variant?: 'neon' | 'gold' | 'muted'
}) {
  const colors = {
    neon: 'bg-game-neon/10 border-game-neon/40 text-game-neon hover:bg-game-neon/20',
    gold: 'bg-game-gold/10 border-game-gold/40 text-game-gold hover:bg-game-gold/20',
    muted: 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
  }
  return (
    <button
      onClick={onClick}
      disabled={isPending || disabled}
      className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${colors[variant]}`}
    >
      {isPending && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {label}
    </button>
  )
}

// ─── status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: SimulationCurrentGw['status'] }) {
  const map = {
    SCHEDULED: 'bg-slate-500/20 text-slate-400',
    ACTIVE: 'bg-blue-500/20 text-blue-400',
    SCORING: 'bg-amber-500/20 text-amber-400',
    FINISHED: 'bg-green-500/20 text-green-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>{status}</span>
  )
}

// ─── main component ───────────────────────────────────────────────────────────

export function AdminSimulation() {
  const [toast, setToast] = useState<string | null>(null)
  const [botCount, setBotCount] = useState(5)
  const [lastFinalize, setLastFinalize] = useState<FinalizeGwResult | null>(null)
  const [lastBotPicks, setLastBotPicks] = useState<BotPicksResult | null>(null)

  const { data: status, isLoading, error } = useSimulationStatus()
  const createBots = useCreateBots()
  const openGw = useOpenGameweek()
  const submitBotPicks = useSubmitBotPicks()
  const finalizeGw = useFinalizeGameweek()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const gw = status?.currentGameweek ?? null
  const deadlinePassed = gw ? isPast(gw.deadlineTime) : true
  const gwIsFinished = gw?.status === 'FINISHED'

  // Step completion derived from observable state
  const step1Done = !deadlinePassed        // deadline is in the future
  const step2Done = step1Done              // can't verify from admin — treat as done with step 1
  const step3Done = lastBotPicks !== null  // bot-picks mutation succeeded this session
  const step4Done = gwIsFinished

  function handleCreateBots() {
    createBots.mutate(
      { count: botCount, competitionId: 39 },
      {
        onSuccess: (r) => showToast(`${r.created} bots created, ${r.skipped} already exist`),
        onError: () => showToast('Failed to create bots — check API logs'),
      },
    )
  }

  function handleOpenGw() {
    if (!gw) return
    openGw.mutate(
      { gwId: gw.id, minutesFromNow: 60 },
      {
        onSuccess: () => showToast(`GW ${gw.number} opened — 60 min to deadline`),
        onError: () => showToast('Failed to open gameweek'),
      },
    )
  }

  function handleBotPicks() {
    if (!gw) return
    submitBotPicks.mutate(gw.id, {
      onSuccess: (r) => {
        setLastBotPicks(r)
        showToast(`Bot picks submitted — ${r.picksSeeded} seeded, ${r.bots - r.picksSeeded} already set`)
      },
      onError: () => showToast('Failed to submit bot picks'),
    })
  }

  function handleFinalize() {
    if (!gw) return
    finalizeGw.mutate(gw.id, {
      onSuccess: (r) => {
        setLastFinalize(r)
        setLastBotPicks(null)
        showToast(`GW ${gw.number} finalized — ${r.teamsScored} teams scored`)
      },
      onError: () => showToast('Failed to finalize gameweek'),
    })
  }

  function handleNextGw() {
    if (!lastFinalize?.nextGameweekId) return
    openGw.mutate(
      { gwId: lastFinalize.nextGameweekId, minutesFromNow: 60 },
      {
        onSuccess: () => {
          setLastFinalize(null)
          setLastBotPicks(null)
          showToast('Next GW opened — 60 min to deadline')
        },
        onError: () => showToast('Failed to open next gameweek'),
      },
    )
  }

  if (isLoading) {
    return <div className="text-slate-400 text-sm animate-pulse">Loading simulation status…</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm">Failed to load simulation status. Is the API running?</div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 bg-game-card border border-white/20 text-white
          px-4 py-3 rounded-lg text-sm shadow-xl z-50 animate-in">
          {toast}
        </div>
      )}

      {/* ── Bot Setup Card ───────────────────────────────────────────────── */}
      <div className={`bg-game-card rounded-xl p-5 border transition-all
        ${(status?.botCount ?? 0) > 0 ? 'border-white/10 opacity-70' : 'border-game-neon/30'}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bangers text-lg tracking-wide text-white">
              Bot Players
            </h2>
            {(status?.botCount ?? 0) > 0 ? (
              <p className="text-slate-400 text-sm mt-0.5">
                <span className="text-green-400">●</span>{' '}
                {status!.botCount} bots active · Premier League
              </p>
            ) : (
              <p className="text-slate-500 text-sm mt-0.5">No bots yet</p>
            )}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {(status?.botCount ?? 0) === 0 && (
              <div className="flex items-center gap-2">
                <label className="text-slate-400 text-xs">Bots:</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={botCount}
                  onChange={e => setBotCount(Number(e.target.value))}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5
                    text-sm text-white text-center outline-none focus:border-game-neon/50"
                />
              </div>
            )}
            <ActionBtn
              label={(status?.botCount ?? 0) > 0 ? 'Reset Bots' : 'Create Bots'}
              onClick={handleCreateBots}
              isPending={createBots.isPending}
              variant={(status?.botCount ?? 0) > 0 ? 'muted' : 'neon'}
            />
          </div>
        </div>
        {createBots.error && (
          <p className="text-red-400 text-xs mt-2">Failed to create bots — check API logs</p>
        )}
      </div>

      {/* ── Current GW Card ──────────────────────────────────────────────── */}
      <div className="bg-game-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <span className="font-bangers text-lg tracking-wide">
            {gw ? `GW ${gw.number}` : 'No Active Gameweek'}
          </span>
          {gw && <StatusBadge status={gw.status} />}
          {gw && (
            <span className="text-slate-500 text-xs ml-auto">
              Deadline: {fmtDeadline(gw.deadlineTime)}
              {deadlinePassed
                ? <span className="text-red-400 ml-2">● PASSED</span>
                : <span className="text-game-neon ml-2">● OPEN</span>}
            </span>
          )}
        </div>

        {!gw ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            All gameweeks may be finished, or no current gameweek is set.
          </div>
        ) : (
          <div className="px-5 py-5">
            {/* Stepper */}
            <div className="flex items-start gap-0 mb-6">
              {/* Step 1 */}
              <div className="flex flex-col items-center flex-1">
                <StepDot n={1} done={step1Done} active={!step1Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Open</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Set deadline</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step1Done ? 'bg-green-500/50' : 'bg-white/10'}`} />

              {/* Step 2 */}
              <div className="flex flex-col items-center flex-1">
                <StepDot n={2} done={step2Done} active={step1Done && !step2Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Your Picks</div>
                <div className="text-xs text-game-gold text-center mt-0.5">Main app →</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step3Done ? 'bg-green-500/50' : 'bg-white/10'}`} />

              {/* Step 3 */}
              <div className="flex flex-col items-center flex-1">
                <StepDot n={3} done={step3Done} active={step2Done && !step3Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Bot Picks</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Auto-seed</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step4Done ? 'bg-green-500/50' : 'bg-white/10'}`} />

              {/* Step 4 */}
              <div className="flex flex-col items-center flex-1">
                <StepDot n={4} done={step4Done} active={step3Done && !step4Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Finalize</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Score + advance</div>
              </div>
            </div>

            {/* Action buttons row */}
            <div className="flex flex-wrap gap-3 items-center">
              {!step1Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn
                    label="Open GW"
                    onClick={handleOpenGw}
                    isPending={openGw.isPending}
                    variant="neon"
                  />
                  {openGw.error && <span className="text-red-400 text-xs">Failed to open</span>}
                </div>
              )}

              {step1Done && !step4Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn
                    label={lastBotPicks ? `Bot Picks ✓ (${lastBotPicks.picksSeeded} seeded)` : 'Submit Bot Picks'}
                    onClick={handleBotPicks}
                    isPending={submitBotPicks.isPending}
                    variant={lastBotPicks ? 'muted' : 'neon'}
                  />
                  {submitBotPicks.error && <span className="text-red-400 text-xs">Failed to submit</span>}
                </div>
              )}

              {!step4Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn
                    label="Finalize GW"
                    onClick={handleFinalize}
                    isPending={finalizeGw.isPending}
                    variant="gold"
                  />
                  {finalizeGw.error && <span className="text-red-400 text-xs">Failed to finalize</span>}
                </div>
              )}

              {step4Done && (
                <ActionBtn
                  label={lastFinalize?.nextGameweekId ? 'Next GW →' : 'All GWs Complete'}
                  onClick={handleNextGw}
                  isPending={openGw.isPending}
                  disabled={!lastFinalize?.nextGameweekId}
                  variant="neon"
                />
              )}

              {lastFinalize && !step4Done && (
                <span className="text-slate-500 text-xs ml-auto">
                  Last finalized: {lastFinalize.teamsScored} teams scored
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── GW History Table ─────────────────────────────────────────────── */}
      <div className="bg-game-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h2 className="font-bangers text-base tracking-wide text-slate-300">GW History</h2>
        </div>
        {(status?.finishedGameweeks?.length ?? 0) === 0 ? (
          <div className="px-5 py-6 text-center text-slate-500 text-sm">
            No gameweeks finalized yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">GW</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Status</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Teams Scored</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {status!.finishedGameweeks.map(gw => (
                <tr key={gw.id} className="border-b border-white/5 last:border-0 hover:bg-white/2">
                  <td className="px-5 py-3 font-medium text-white">GW {gw.number}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      ✓ FINISHED
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{gw.teamsScored}</td>
                  <td className="px-5 py-3 text-slate-400">{fmtDate(gw.deadlineTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy && git add apps/web/src/pages/admin/AdminSimulation.tsx
git commit -m "feat(simulate): add AdminSimulation tab component"
```

---

## Task 5: Wire Simulation tab into AdminPage

**Files:**
- Modify: `apps/web/src/pages/admin/AdminPage.tsx`

- [ ] **Step 1: Update AdminPage.tsx**

Replace the full contents of `apps/web/src/pages/admin/AdminPage.tsx` with:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useLogout } from '../../api/hooks'
import { AdminClubs } from './AdminClubs'
import { AdminPlayers } from './AdminPlayers'
import { AdminCompetitions } from './AdminCompetitions'
import { AdminSimulation } from './AdminSimulation'

type Tab = 'clubs' | 'players' | 'competitions' | 'simulation'

const TABS: { id: Tab; label: string }[] = [
  { id: 'clubs', label: 'Clubs' },
  { id: 'players', label: 'Players' },
  { id: 'competitions', label: 'Competitions' },
  { id: 'simulation', label: 'Simulation' },
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
      <header className="bg-game-card border-b border-white/10 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="font-bangers text-xl tracking-widest">
          FANTASY<span className="text-game-neon">FOOTY</span>
          <span className="text-slate-500 text-sm ml-3 font-nunito font-normal tracking-normal">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">{user?.email}</span>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </header>

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

      <div className="flex-1 overflow-auto p-6">
        {tab === 'clubs'        && <AdminClubs />}
        {tab === 'players'      && <AdminPlayers />}
        {tab === 'competitions' && <AdminCompetitions />}
        {tab === 'simulation'   && <AdminSimulation />}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/apps/web && pnpm exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy && git add apps/web/src/pages/admin/AdminPage.tsx
git commit -m "feat(simulate): add Simulation tab to AdminPage"
```

---

## Task 6: Manual smoke test in browser

- [ ] **Step 1: Start API + frontend**

In two terminals:
```bash
# Terminal 1
cd /Users/trung/fantasy/apps/api && pnpm start:dev

# Terminal 2
cd /Users/trung/fantasy/apps/web && pnpm dev
```

- [ ] **Step 2: Navigate to admin page**

Open `http://localhost:5173/admin`. Log in with admin credentials. Click the **Simulation** tab.

- [ ] **Step 3: Verify initial state**

Expected:
- Bot Setup card shows "No bots yet" with count input + "Create Bots" button
- Current GW card shows GW number, status `SCHEDULED`, deadline (with `● PASSED` in red since 2024 data)
- Step 1 (Open) is highlighted (active) since deadline is in the past
- GW History table shows "No gameweeks finalized yet."

- [ ] **Step 4: Create bots**

Enter `5` in the bot count input, click **Create Bots**.

Expected: toast "5 bots created, 0 already exist", Bot Setup card collapses to "● 5 bots active · Premier League".

- [ ] **Step 5: Open GW**

Click **Open GW** on the current GW card.

Expected: toast "GW 1 opened — 60 min to deadline", deadline updates to ~60 min from now (`● OPEN` in green), Step 1 checkmark turns green, Step 2 highlighted with gold "Main app →" note.

- [ ] **Step 6: Submit bot picks**

Click **Submit Bot Picks**.

Expected: toast "Bot picks submitted", Step 3 button label changes to "Bot Picks ✓ (0 seeded)" (0 because GW1 picks were created by `createBots`).

- [ ] **Step 7: Finalize GW**

Click **Finalize GW**.

Expected: toast "GW 1 finalized — 6 teams scored", GW card shows `FINISHED` badge, "Next GW →" button appears, GW History table gains a row for GW 1 with teamsScored = 6.

- [ ] **Step 8: Advance to GW 2**

Click **Next GW →**.

Expected: toast "Next GW opened — 60 min to deadline", GW card updates to show GW 2 with Step 1 done (deadline now open), Step 2 highlighted. GW History still shows GW 1.

---

## Self-Review

**Spec coverage:**
- [x] Auto-detect current GW → `useSimulationStatus` + `currentGameweek` from status endpoint
- [x] Clear status indicators → status badge, deadline with PASSED/OPEN, step dots (grey/neon/green)
- [x] Suggested next steps / action buttons → active step highlighted, only relevant buttons shown
- [x] Button to go to next GW → "Next GW →" after finalize, calls openGw on nextGameweekId
- [x] History of all past GWs with teams scored → GW History table from `finishedGameweeks`
- [x] Bot setup card — collapsed/expanded states, reset button
- [x] 4-step stepper with Open / Your Picks / Bot Picks / Finalize
- [x] Toast notifications — same pattern as existing admin tabs
- [x] Error messages inline per step action

**Type consistency check:**
- `SimulationCurrentGw`, `SimulationFinishedGw`, `SimulationStatus`, `CreateBotsResult`, `OpenGwResult`, `BotPicksResult`, `FinalizeGwResult` defined in Task 2 and used consistently in Tasks 3 + 4 ✓
- `useSimulationStatus`, `useCreateBots`, `useOpenGameweek`, `useSubmitBotPicks`, `useFinalizeGameweek` defined in Task 3 and imported in Task 4 ✓
- `STATUS_KEY` query key used consistently across all mutations' `onSuccess` invalidation ✓
