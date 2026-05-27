# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-step standalone wizard at `/onboarding` that lets new users pick 15 players, set formation + starting XI, and assign captain before submitting `POST /fantasy-teams`.

**Architecture:** Standalone full-screen page outside `AppShell` (same pattern as Login/Register). All wizard state lives in a single `useOnboarding`-style local state block in `Onboarding.tsx`. Each step is a focused sub-component receiving props only — no Zustand, no cross-component query calls. `AppShell` gets a 404 guard that redirects to `/onboarding` when no team exists.

**Tech Stack:** React 19, TanStack Query v5, Zustand, Axios, Tailwind CSS, React Router v6. TypeScript strict mode. No frontend test setup exists — verification is `pnpm exec tsc --noEmit` from `apps/web/`.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/web/src/App.tsx` | Modify | Add `/onboarding` protected route |
| `apps/web/src/components/AppShell.tsx` | Modify | 404 → redirect to `/onboarding` |
| `apps/web/src/pages/Register.tsx` | Modify | Redirect to `/onboarding` after register |
| `apps/web/src/api/hooks/useCreateTeam.ts` | Create | `POST /fantasy-teams` mutation |
| `apps/web/src/api/hooks/index.ts` | Modify | Export `useCreateTeam` |
| `apps/web/src/pages/Onboarding.tsx` | Create | Wizard orchestrator + all local state |
| `apps/web/src/pages/onboarding/Step1PickPlayers.tsx` | Create | Player list + live pitch (split/tabs) |
| `apps/web/src/pages/onboarding/Step2Formation.tsx` | Create | Formation pills + pitch toggle starters |
| `apps/web/src/pages/onboarding/Step3Captain.tsx` | Create | Team name + captain picker + submit |

---

## Task 1: Routing, guards, and register redirect

**Files:**
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/pages/Register.tsx`

- [ ] **Step 1: Add `/onboarding` route to App.tsx**

Replace the current `App.tsx` content with:

```tsx
import { Routes, Route } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Onboarding } from './pages/Onboarding'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      } />
    </Routes>
  )
}
```

- [ ] **Step 2: Add 404 guard to AppShell.tsx**

Replace the current `AppShell.tsx` content with:

```tsx
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { SquadSelection } from '../pages/SquadSelection'
import { PlayerSelection } from '../pages/PlayerSelection'
import { Fixtures } from '../pages/Fixtures'
import { Leagues } from '../pages/Leagues'
import { useAuthStore } from '../store/auth.store'
import { useMyFantasyTeam } from '../api/hooks'
import { ErrorBoundary } from './ErrorBoundary'

export function AppShell() {
  const [page, setPage] = useState('squad')
  const user = useAuthStore(s => s.user)
  const budget = useAuthStore(s => s.budget)
  const { isError, error } = useMyFantasyTeam()

  const isNoTeam = isError && (error as any)?.response?.status === 404
  if (isNoTeam) return <Navigate to="/onboarding" replace />

  return (
    <ErrorBoundary>
    <div className="h-screen overflow-hidden bg-game-bg flex">
      <Sidebar active={page} onChange={setPage} />

      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-64">
        <div className="lg:hidden flex items-center justify-between px-5 py-3 flex-shrink-0
          border-b border-game-border bg-game-bg/95 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <span className="text-2xl" style={{ filter: 'drop-shadow(0 0 8px rgba(0,255,135,0.5))' }}>⚽</span>
            <span className="font-bangers text-xl tracking-widest text-white">
              FANTASY<span className="text-game-neon">FOOTY</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="game-card px-2.5 py-1 flex items-center gap-1.5">
              <span className="text-game-gold text-sm">💰</span>
              <span className="font-bangers text-game-gold tracking-wider">
                £{budget > 0 ? budget.toFixed(1) : '—'}m
              </span>
            </div>
            <div className="w-9 h-9 game-card rounded-xl flex items-center justify-center text-slate-400 text-sm font-bold">
              {user?.username?.slice(0, 2).toUpperCase() ?? '?'}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          {page === 'squad'    && <SquadSelection />}
          {page === 'players'  && <PlayerSelection />}
          {page === 'fixtures' && <Fixtures />}
          {page === 'leagues'  && <Leagues />}
        </div>

        <BottomNav active={page} onChange={setPage} />
      </div>
    </div>
    </ErrorBoundary>
  )
}
```

- [ ] **Step 3: Update Register.tsx to redirect to `/onboarding` after success**

In `apps/web/src/pages/Register.tsx`, change line 22 — the `onSuccess` callback inside `handleSubmit`:

```tsx
// Before:
onSuccess: () => {
  login(
    { email, password },
    {
      onSuccess: () => navigate('/'),
      onError: () => navigate('/login'),
    }
  )
},

// After:
onSuccess: () => {
  login(
    { email, password },
    {
      onSuccess: () => navigate('/onboarding'),
      onError: () => navigate('/login'),
    }
  )
},
```

- [ ] **Step 4: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: errors about missing `Onboarding` module — that's fine at this stage. If you see errors about existing files (AppShell, Register), fix those first.

- [ ] **Step 5: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/App.tsx apps/web/src/components/AppShell.tsx apps/web/src/pages/Register.tsx
git commit -m "feat(onboarding): wire /onboarding route, AppShell 404 guard, register redirect"
```

---

## Task 2: useCreateTeam mutation hook

**Files:**
- Create: `apps/web/src/api/hooks/useCreateTeam.ts`
- Modify: `apps/web/src/api/hooks/index.ts`

- [ ] **Step 1: Create the hook**

Create `apps/web/src/api/hooks/useCreateTeam.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type { ApiResponse, ApiFantasyTeam } from '../types'

interface CreateTeamDto {
  competitionId: number
  name: string
  playerIds: number[]
  formation: string
  startingIds: number[]
  captainId: number
  viceCaptainId: number
  benchOrder: Record<string, number>
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateTeamDto) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyTeam>>('/fantasy-teams', dto)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasy-team'] })
    },
  })
}
```

- [ ] **Step 2: Export from hooks index**

In `apps/web/src/api/hooks/index.ts`, add:

```ts
export * from './useAuth'
export * from './useClubs'
export * from './useCurrentGameweek'
export * from './useSquad'
export * from './usePlayers'
export * from './useFixtures'
export * from './useLeaderboard'
export * from './useFantasyLeagues'
export * from './usePlayerPerformances'
export * from './useCreateTeam'
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: still errors about missing `Onboarding` page — that's expected. No new errors about `useCreateTeam`.

- [ ] **Step 4: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/api/hooks/useCreateTeam.ts apps/web/src/api/hooks/index.ts
git commit -m "feat(onboarding): add useCreateTeam mutation hook"
```

---

## Task 3: Onboarding.tsx orchestrator with full wizard state

**Files:**
- Create: `apps/web/src/pages/Onboarding.tsx`
- Create dir: `apps/web/src/pages/onboarding/` (empty placeholder files for steps — to unblock TypeScript)

- [ ] **Step 1: Create placeholder step files so imports resolve**

Create `apps/web/src/pages/onboarding/Step1PickPlayers.tsx`:

```tsx
import type { ApiPlayer } from '../../api/types'

interface Props {
  pickedPlayers: ApiPlayer[]
  budget: number
  onAdd: (p: ApiPlayer) => void
  onRemove: (p: ApiPlayer) => void
  onNext: () => void
}

export function Step1PickPlayers(_props: Props) {
  return <div className="p-8 text-slate-400">Step 1 — coming soon</div>
}
```

Create `apps/web/src/pages/onboarding/Step2Formation.tsx`:

```tsx
import type { ApiPlayer } from '../../api/types'

interface Props {
  pickedPlayers: ApiPlayer[]
  formation: string
  startingIds: Set<number>
  benchOrderArr: number[]
  onFormationChange: (f: string) => void
  onToggleStarter: (playerId: number) => void
  onMoveBench: (playerId: number, direction: 'up' | 'down') => void
  onBack: () => void
  onNext: () => void
}

export function Step2Formation(_props: Props) {
  return <div className="p-8 text-slate-400">Step 2 — coming soon</div>
}
```

Create `apps/web/src/pages/onboarding/Step3Captain.tsx`:

```tsx
import type { ApiPlayer } from '../../api/types'

interface Props {
  startingPlayers: ApiPlayer[]
  teamName: string
  captainId: number | null
  viceCaptainId: number | null
  onTeamNameChange: (name: string) => void
  onCaptainTap: (playerId: number) => void
  onBack: () => void
  onSubmit: () => void
  isPending: boolean
  error: string | null
}

export function Step3Captain(_props: Props) {
  return <div className="p-8 text-slate-400">Step 3 — coming soon</div>
}
```

- [ ] **Step 2: Create Onboarding.tsx**

Create `apps/web/src/pages/Onboarding.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMyFantasyTeam, useCreateTeam } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'
import { Step1PickPlayers } from './onboarding/Step1PickPlayers'
import { Step2Formation } from './onboarding/Step2Formation'
import { Step3Captain } from './onboarding/Step3Captain'
import type { ApiPlayer } from '../api/types'

export function Onboarding() {
  const { data: existingTeam, isSuccess: teamLoaded } = useMyFantasyTeam()
  if (teamLoaded && existingTeam) return <Navigate to="/squad" replace />
  return <OnboardingWizard />
}

function OnboardingWizard() {
  const navigate = useNavigate()
  const competitionId = useAuthStore(s => s.competitionId)
  const { mutate: createTeam, isPending, error } = useCreateTeam()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [pickedPlayers, setPickedPlayers] = useState<ApiPlayer[]>([])

  // Step 2
  const [formation, setFormationState] = useState('4-4-2')
  const [startingIds, setStartingIds] = useState<Set<number>>(new Set())
  const [benchOrderArr, setBenchOrderArr] = useState<number[]>([])

  // Step 3
  const [teamName, setTeamName] = useState('')
  const [captainId, setCaptainId] = useState<number | null>(null)
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null)

  const budget = useMemo(
    () => Math.round((100 - pickedPlayers.reduce((s, p) => s + p.currentPrice, 0)) * 10) / 10,
    [pickedPlayers]
  )

  const benchOrder = useMemo(
    () => Object.fromEntries(benchOrderArr.map((id, i) => [String(id), i + 1])),
    [benchOrderArr]
  )

  function addPlayer(p: ApiPlayer) {
    setPickedPlayers(prev => [...prev, p])
  }

  function removePlayer(p: ApiPlayer) {
    setPickedPlayers(prev => prev.filter(x => x.id !== p.id))
    setStartingIds(prev => { const n = new Set(prev); n.delete(p.id); return n })
    setBenchOrderArr(prev => prev.filter(id => id !== p.id))
    if (captainId === p.id) setCaptainId(null)
    if (viceCaptainId === p.id) setViceCaptainId(null)
  }

  // Called both when user clicks a formation pill AND when transitioning Step1→Step2
  // to ensure startingIds and benchOrderArr are always properly initialised.
  function changeFormation(f: string) {
    setFormationState(f)
    const gks = pickedPlayers.filter(p => p.position === 'GKP')
    const newStarters = gks.length === 1 ? new Set([gks[0].id]) : new Set<number>()
    setStartingIds(newStarters)
    setBenchOrderArr(pickedPlayers.filter(p => !newStarters.has(p.id)).map(p => p.id))
    setCaptainId(null)
    setViceCaptainId(null)
  }

  // Always syncs benchOrderArr after a toggle so the bench list stays consistent.
  function toggleStarter(playerId: number) {
    const player = pickedPlayers.find(p => p.id === playerId)
    if (!player) return

    let newStarters: Set<number>

    if (startingIds.has(playerId)) {
      newStarters = new Set(startingIds)
      newStarters.delete(playerId)
      if (captainId === playerId) setCaptainId(null)
      if (viceCaptainId === playerId) setViceCaptainId(null)
    } else {
      const [def, mid, fwd] = formation.split('-').map(Number)
      const required: Record<string, number> = { GKP: 1, DEF: def, MID: mid, FWD: fwd }
      const starters = pickedPlayers.filter(p => startingIds.has(p.id))
      if (starters.length >= 11) return
      if (starters.filter(p => p.position === player.position).length >= required[player.position]) return
      newStarters = new Set(startingIds)
      newStarters.add(playerId)
    }

    setStartingIds(newStarters)
    // Keep bench ordered: preserve existing order, append any newly benched players at end
    setBenchOrderArr(prev => {
      const bench = pickedPlayers.filter(p => !newStarters.has(p.id))
      const ordered = prev.filter(id => bench.some(p => p.id === id))
      const unordered = bench.filter(p => !prev.includes(p.id))
      return [...ordered, ...unordered.map(p => p.id)]
    })
  }

  // Initialise step 2 state before transitioning — ensures benchOrderArr has all non-starters.
  function handleStep1Next() {
    changeFormation(formation)
    setStep(2)
  }

  function moveBenchPlayer(playerId: number, direction: 'up' | 'down') {
    setBenchOrderArr(prev => {
      const idx = prev.indexOf(playerId)
      if (idx === -1) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next
    })
  }

  function handleCaptainTap(playerId: number) {
    if (captainId === playerId) {
      setCaptainId(null)
      setViceCaptainId(playerId)
    } else if (viceCaptainId === playerId) {
      setViceCaptainId(null)
    } else {
      setCaptainId(playerId)
      if (viceCaptainId === playerId) setViceCaptainId(null)
    }
  }

  function handleSubmit() {
    if (!captainId || !viceCaptainId) return
    createTeam(
      {
        competitionId,
        name: teamName.trim(),
        playerIds: pickedPlayers.map(p => p.id),
        formation,
        startingIds: [...startingIds],
        captainId,
        viceCaptainId,
        benchOrder,
      },
      { onSuccess: () => navigate('/squad', { replace: true }) }
    )
  }

  const STEPS = [
    { num: 1, label: 'Squad' },
    { num: 2, label: 'Formation' },
    { num: 3, label: 'Captain' },
  ] as const

  return (
    <div className="min-h-screen bg-game-bg flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-game-border bg-game-card/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-bangers text-xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="flex items-center gap-1">
            {STEPS.map((s, idx) => (
              <div key={s.num} className="flex items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${step === s.num
                    ? 'bg-game-neon text-game-bg shadow-[0_0_10px_rgba(0,255,135,0.5)]'
                    : step > s.num
                    ? 'bg-game-neon/25 text-game-neon border border-game-neon/40'
                    : 'bg-game-card text-slate-500 border border-game-border'}`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className={`text-xs font-bold ml-1 hidden sm:inline ${step === s.num ? 'text-game-neon' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {idx < 2 && <div className={`w-6 h-px mx-2 ${step > s.num ? 'bg-game-neon/40' : 'bg-game-border'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden max-w-6xl mx-auto w-full">
        {step === 1 && (
          <Step1PickPlayers
            pickedPlayers={pickedPlayers}
            budget={budget}
            onAdd={addPlayer}
            onRemove={removePlayer}
            onNext={handleStep1Next}
          />
        )}
        {step === 2 && (
          <Step2Formation
            pickedPlayers={pickedPlayers}
            formation={formation}
            startingIds={startingIds}
            benchOrderArr={benchOrderArr}
            onFormationChange={changeFormation}
            onToggleStarter={toggleStarter}
            onMoveBench={moveBenchPlayer}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Captain
            startingPlayers={pickedPlayers.filter(p => startingIds.has(p.id))}
            teamName={teamName}
            captainId={captainId}
            viceCaptainId={viceCaptainId}
            onTeamNameChange={setTeamName}
            onCaptainTap={handleCaptainTap}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error ? 'Failed to create team. Please try again.' : null}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: clean (no errors). If errors appear, fix them before continuing.

- [ ] **Step 4: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/pages/Onboarding.tsx apps/web/src/pages/onboarding/
git commit -m "feat(onboarding): wizard orchestrator with full step state management"
```

---

## Task 4: Step 1 — Pick 15 Players

**Files:**
- Modify: `apps/web/src/pages/onboarding/Step1PickPlayers.tsx` (replace placeholder)

- [ ] **Step 1: Implement Step1PickPlayers.tsx**

Replace `apps/web/src/pages/onboarding/Step1PickPlayers.tsx` with:

```tsx
import { useState, useMemo } from 'react'
import { usePlayers, useClubsMap } from '../../api/hooks'
import { JerseyIcon } from '../../components/ui/JerseyIcon'
import { PosBadge } from '../../components/ui/PosBadge'
import { Skeleton } from '../../components/ui/Skeleton'
import type { ApiPlayer } from '../../api/types'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

const POSITIONS: Position[] = ['GKP', 'DEF', 'MID', 'FWD']
const POS_REQUIRED: Record<Position, number> = { GKP: 2, DEF: 5, MID: 5, FWD: 3 }

interface Props {
  pickedPlayers: ApiPlayer[]
  budget: number
  onAdd: (p: ApiPlayer) => void
  onRemove: (p: ApiPlayer) => void
  onNext: () => void
}

function isSquadValid(players: ApiPlayer[], budget: number): boolean {
  if (players.length !== 15) return false
  const counts = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
  const clubCounts: Record<number, number> = {}
  for (const p of players) {
    counts[p.position]++
    clubCounts[p.clubId] = (clubCounts[p.clubId] ?? 0) + 1
    if (clubCounts[p.clubId] > 3) return false
  }
  return (
    counts.GKP === 2 && counts.DEF === 5 && counts.MID === 5 && counts.FWD === 3 && budget >= 0
  )
}

export function Step1PickPlayers({ pickedPlayers, budget, onAdd, onRemove, onNext }: Props) {
  const [posTab, setPosTab] = useState<Position>('GKP')
  const [mobileView, setMobileView] = useState<'list' | 'pitch'>('list')
  const [search, setSearch] = useState('')
  const [maxPrice, setMaxPrice] = useState(15)

  const clubsMap = useClubsMap()
  const { data, isLoading } = usePlayers({ position: posTab, limit: 200 })
  const players = data?.data ?? []

  const pickedIds = useMemo(() => new Set(pickedPlayers.map(p => p.id)), [pickedPlayers])
  const posCounts = useMemo(() => {
    const c = { GKP: 0, DEF: 0, MID: 0, FWD: 0 }
    for (const p of pickedPlayers) c[p.position]++
    return c
  }, [pickedPlayers])

  const clubCounts = useMemo(() => {
    const c: Record<number, number> = {}
    for (const p of pickedPlayers) c[p.clubId] = (c[p.clubId] ?? 0) + 1
    return c
  }, [pickedPlayers])

  const filtered = useMemo(() =>
    players.filter(p =>
      p.isAvailable &&
      p.currentPrice <= maxPrice &&
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.clubName.toLowerCase().includes(search.toLowerCase()))
    ),
    [players, search, maxPrice]
  )

  function canAdd(p: ApiPlayer): boolean {
    return (
      !pickedIds.has(p.id) &&
      posCounts[p.position] < POS_REQUIRED[p.position] &&
      (clubCounts[p.clubId] ?? 0) < 3 &&
      budget - p.currentPrice >= 0
    )
  }

  const isValid = isSquadValid(pickedPlayers, budget)

  const listPanel = (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex gap-1 px-3 pt-3 pb-2 flex-shrink-0">
        {POSITIONS.map(pos => {
          const filled = posCounts[pos]
          const req = POS_REQUIRED[pos]
          return (
            <button
              key={pos}
              onClick={() => setPosTab(pos)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold font-bangers tracking-wide transition-all
                ${posTab === pos
                  ? 'bg-game-neon/15 text-game-neon border border-game-neon/40'
                  : 'bg-game-card border border-game-border text-slate-400 hover:border-game-neon/30'}`}
            >
              {pos} {filled}/{req}
            </button>
          )
        })}
      </div>

      <div className="flex gap-2 px-3 pb-2 flex-shrink-0">
        <input
          type="text"
          placeholder="Search name or club..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1 bg-game-card border border-game-border rounded-lg px-3 py-1.5 text-xs
            text-slate-100 placeholder-slate-600 focus:outline-none focus:border-game-neon transition-all"
        />
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs text-game-gold font-bold">£{maxPrice}m</span>
          <input
            type="range" min={4} max={15} step={0.5} value={maxPrice}
            onChange={e => setMaxPrice(parseFloat(e.target.value))}
            className="w-16 accent-game-gold"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {isLoading ? (
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="game-card overflow-hidden">
            {filtered.map(p => {
              const isPicked = pickedIds.has(p.id)
              const addable = canAdd(p)
              const clubShort = clubsMap.get(p.clubId) ?? p.clubName.slice(0, 3).toUpperCase()
              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 px-3 py-2.5 border-b border-game-border/40 last:border-0
                    hover:bg-white/[0.025] transition-colors ${isPicked ? 'opacity-70' : ''}`}
                >
                  <JerseyIcon clubShort={clubShort} position={p.position} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-100 truncate">{p.name}</div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs text-slate-500 truncate">{p.clubName}</span>
                      <PosBadge pos={p.position} />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-game-gold flex-shrink-0">
                    £{p.currentPrice.toFixed(1)}m
                  </span>
                  {isPicked ? (
                    <button
                      onClick={() => onRemove(p)}
                      className="w-7 h-7 rounded-full bg-game-red/15 border border-game-red/30 text-game-red
                        text-xs font-bold flex items-center justify-center hover:bg-game-red/30 transition-colors flex-shrink-0"
                    >✕</button>
                  ) : (
                    <button
                      onClick={() => addable && onAdd(p)}
                      disabled={!addable}
                      className="w-7 h-7 rounded-full bg-game-neon/10 border border-game-neon/20 text-game-neon
                        text-xs font-bold flex items-center justify-center hover:bg-game-neon/25 transition-colors
                        disabled:opacity-25 disabled:cursor-not-allowed flex-shrink-0"
                    >+</button>
                  )}
                </div>
              )
            })}
            {filtered.length === 0 && !isLoading && (
              <div className="py-8 text-center text-slate-500 text-sm">No players match filters</div>
            )}
          </div>
        )}
      </div>
    </div>
  )

  const pitchPanel = (
    <div className="p-3 overflow-y-auto h-full">
      <div
        className="rounded-xl overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #0a260a 0%, #071a07 100%)',
          border: '1px solid rgba(34,80,34,0.6)',
        }}
      >
        {([
          { pos: 'GKP' as Position, count: 2 },
          { pos: 'DEF' as Position, count: 5 },
          { pos: 'MID' as Position, count: 5 },
          { pos: 'FWD' as Position, count: 3 },
        ] as const).map(({ pos, count }) => {
          const posPlayers = pickedPlayers.filter(p => p.position === pos)
          return (
            <div key={pos} className="flex justify-center gap-2 py-2.5">
              {Array.from({ length: count }).map((_, i) => {
                const player = posPlayers[i]
                if (!player) {
                  return (
                    <div key={i} className="flex flex-col items-center gap-0.5 w-12">
                      <div className="w-10 h-10 rounded-lg border border-dashed border-green-900/50
                        bg-black/20 flex items-center justify-center text-xs text-green-900/60">
                        {pos}
                      </div>
                      <div className="w-10 h-2.5 rounded bg-black/25" />
                    </div>
                  )
                }
                const clubShort = clubsMap.get(player.clubId) ?? player.clubName.slice(0, 3).toUpperCase()
                return (
                  <div
                    key={player.id}
                    onClick={() => onRemove(player)}
                    className="flex flex-col items-center gap-0.5 w-12 cursor-pointer group"
                  >
                    <div className="relative">
                      <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                      <div className="absolute inset-0 rounded-xl bg-game-red/0 group-hover:bg-game-red/40
                        transition-colors flex items-center justify-center">
                        <span className="text-white text-xs font-bold opacity-0 group-hover:opacity-100">✕</span>
                      </div>
                    </div>
                    <div className="text-center leading-tight text-slate-200 font-bold truncate w-full"
                      style={{ fontSize: '9px' }}>
                      {player.name.split(' ').pop()}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* Mobile tab switcher */}
      <div className="lg:hidden flex border-b border-game-border flex-shrink-0">
        <button
          onClick={() => setMobileView('list')}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors
            ${mobileView === 'list' ? 'text-game-neon border-b-2 border-game-neon' : 'text-slate-500'}`}
        >
          Players
          <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs
            ${mobileView === 'list' ? 'bg-game-neon text-game-bg' : 'bg-game-card text-slate-400'}`}>
            {pickedPlayers.length}
          </span>
        </button>
        <button
          onClick={() => setMobileView('pitch')}
          className={`flex-1 py-2.5 text-xs font-bold transition-colors
            ${mobileView === 'pitch' ? 'text-game-neon border-b-2 border-game-neon' : 'text-slate-500'}`}
        >
          Pitch
          <span className="ml-1.5 bg-game-card rounded-full px-1.5 py-0.5 text-xs text-slate-400">
            {pickedPlayers.length}/15
          </span>
        </button>
      </div>

      {/* Content: split on desktop, tab-controlled on mobile */}
      <div className="flex-1 overflow-hidden lg:grid lg:grid-cols-2">
        <div className={`h-full overflow-hidden ${mobileView === 'pitch' ? 'hidden lg:block' : ''}`}>
          {listPanel}
        </div>
        <div className={`h-full overflow-y-auto lg:border-l lg:border-game-border/50 ${mobileView === 'list' ? 'hidden lg:block' : ''}`}>
          {pitchPanel}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-game-border
        bg-game-card/60 flex-shrink-0">
        <div>
          <div className="text-xs text-slate-500 uppercase tracking-wider">Budget</div>
          <div className={`font-bangers text-lg tracking-wide ${budget < 5 ? 'text-game-red' : 'text-game-gold'}`}>
            £{Math.max(0, budget).toFixed(1)}m
          </div>
        </div>
        <div className="text-center text-xs text-slate-500">
          {pickedPlayers.length}/15 picked
        </div>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="btn-primary px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: clean. Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/pages/onboarding/Step1PickPlayers.tsx
git commit -m "feat(onboarding): Step 1 — player picker with split view and position tabs"
```

---

## Task 5: Step 2 — Formation + Starting XI

**Files:**
- Modify: `apps/web/src/pages/onboarding/Step2Formation.tsx` (replace placeholder)

- [ ] **Step 1: Implement Step2Formation.tsx**

Replace `apps/web/src/pages/onboarding/Step2Formation.tsx` with:

```tsx
import { useMemo } from 'react'
import { useClubsMap } from '../../api/hooks'
import { JerseyIcon } from '../../components/ui/JerseyIcon'
import type { ApiPlayer } from '../../api/types'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

const VALID_FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'] as const

interface Props {
  pickedPlayers: ApiPlayer[]
  formation: string
  startingIds: Set<number>
  benchOrderArr: number[]
  onFormationChange: (f: string) => void
  onToggleStarter: (playerId: number) => void
  onMoveBench: (playerId: number, direction: 'up' | 'down') => void
  onBack: () => void
  onNext: () => void
}

function getFormationCounts(f: string): Record<Position, number> {
  const [def, mid, fwd] = f.split('-').map(Number)
  return { GKP: 1, DEF: def, MID: mid, FWD: fwd }
}

function canStartPlayer(player: ApiPlayer, startingIds: Set<number>, formation: string, pickedPlayers: ApiPlayer[]): boolean {
  if (startingIds.has(player.id)) return true // already starting
  const required = getFormationCounts(formation)
  const starters = pickedPlayers.filter(p => startingIds.has(p.id))
  if (starters.length >= 11) return false
  const posCount = starters.filter(p => p.position === player.position).length
  return posCount < required[player.position]
}

function isStep2Valid(pickedPlayers: ApiPlayer[], startingIds: Set<number>, formation: string, benchOrderArr: number[]): boolean {
  if (benchOrderArr.length !== 4) return false
  const starters = pickedPlayers.filter(p => startingIds.has(p.id))
  if (starters.length !== 11) return false
  const required = getFormationCounts(formation)
  const gk = starters.filter(p => p.position === 'GKP').length
  const def = starters.filter(p => p.position === 'DEF').length
  const mid = starters.filter(p => p.position === 'MID').length
  const fwd = starters.filter(p => p.position === 'FWD').length
  return gk === required.GKP && def === required.DEF && mid === required.MID && fwd === required.FWD
}

export function Step2Formation({
  pickedPlayers, formation, startingIds, benchOrderArr,
  onFormationChange, onToggleStarter, onMoveBench, onBack, onNext,
}: Props) {
  const clubsMap = useClubsMap()
  const required = useMemo(() => getFormationCounts(formation), [formation])
  const isValid = isStep2Valid(pickedPlayers, startingIds, formation, benchOrderArr)

  const starters = useMemo(
    () => pickedPlayers.filter(p => startingIds.has(p.id)),
    [pickedPlayers, startingIds]
  )

  const benchPlayers = useMemo(
    () => benchOrderArr.map(id => pickedPlayers.find(p => p.id === id)!).filter(Boolean),
    [benchOrderArr, pickedPlayers]
  )

  // All players shown in their position rows. Starters = bright, bench = dimmed.
  // Pitch has no separate bench row — bench order is shown as a separate list below.
  function positionRows(): { pos: Position; players: ApiPlayer[] }[] {
    const byPos = (pos: Position) => {
      const all = pickedPlayers.filter(p => p.position === pos)
      return [
        ...all.filter(p => startingIds.has(p.id)),
        ...all.filter(p => !startingIds.has(p.id)),
      ]
    }
    return [
      { pos: 'GKP', players: byPos('GKP') },
      { pos: 'DEF', players: byPos('DEF') },
      { pos: 'MID', players: byPos('MID') },
      { pos: 'FWD', players: byPos('FWD') },
    ]
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Formation picker */}
        <div className="mb-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Formation</div>
          <div className="flex flex-wrap gap-2">
            {VALID_FORMATIONS.map(f => (
              <button
                key={f}
                onClick={() => onFormationChange(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-bangers tracking-wide transition-all
                  ${formation === f
                    ? 'bg-game-neon/15 text-game-neon border border-game-neon/50 shadow-[0_0_8px_rgba(0,255,135,0.2)]'
                    : 'bg-game-card border border-game-border text-slate-400 hover:border-game-neon/30'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Tap players to toggle starter (bright) / bench (dim). {11 - starters.length > 0 ? `${11 - starters.length} starters left to pick.` : 'Starting XI complete.'}
          </p>
        </div>

        {/* Pitch — all 15 players in position rows, starters bright / bench dimmed */}
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{
            background: 'linear-gradient(180deg, #0a260a 0%, #071a07 100%)',
            border: '1px solid rgba(34,80,34,0.6)',
          }}
        >
          {positionRows().map(({ pos, players }) => (
            <div key={pos} className="flex justify-center gap-1.5 py-2.5">
              {players.map(player => {
                const isStarter = startingIds.has(player.id)
                const clubShort = clubsMap.get(player.clubId) ?? player.clubName.slice(0, 3).toUpperCase()
                return (
                  <div
                    key={player.id}
                    onClick={() => onToggleStarter(player.id)}
                    className={`flex flex-col items-center gap-0.5 w-13 cursor-pointer group transition-opacity
                      ${isStarter ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                  >
                    <div className="relative">
                      <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                      <div className={`absolute inset-0 rounded-xl transition-colors
                        ${isStarter
                          ? 'bg-black/0 group-hover:bg-game-red/20'
                          : 'bg-black/0 group-hover:bg-game-neon/20'}`} />
                    </div>
                    <div className={`text-center font-bold truncate w-full leading-tight
                      ${isStarter ? 'text-slate-200' : 'text-slate-500'}`} style={{ fontSize: '9px' }}>
                      {player.name.split(' ').pop()}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bench priority — only shown once all 11 starters are picked */}
        {starters.length === 11 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Bench order (auto-sub priority)
            </div>
            <div className="flex flex-col gap-1.5">
              {benchPlayers.map((player, i) => {
                const clubShort = clubsMap.get(player.clubId) ?? player.clubName.slice(0, 3).toUpperCase()
                return (
                  <div key={player.id} className="flex items-center gap-3 game-card px-3 py-2">
                    <span className="text-xs font-bold text-slate-500 w-4">{i + 1}</span>
                    <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                    <span className="text-xs font-bold text-slate-300 flex-1">{player.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onMoveBench(player.id, 'up')}
                        disabled={i === 0}
                        className="text-slate-500 hover:text-game-sky disabled:opacity-20 text-sm leading-none px-1"
                      >▲</button>
                      <button
                        onClick={() => onMoveBench(player.id, 'down')}
                        disabled={i === benchPlayers.length - 1}
                        className="text-slate-500 hover:text-game-sky disabled:opacity-20 text-sm leading-none px-1"
                      >▼</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-game-border
        bg-game-card/60 flex-shrink-0">
        <button onClick={onBack} className="btn-secondary px-4 py-2.5 text-sm">← Back</button>
        <div className="text-xs text-slate-500 text-center">
          {starters.length}/11 starters
        </div>
        <button
          onClick={onNext}
          disabled={!isValid}
          className="btn-primary px-5 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/pages/onboarding/Step2Formation.tsx
git commit -m "feat(onboarding): Step 2 — formation picker with pitch toggle for starting XI"
```

---

## Task 6: Step 3 — Captain + Submit

**Files:**
- Modify: `apps/web/src/pages/onboarding/Step3Captain.tsx` (replace placeholder)

- [ ] **Step 1: Implement Step3Captain.tsx**

Replace `apps/web/src/pages/onboarding/Step3Captain.tsx` with:

```tsx
import { useClubsMap } from '../../api/hooks'
import { JerseyIcon } from '../../components/ui/JerseyIcon'
import type { ApiPlayer } from '../../api/types'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

interface Props {
  startingPlayers: ApiPlayer[]
  teamName: string
  captainId: number | null
  viceCaptainId: number | null
  onTeamNameChange: (name: string) => void
  onCaptainTap: (playerId: number) => void
  onBack: () => void
  onSubmit: () => void
  isPending: boolean
  error: string | null
}

function groupByPosition(players: ApiPlayer[]): Record<Position, ApiPlayer[]> {
  const g: Record<Position, ApiPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) g[p.position].push(p)
  return g
}

export function Step3Captain({
  startingPlayers, teamName, captainId, viceCaptainId,
  onTeamNameChange, onCaptainTap, onBack, onSubmit, isPending, error,
}: Props) {
  const clubsMap = useClubsMap()
  const grouped = groupByPosition(startingPlayers)

  const canSubmit =
    teamName.trim().length > 0 &&
    captainId !== null &&
    viceCaptainId !== null &&
    !isPending

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Team name */}
        <div className="mb-5">
          <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">
            Team Name
          </label>
          <input
            type="text"
            value={teamName}
            onChange={e => onTeamNameChange(e.target.value)}
            maxLength={50}
            placeholder="My Fantasy FC"
            className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
              text-sm text-slate-100 placeholder-slate-600 focus:outline-none
              focus:border-game-neon transition-all font-nunito"
          />
        </div>

        {/* Captain instructions */}
        <div className="mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
            Captain + Vice-Captain
          </div>
          <p className="text-xs text-slate-600">
            Tap once = Captain (gold C) · Tap again = Vice-Captain (blue VC) · Third tap = clear
          </p>
        </div>

        {/* Starting XI pitch (captain picker) */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #0a260a 0%, #071a07 100%)',
            border: '1px solid rgba(34,80,34,0.6)',
          }}
        >
          {(['GKP', 'DEF', 'MID', 'FWD'] as Position[]).map(pos => {
            const players = grouped[pos]
            if (players.length === 0) return null
            return (
              <div key={pos} className="flex justify-center gap-2 py-2.5">
                {players.map(player => {
                  const isCaptain = captainId === player.id
                  const isVC = viceCaptainId === player.id
                  const clubShort = clubsMap.get(player.clubId) ?? player.clubName.slice(0, 3).toUpperCase()
                  return (
                    <div
                      key={player.id}
                      onClick={() => onCaptainTap(player.id)}
                      className="flex flex-col items-center gap-0.5 w-14 cursor-pointer group"
                    >
                      <div className="relative">
                        <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                        {isCaptain && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                            bg-game-gold flex items-center justify-center font-bangers text-xs text-game-bg
                            shadow-[0_0_6px_rgba(255,214,10,0.6)] border border-yellow-300">
                            C
                          </div>
                        )}
                        {isVC && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                            bg-game-sky flex items-center justify-center font-bangers text-xs text-game-bg
                            shadow-[0_0_6px_rgba(56,189,248,0.5)] border border-sky-300">
                            V
                          </div>
                        )}
                        {!isCaptain && !isVC && (
                          <div className="absolute inset-0 rounded-xl bg-game-gold/0
                            group-hover:bg-game-gold/15 transition-colors" />
                        )}
                      </div>
                      <div
                        className={`text-center font-bold truncate w-full leading-tight
                          ${isCaptain ? 'text-game-gold' : isVC ? 'text-game-sky' : 'text-slate-200'}`}
                        style={{ fontSize: '9px' }}
                      >
                        {player.name.split(' ').pop()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Status summary */}
        <div className="flex gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bangers text-xs
              ${captainId ? 'bg-game-gold text-game-bg' : 'bg-game-card text-slate-500 border border-game-border'}`}>
              C
            </div>
            <span className={captainId ? 'text-game-gold' : 'text-slate-500'}>
              {captainId ? (startingPlayers.find(p => p.id === captainId)?.name.split(' ').pop() ?? '?') : 'None'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bangers text-xs
              ${viceCaptainId ? 'bg-game-sky text-game-bg' : 'bg-game-card text-slate-500 border border-game-border'}`}>
              V
            </div>
            <span className={viceCaptainId ? 'text-game-sky' : 'text-slate-500'}>
              {viceCaptainId ? (startingPlayers.find(p => p.id === viceCaptainId)?.name.split(' ').pop() ?? '?') : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-game-border bg-game-card/60 flex-shrink-0">
        {error && (
          <div className="mb-3 px-3 py-2 bg-game-red/10 border border-game-red/30 rounded-lg
            text-game-red text-xs font-bold text-center">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="btn-secondary px-4 py-2.5 text-sm">← Back</button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="btn-primary px-6 py-2.5 text-sm font-bangers tracking-wider
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Creating...' : '✨ CREATE TEAM'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: clean. Fix any errors before continuing.

- [ ] **Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/pages/onboarding/Step3Captain.tsx
git commit -m "feat(onboarding): Step 3 — captain picker and team name with submit"
```

---

## Task 7: Final check and smoke test

**Files:** None — verification only.

- [ ] **Step 1: Full TypeScript check across both apps**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web && pnpm exec tsc --noEmit
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api && pnpm exec tsc --noEmit
```

Expected: clean for both.

- [ ] **Step 2: Start API + frontend and walk through the flow**

In terminal 1 (API):
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm start:dev
```

In terminal 2 (web):
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm dev
```

Walk through:
1. Open `http://localhost:5173/register` → create a new user (email not previously used)
2. Confirm redirect lands on `http://localhost:5173/onboarding`
3. Step 1: pick 15 players (2 GKP, 5 DEF, 5 MID, 3 FWD) — "Next →" stays disabled until exactly 15 with correct counts
4. Step 2: pick a formation, click 11 players as starters, check bench reorder — "Next →" stays disabled until 11 valid starters + 4 bench
5. Step 3: enter team name, tap captain + VC, click "✨ CREATE TEAM"
6. Confirm redirect to `/squad` and squad loads with the new team
7. Log out, log back in, confirm `/squad` loads directly (no redirect to `/onboarding`)
8. Visit `http://localhost:5173/onboarding` manually → confirm immediate redirect to `/squad`

- [ ] **Step 3: Final commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add -p  # review any uncommitted changes
git commit -m "feat(onboarding): complete 3-step team creation wizard"
```
