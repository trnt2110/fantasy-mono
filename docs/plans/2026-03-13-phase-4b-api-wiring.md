# Phase 4b — API Wiring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace all mock data in `apps/web` with real API calls using axios + TanStack Query + Zustand, add Login/Register auth pages, and wire the Sidebar + all 4 pages to live data.

**Architecture:** Axios client with JWT Bearer interceptor and automatic 401→refresh retry. Zustand stores for auth state (tokens + user) and draft state (pending transfers). TanStack Query hooks for all server state. React Router v7 routes for `/login`, `/register`, and a protected app shell. Components receive API-shaped data; jersey colors use a clubs lookup map (since the players API returns `clubId` not `clubShort`).

**Tech Stack:** React 19, Vite 8, React Router v7, TanStack Query v5, Zustand v5, axios, TypeScript 5.9

---

## Key Context

- **API base:** `http://localhost:3001` (NestJS, port set via `PORT=3001` in start command)
- **All player endpoints** require `?competitionId=` — we hardcode `39` (Premier League) for this phase
- **JWT flow:** access token (15 min) in Zustand; refresh token (7 days) also in Zustand; `POST /auth/refresh` body `{ refreshToken }` → returns new `{ accessToken, refreshToken }`
- **API response envelope:** `{ data: T }` for single; `{ data: T[], meta: {...} }` for lists
- **Club short codes:** `/players` returns `clubId`+`clubName` but NOT `clubShort`. We fetch clubs once via `GET /clubs?competitionId=39` and build a `Map<clubId, shortName>` to pass to `JerseyIcon`
- **Mock typo:** `Player.isCapitain` → fix to `isCaptain` everywhere when wiring (api returns `isCaptain`)
- **No form/totalPoints** in players list API response — remove those columns from player list view
- **Routing:** Add `/login` and `/register` routes; keep internal tab state (`useState`) for squad/players/fixtures/leagues (no URL per tab in this phase)
- **`src/data/mock.ts`** stays but is no longer imported anywhere after wiring

---

## Task 1: Env config + Vite proxy

**Files:**
- Create: `apps/web/.env.local`
- Modify: `apps/web/vite.config.ts`

**Step 1: Create `.env.local`**

```
VITE_API_URL=http://localhost:3001
```

**Step 2: Add Vite dev proxy to avoid CORS**

Read `apps/web/vite.config.ts` first. It currently looks like:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({ plugins: [react()] })
```

Update it to:
```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

**Step 3: Commit**
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/.env.local apps/web/vite.config.ts
git commit -m "feat(web): add vite proxy for api dev server"
```

---

## Task 2: API types

**Files:**
- Create: `apps/web/src/api/types.ts`

Define TypeScript interfaces matching all API response shapes from `api.md`. No runtime code, types only.

**Step 1: Create `src/api/types.ts`**

```ts
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
  id: number; name: string; shortName: string; city: string; logoUrl: string; isAliased: boolean
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
  bonus: number; totalPoints: number
  pointsBreakdown: Record<string, number>; isFinalised: boolean
}

// Gameweeks
export interface ApiGameweek {
  id: number; competitionId: number; number: number
  deadlineTime: string; status: 'SCHEDULED' | 'ACTIVE' | 'SCORING' | 'FINISHED'; isCurrent: boolean
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
  gameweekId: number; gameweekNumber: number; points: number; totalPoints: number; rank: number; isFinalised: boolean
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
}
export interface ApiLeagueStanding extends ApiLeaderboardEntry {
  joinedAt: string
}
```

**Step 2: Commit**
```bash
git add apps/web/src/api/types.ts
git commit -m "feat(web): add API response types"
```

---

## Task 3: API client (axios + JWT interceptors)

**Files:**
- Create: `apps/web/src/api/client.ts`

**Step 1: Create `src/api/client.ts`**

This is the most important file. It handles:
- Base URL from env
- Attaching `Authorization: Bearer <token>` on every request
- Intercepting 401 responses → calling `/auth/refresh` → retrying the original request once
- On refresh failure → clearing auth state + redirecting to `/login`

The Zustand stores don't exist yet (Task 4). To avoid a circular dependency, the client reads tokens from a module-level `getTokens` function that we'll register after the store is created. Use a simple callback pattern:

```ts
import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'

// Callbacks registered by auth.store after creation — avoids circular import
let _getAccessToken: (() => string | null) = () => null
let _getRefreshToken: (() => string | null) = () => null
let _onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) = () => {}
let _onLogout: (() => void) = () => {}

export function registerAuthCallbacks(callbacks: {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  onTokensRefreshed: (accessToken: string, refreshToken: string) => void
  onLogout: () => void
}) {
  _getAccessToken = callbacks.getAccessToken
  _getRefreshToken = callbacks.getRefreshToken
  _onTokensRefreshed = callbacks.onTokensRefreshed
  _onLogout = callbacks.onLogout
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = _getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 → refresh once → retry
let isRefreshing = false
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(p => error ? p.reject(error) : p.resolve(token!))
  pendingQueue = []
}

apiClient.interceptors.response.use(
  res => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error)

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then(token => {
        if (original.headers) original.headers['Authorization'] = `Bearer ${token}`
        return apiClient(original)
      })
    }

    original._retry = true
    isRefreshing = true
    const refreshToken = _getRefreshToken()

    if (!refreshToken) {
      isRefreshing = false
      _onLogout()
      return Promise.reject(error)
    }

    try {
      const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
      )
      const { accessToken, refreshToken: newRefresh } = data.data
      _onTokensRefreshed(accessToken, newRefresh)
      processQueue(null, accessToken)
      if (original.headers) original.headers['Authorization'] = `Bearer ${accessToken}`
      return apiClient(original)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      _onLogout()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)
```

**Step 2: Commit**
```bash
git add apps/web/src/api/client.ts
git commit -m "feat(web): add axios API client with JWT + refresh interceptors"
```

---

## Task 4: Auth store (Zustand)

**Files:**
- Create: `apps/web/src/store/auth.store.ts`

**Step 1: Create `src/store/auth.store.ts`**

Stores: `accessToken`, `refreshToken`, `user`, `fantasyTeamId`, `competitionId`, `budget`. Persists to `localStorage` via Zustand's persist middleware. Registers auth callbacks on the API client.

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerAuthCallbacks } from '../api/client'
import type { AuthUser } from '../api/types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  fantasyTeamId: string | null
  competitionId: number
  budget: number
  setAuth: (tokens: { accessToken: string; refreshToken: string }, user: AuthUser) => void
  setFantasyTeam: (fantasyTeamId: string, budget: number) => void
  refreshTokens: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      fantasyTeamId: null,
      competitionId: 39, // Premier League — default for MVP
      budget: 0,
      setAuth: (tokens, user) => set({ ...tokens, user }),
      setFantasyTeam: (fantasyTeamId, budget) => set({ fantasyTeamId, budget }),
      refreshTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null, fantasyTeamId: null }),
    }),
    { name: 'fantasy-auth' }
  )
)

// Register callbacks so the API client can read/write tokens without circular imports
registerAuthCallbacks({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (accessToken, refreshToken) =>
    useAuthStore.getState().refreshTokens(accessToken, refreshToken),
  onLogout: () => {
    useAuthStore.getState().clearAuth()
    window.location.href = '/login'
  },
})
```

**Step 2: Import store in `main.tsx`** to ensure callbacks register at app startup.

In `apps/web/src/main.tsx`, add this import at the top (before App):
```ts
import './store/auth.store'  // ensures auth callbacks register at startup
```

**Step 3: Commit**
```bash
git add apps/web/src/store/auth.store.ts apps/web/src/main.tsx
git commit -m "feat(web): add auth Zustand store with token persistence"
```

---

## Task 5: Draft store (Zustand)

**Files:**
- Create: `apps/web/src/store/draft.store.ts`

**Step 1: Create `src/store/draft.store.ts`**

Holds in-progress transfer state: the player being transferred out and the candidate player in. Not persisted (ephemeral UI state).

```ts
import { create } from 'zustand'
import type { ApiPick, ApiPlayer } from '../api/types'

interface DraftState {
  playerOut: ApiPick | null   // player in current squad being replaced
  playerIn: ApiPlayer | null  // candidate replacement from player list
  setPlayerOut: (player: ApiPick | null) => void
  setPlayerIn: (player: ApiPlayer | null) => void
  clearDraft: () => void
}

export const useDraftStore = create<DraftState>()((set) => ({
  playerOut: null,
  playerIn: null,
  setPlayerOut: (playerOut) => set({ playerOut }),
  setPlayerIn: (playerIn) => set({ playerIn }),
  clearDraft: () => set({ playerOut: null, playerIn: null }),
}))
```

**Step 2: Commit**
```bash
git add apps/web/src/store/draft.store.ts
git commit -m "feat(web): add draft Zustand store for transfer staging"
```

---

## Task 6: TanStack Query hooks

**Files:**
- Create: `apps/web/src/api/hooks/useAuth.ts`
- Create: `apps/web/src/api/hooks/useClubs.ts`
- Create: `apps/web/src/api/hooks/useCurrentGameweek.ts`
- Create: `apps/web/src/api/hooks/useSquad.ts`
- Create: `apps/web/src/api/hooks/usePlayers.ts`
- Create: `apps/web/src/api/hooks/useFixtures.ts`
- Create: `apps/web/src/api/hooks/useLeaderboard.ts`
- Create: `apps/web/src/api/hooks/useFantasyLeagues.ts`
- Create: `apps/web/src/api/hooks/usePlayerPerformances.ts`
- Create: `apps/web/src/api/hooks/index.ts` (re-exports all)

### `src/api/hooks/useAuth.ts`

Auth mutations (login, register, logout). NOT query hooks — these are `useMutation`.

```ts
import { useMutation } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, AuthTokens, AuthUser } from '../types'

export function useLogin() {
  const { setAuth } = useAuthStore()
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const res = await apiClient.post<ApiResponse<AuthTokens & { user: AuthUser }>>('/auth/login', creds)
      return res.data.data
    },
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setAuth({ accessToken, refreshToken }, user)
    },
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (body: { email: string; username: string; password: string }) => {
      const res = await apiClient.post<ApiResponse<AuthTokens & { user: AuthUser }>>('/auth/register', body)
      return res.data.data
    },
  })
}

export function useLogout() {
  const { refreshToken, clearAuth } = useAuthStore()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout', { refreshToken })
    },
    onSettled: () => clearAuth(),
  })
}
```

> **Note:** The login response from the API returns `{ data: { accessToken, refreshToken } }`. The API design doesn't include `user` in the login response — only tokens. After login, the client must call `GET /users/me` to get the user object. See `useMe` below.

Updated `useLogin`:
```ts
export function useLogin() {
  const { setAuth } = useAuthStore()
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const tokensRes = await apiClient.post<ApiResponse<AuthTokens>>('/auth/login', creds)
      const tokens = tokensRes.data.data
      // Fetch user profile immediately after login
      const meRes = await apiClient.get<ApiResponse<AuthUser>>('/users/me', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      return { ...tokens, user: meRes.data.data }
    },
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setAuth({ accessToken, refreshToken }, user)
    },
  })
}
```

### `src/api/hooks/useClubs.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiClub } from '../types'

export function useClubs() {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['clubs', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiClub>>('/clubs', { params: { competitionId } })
      return res.data.data
    },
    staleTime: 10 * 60 * 1000, // 10 min — clubs rarely change
  })
}

/** Build a Map<clubId, shortName> from clubs list — used for JerseyIcon */
export function useClubsMap() {
  const { data: clubs } = useClubs()
  return new Map(clubs?.map(c => [c.id, c.shortName]) ?? [])
}
```

### `src/api/hooks/useCurrentGameweek.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiGameweek } from '../types'

export function useCurrentGameweek() {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['gameweek', 'current', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiGameweek>>('/gameweeks/current', {
        params: { competitionId },
      })
      return res.data.data
    },
    staleTime: 2 * 60 * 1000, // 2 min
  })
}
```

### `src/api/hooks/useSquad.ts`

Fetches my fantasy team + current GW picks.

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiFantasyTeam, ApiListResponse, ApiPick } from '../types'

export function useMyFantasyTeam() {
  const { competitionId, accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['fantasy-team', 'mine', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiFantasyTeam>>('/fantasy-teams/mine', {
        params: { competitionId },
      })
      const team = res.data.data
      useAuthStore.getState().setFantasyTeam(team.id, team.budget)
      return team
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  })
}

export function useGwPicks(gameweekId: number | undefined) {
  const { fantasyTeamId, accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['picks', gameweekId, fantasyTeamId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPick>>(`/picks/${gameweekId}`, {
        params: { fantasyTeamId },
      })
      return res.data.data
    },
    enabled: !!gameweekId && !!fantasyTeamId && !!accessToken,
    staleTime: 60 * 1000,
  })
}

export function useSubmitPicks(gameweekId: number | undefined) {
  const qc = useQueryClient()
  const { fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (body: {
      startingPlayerIds: number[]
      captainId: number
      viceCaptainId: number
      benchOrder: Record<string, number>
    }) => {
      await apiClient.put(`/picks/${gameweekId}`, { fantasyTeamId, ...body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picks', gameweekId] }),
  })
}
```

### `src/api/hooks/usePlayers.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiPlayer, ApiPlayerDetail, ApiPlayerPerformance, ApiResponse } from '../types'

export interface PlayerFilters {
  position?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

export function usePlayers(filters: PlayerFilters = {}) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['players', competitionId, filters],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPlayer>>('/players', {
        params: { competitionId, ...filters },
      })
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev,
  })
}

export function usePlayerDetail(playerId: number | null) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['player', playerId, competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiPlayerDetail>>(`/players/${playerId}`, {
        params: { competitionId },
      })
      return res.data.data
    },
    enabled: playerId !== null,
    staleTime: 10 * 60 * 1000,
  })
}

export function usePlayerPerformances(playerId: number | null) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['player-performances', playerId, competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPlayerPerformance>>(
        `/players/${playerId}/performances`,
        { params: { competitionId } }
      )
      return res.data.data
    },
    enabled: playerId !== null,
    staleTime: 5 * 60 * 1000,
  })
}
```

### `src/api/hooks/useFixtures.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import type { ApiListResponse, ApiFixture } from '../types'

export function useFixtures(gameweekId: number | undefined) {
  return useQuery({
    queryKey: ['fixtures', gameweekId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiFixture>>('/fixtures', {
        params: { gameweekId },
      })
      return res.data.data
    },
    enabled: !!gameweekId,
    staleTime: 30 * 60 * 1000,
  })
}
```

### `src/api/hooks/useLeaderboard.ts`

```ts
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiLeaderboardEntry } from '../types'

export function useGlobalLeaderboard(gameweekId?: number, page = 1) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['leaderboard', 'global', competitionId, gameweekId, page],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiLeaderboardEntry>>('/leaderboard/global', {
        params: { competitionId, gameweekId, page, limit: 20 },
      })
      return res.data
    },
    staleTime: 5 * 60 * 1000,
  })
}
```

### `src/api/hooks/useFantasyLeagues.ts`

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiListResponse, ApiFantasyLeague, ApiLeagueStanding } from '../types'

export function useMyLeagues() {
  const { accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['fantasy-leagues', 'mine'],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiFantasyLeague>>('/fantasy-leagues/mine')
      return res.data.data
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLeagueStandings(leagueId: number | null) {
  return useQuery({
    queryKey: ['league-standings', leagueId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiLeagueStanding>>(
        `/fantasy-leagues/${leagueId}/standings`
      )
      return res.data.data
    },
    enabled: leagueId !== null,
    staleTime: 5 * 60 * 1000,
  })
}

export function useJoinLeague() {
  const qc = useQueryClient()
  const { fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyLeague>>('/fantasy-leagues/join', {
        code,
        fantasyTeamId,
      })
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fantasy-leagues', 'mine'] }),
  })
}

export function useCreateLeague() {
  const qc = useQueryClient()
  const { competitionId, fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyLeague>>('/fantasy-leagues', {
        name,
        competitionId,
        fantasyTeamId,
      })
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fantasy-leagues', 'mine'] }),
  })
}
```

### `src/api/hooks/index.ts`

```ts
export * from './useAuth'
export * from './useClubs'
export * from './useCurrentGameweek'
export * from './useSquad'
export * from './usePlayers'
export * from './useFixtures'
export * from './useLeaderboard'
export * from './useFantasyLeagues'
```

**Step 2: Commit**
```bash
git add apps/web/src/api/
git commit -m "feat(web): add TanStack Query hooks for all API endpoints"
```

---

## Task 7: Auth pages + routing

**Files:**
- Create: `apps/web/src/pages/Login.tsx`
- Create: `apps/web/src/pages/Register.tsx`
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Modify: `apps/web/src/App.tsx` (add Routes)

### `src/pages/Login.tsx`

```tsx
import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const accessToken = useAuthStore(s => s.accessToken)
  const { mutate: login, isPending, error } = useLogin()

  // Already logged in → redirect
  useEffect(() => { if (accessToken) navigate('/') }, [accessToken, navigate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    login({ email, password }, { onSuccess: () => navigate('/') })
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <span className="font-bangers text-4xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="text-slate-500 text-sm mt-1">Sign in to your account</div>
        </div>

        <form onSubmit={handleSubmit} className="game-card p-6 flex flex-col gap-4">
          <div>
            <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                focus:border-game-neon transition-all font-nunito"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                focus:border-game-neon transition-all font-nunito"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="text-game-red text-sm text-center font-bold">
              Invalid email or password
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary py-3 text-lg mt-1 disabled:opacity-50"
          >
            {isPending ? 'Signing in...' : '⚡ SIGN IN'}
          </button>

          <div className="text-center text-sm text-slate-500">
            No account?{' '}
            <Link to="/register" className="text-game-neon font-bold hover:underline">
              Register
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

### `src/pages/Register.tsx`

```tsx
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useRegister, useLogin } from '../api/hooks'

export function Register() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()
  const { mutate: register, isPending, error } = useRegister()
  const { mutate: login } = useLogin()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    register(
      { email, username, password },
      {
        onSuccess: () => {
          // Auto-login after registration
          login({ email, password }, { onSuccess: () => navigate('/') })
        },
      }
    )
  }

  return (
    <div className="min-h-screen bg-game-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <span className="font-bangers text-4xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="text-slate-500 text-sm mt-1">Create your account</div>
        </div>

        <form onSubmit={handleSubmit} className="game-card p-6 flex flex-col gap-4">
          {[
            { label: 'Email', type: 'email', value: email, setValue: setEmail, placeholder: 'you@example.com' },
            { label: 'Username', type: 'text', value: username, setValue: setUsername, placeholder: 'Gaffer99' },
            { label: 'Password', type: 'password', value: password, setValue: setPassword, placeholder: '••••••••' },
          ].map(({ label, type, value, setValue, placeholder }) => (
            <div key={label}>
              <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
                {label}
              </label>
              <input
                type={type}
                value={value}
                onChange={e => setValue(e.target.value)}
                required
                placeholder={placeholder}
                className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                  text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                  focus:border-game-neon transition-all font-nunito"
              />
            </div>
          ))}

          {error && (
            <div className="text-game-red text-sm text-center font-bold">
              Registration failed. Email may already be in use.
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary py-3 text-lg mt-1 disabled:opacity-50"
          >
            {isPending ? 'Creating account...' : '✨ CREATE ACCOUNT'}
          </button>

          <div className="text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="text-game-neon font-bold hover:underline">
              Sign in
            </Link>
          </div>
        </form>
      </div>
    </div>
  )
}
```

### `src/components/ProtectedRoute.tsx`

```tsx
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const accessToken = useAuthStore(s => s.accessToken)
  if (!accessToken) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

### Update `src/App.tsx` to use React Router routes

Replace the entire file:

```tsx
import { Routes, Route } from 'react-router-dom'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/*" element={
        <ProtectedRoute>
          <AppShell />
        </ProtectedRoute>
      } />
    </Routes>
  )
}
```

### Create `src/components/AppShell.tsx`

Extract the current App shell (sidebar + content area + bottom nav) into its own component. This is essentially the current `App()` body but with the page state routing and wired header data.

```tsx
import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { BottomNav } from './BottomNav'
import { SquadSelection } from '../pages/SquadSelection'
import { PlayerSelection } from '../pages/PlayerSelection'
import { Fixtures } from '../pages/Fixtures'
import { Leagues } from '../pages/Leagues'
import { useAuthStore } from '../store/auth.store'
import { useMyFantasyTeam } from '../api/hooks'

export function AppShell() {
  const [page, setPage] = useState('squad')
  const user = useAuthStore(s => s.user)
  const budget = useAuthStore(s => s.budget)
  // Prefetch the user's fantasy team on shell mount
  useMyFantasyTeam()

  return (
    <div className="h-screen overflow-hidden bg-game-bg flex">
      <Sidebar active={page} onChange={setPage} />

      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-64">
        {/* Mobile top bar */}
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
  )
}
```

**Step 2: Commit**
```bash
git add apps/web/src/pages/Login.tsx apps/web/src/pages/Register.tsx \
        apps/web/src/components/ProtectedRoute.tsx \
        apps/web/src/components/AppShell.tsx apps/web/src/App.tsx
git commit -m "feat(web): add login/register pages + ProtectedRoute + React Router routing"
```

---

## Task 8: DeadlineCountdown component

**Files:**
- Create: `apps/web/src/components/DeadlineCountdown.tsx`

Used in Sidebar, AppShell header, SquadSelection header, and Fixtures page.

```tsx
import { useState, useEffect } from 'react'

interface Props {
  deadlineTime: string   // ISO 8601 string from API
  className?: string
}

function pad(n: number) { return String(n).padStart(2, '0') }

export function DeadlineCountdown({ deadlineTime, className = '' }: Props) {
  const [timeLeft, setTimeLeft] = useState('')
  const [isPast, setIsPast] = useState(false)

  useEffect(() => {
    function update() {
      const diff = new Date(deadlineTime).getTime() - Date.now()
      if (diff <= 0) { setIsPast(true); setTimeLeft('DEADLINE PASSED'); return }
      const h = Math.floor(diff / 3600000)
      const m = Math.floor((diff % 3600000) / 60000)
      const s = Math.floor((diff % 60000) / 1000)
      setTimeLeft(h > 0 ? `${h}h ${pad(m)}m ${pad(s)}s` : `${pad(m)}m ${pad(s)}s`)
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [deadlineTime])

  return (
    <span className={`${isPast ? 'text-game-red' : 'text-game-fire'} font-bold ${className}`}>
      {timeLeft}
    </span>
  )
}
```

**Step 2: Commit**
```bash
git add apps/web/src/components/DeadlineCountdown.tsx
git commit -m "feat(web): add DeadlineCountdown component with setInterval"
```

---

## Task 9: Wire Sidebar

**Files:**
- Modify: `apps/web/src/components/Sidebar.tsx`

Replace hardcoded GW/bank/user data with real data from Zustand + `useCurrentGameweek`.

Key changes:
1. Accept `active`/`onChange` props (already there — keep them)
2. Add `useAuthStore` for user + budget
3. Add `useCurrentGameweek` for GW number + deadline
4. Replace `useLogout` handler on the user button

```tsx
import { useAuthStore } from '../store/auth.store'
import { useCurrentGameweek, useLogout } from '../api/hooks'
import { DeadlineCountdown } from './DeadlineCountdown'

// In the component body, add:
const user = useAuthStore(s => s.user)
const budget = useAuthStore(s => s.budget)
const { data: gw } = useCurrentGameweek()
const { mutate: logout } = useLogout()

// Replace hardcoded GW number:
//   "GW30 DEADLINE" → `GW${gw?.number ?? '—'} DEADLINE`

// Replace hardcoded deadline:
//   "Sat 14 Mar, 20:30" → <DeadlineCountdown deadlineTime={gw?.deadlineTime ?? ''} />

// Replace hardcoded bank:
//   "£8.1m" → `£${budget.toFixed(1)}m`

// Replace hardcoded user card:
//   "Dragon Warriors" → user?.username ?? 'Loading...'
//   "Trung Nguyen Thanh" → user?.email ?? ''
//   onClick → logout()
```

The full updated Sidebar:

```tsx
import { useAuthStore } from '../store/auth.store'
import { useCurrentGameweek, useLogout } from '../api/hooks'
import { DeadlineCountdown } from './DeadlineCountdown'

const NAV_ITEMS = [
  { id: 'squad',    icon: '⚽', label: 'My Squad',   sub: 'Team & transfers' },
  { id: 'players',  icon: '🔍', label: 'Players',    sub: 'Browse & pick' },
  { id: 'fixtures', icon: '📅', label: 'Fixtures',   sub: 'Schedule' },
  { id: 'leagues',  icon: '🏆', label: 'Leagues',    sub: 'Standings' },
]

export function Sidebar({ active, onChange }: { active: string; onChange: (id: string) => void }) {
  const user = useAuthStore(s => s.user)
  const budget = useAuthStore(s => s.budget)
  const { data: gw } = useCurrentGameweek()
  const { mutate: logout } = useLogout()

  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 z-40
      bg-game-card border-r border-game-border overflow-hidden">

      <div className="px-5 py-5 border-b border-game-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl" style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,135,0.6))' }}>⚽</span>
          <div>
            <div className="font-bangers text-2xl tracking-widest leading-none text-white">
              FANTASY<span className="text-game-neon">FOOTY</span>
            </div>
            <div className="text-xs text-slate-500 font-medium tracking-wider">TOP 5 LEAGUES</div>
          </div>
        </div>

        {gw && (
          <div className="mt-3 flex items-center gap-2 bg-game-fire/10 border border-game-fire/30
            rounded-xl px-3 py-2">
            <span className="text-game-fire text-sm">⏰</span>
            <div>
              <div className="text-game-fire font-bold text-xs leading-none">GW{gw.number} DEADLINE</div>
              <div className="text-slate-400 text-xs mt-0.5">
                <DeadlineCountdown deadlineTime={gw.deadlineTime} />
              </div>
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left
                relative group ${isActive
                  ? 'bg-game-neon/10 text-game-neon'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
            >
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-game-neon rounded-full
                  shadow-[0_0_8px_rgba(0,255,135,0.8)]" />
              )}
              <span className={`text-xl flex-shrink-0 transition-transform duration-200
                ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(0,255,135,0.5))' } : {}}>
                {item.icon}
              </span>
              <div className="min-w-0">
                <div className={`font-bangers tracking-wider text-base leading-none
                  ${isActive ? 'text-game-neon' : ''}`}>
                  {item.label}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 font-medium">{item.sub}</div>
              </div>
              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-game-neon flex-shrink-0
                  shadow-[0_0_6px_rgba(0,255,135,0.8)]" />
              )}
            </button>
          )
        })}
      </nav>

      <div className="px-4 py-4 border-t border-game-border flex-shrink-0 space-y-2.5">
        <div className="game-card px-3 py-2.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-game-gold/15 border border-game-gold/30
            flex items-center justify-center text-base flex-shrink-0">💰</div>
          <div>
            <div className="text-xs text-slate-500 font-medium leading-none">Bank</div>
            <div className="font-bangers text-lg text-game-gold leading-tight">
              £{budget > 0 ? budget.toFixed(1) : '—'}m
            </div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-slate-500 font-medium leading-none">Squad</div>
            <div className="font-bangers text-lg text-game-neon leading-tight">15/15</div>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
            hover:bg-white/[0.04] transition-colors group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-game-purple to-game-sky
            flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
            {user?.username?.slice(0, 2).toUpperCase() ?? '?'}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-bold text-slate-200 truncate">{user?.username ?? 'Loading...'}</div>
            <div className="text-xs text-slate-500 truncate">{user?.email ?? ''}</div>
          </div>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-xs">↪</span>
        </button>
      </div>
    </aside>
  )
}
```

**Step 2: Commit**
```bash
git add apps/web/src/components/Sidebar.tsx
git commit -m "feat(web): wire Sidebar to real user/bank/gameweek data"
```

---

## Task 10: Wire SquadSelection

**Files:**
- Modify: `apps/web/src/pages/SquadSelection.tsx`

Key changes:
1. Remove all `MOCK_PLAYERS`, `SQUAD_BY_POSITION` imports
2. Use `useGwPicks(gameweek?.id)` + `useMyFantasyTeam()` + `useCurrentGameweek()`
3. Build `SQUAD_BY_POSITION` via `useMemo` from picks
4. Use `useClubsMap()` to resolve `clubShort` from `clubId`
5. Fix `isCapitain` → `isCaptain`
6. Use `DeadlineCountdown` for deadline display
7. Disable CONFIRM/TRANSFER buttons when `isPast` (deadline passed)
8. The `Player` type used in components becomes `ApiPick` + derived fields

The `PitchCard` and `ListRow` components accept `ApiPick`. Add a `clubShort` prop derived from `useClubsMap()`.

**Pattern for wiring:**

```tsx
import { useMemo } from 'react'
import { useGwPicks, useMyFantasyTeam, useCurrentGameweek, useClubsMap } from '../api/hooks'
import type { ApiPick } from '../api/types'

export function SquadSelection() {
  const { data: team } = useMyFantasyTeam()
  const { data: gw } = useCurrentGameweek()
  const { data: picks = [] } = useGwPicks(gw?.id)
  const clubsMap = useClubsMap()
  const isDeadlinePast = gw ? new Date(gw.deadlineTime) < new Date() : false

  // Build SQUAD_BY_POSITION from picks
  const squadByPos = useMemo(() => ({
    GKP:  picks.filter(p => p.position === 'GKP' && p.isStarting),
    DEF:  picks.filter(p => p.position === 'DEF' && p.isStarting),
    MID:  picks.filter(p => p.position === 'MID' && p.isStarting),
    FWD:  picks.filter(p => p.position === 'FWD' && p.isStarting),
    BENCH: picks.filter(p => !p.isStarting).sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0)),
  }), [picks])
```

Update `PitchCard` to accept `ApiPick` + `clubShort` (resolved externally):
```tsx
function PitchCard({ pick, clubShort, onClick, size = 'md' }: {
  pick: ApiPick
  clubShort: string
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
}) {
  // Use pick.isCaptain (not isCapitain)
  // Use clubShort from clubsMap
```

Pass `clubShort` everywhere: `clubsMap.get(pick.clubId) ?? pick.clubName.slice(0, 3).toUpperCase()`

Show loading state when picks are fetching:
```tsx
if (!gw || picks.length === 0) return (
  <div className="flex items-center justify-center h-full text-slate-500 font-bangers text-xl tracking-widest">
    Loading squad...
  </div>
)
```

**Step 2: Commit**
```bash
git add apps/web/src/pages/SquadSelection.tsx
git commit -m "feat(web): wire SquadSelection to real picks API"
```

---

## Task 11: Wire PlayerSelection

**Files:**
- Modify: `apps/web/src/pages/PlayerSelection.tsx`

Key changes:
1. Remove `MOCK_PLAYERS` import
2. Use `usePlayers(filters)` with debounced search
3. Server-side filtering (pass params to API) instead of client-side filter
4. Remove `form` column (not in API) — replace with `ownershipPct` if available or just remove
5. Use `useClubsMap()` for jersey icons
6. `player.selected` → check if `playerId` is in current picks list (from `useGwPicks`)
7. Add/remove becomes staging in draft store — real transfer POST happens on confirm

**Pattern:**

```tsx
import { useState, useMemo } from 'react'
import { usePlayers, useGwPicks, useCurrentGameweek, useClubsMap } from '../api/hooks'
import { useDraftStore } from '../store/draft.store'
import type { ApiPlayer } from '../api/types'

export function PlayerSelection() {
  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<string>('ALL')
  const [maxPrice, setMaxPrice] = useState(15)
  const [sortBy, setSortBy] = useState<'Price'>('Price')

  const { data: gw } = useCurrentGameweek()
  const { data: picks = [] } = useGwPicks(gw?.id)
  const clubsMap = useClubsMap()
  const pickedIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks])

  const { data, isLoading } = usePlayers({
    position: posFilter === 'ALL' ? undefined : posFilter,
    search: search || undefined,
    maxPrice,
  })

  const players = data?.data ?? []
  // Sort client-side for now (API doesn't support sort param)
  const sorted = useMemo(() => {
    return [...players].sort((a, b) => b.currentPrice - a.currentPrice)
  }, [players])
```

Remove `form` and `totalPoints` from `PlayerRow` — show only `currentPrice` and position badge.

Updated `PlayerRow` props become `ApiPlayer` + `clubShort` + `isInSquad`:
```tsx
function PlayerRow({ player, clubShort, isInSquad, onAdd, onRemove }: {
  player: ApiPlayer
  clubShort: string
  isInSquad: boolean
  onAdd: () => void
  onRemove: () => void
})
```

**Step 2: Commit**
```bash
git add apps/web/src/pages/PlayerSelection.tsx
git commit -m "feat(web): wire PlayerSelection to real players API"
```

---

## Task 12: Wire Fixtures

**Files:**
- Modify: `apps/web/src/pages/Fixtures.tsx`

Key changes:
1. Remove `MOCK_FIXTURES` import
2. Use `useCurrentGameweek()` for current GW number
3. Use `useFixtures(gameweekId)` for fixture list
4. Use `useClubsMap()` for `homeClubId` → `shortName`
5. "Your players" per fixture: cross-reference with picks (check if any pick's `clubId` matches home/away)
6. Remove hardcoded `FIXTURE_DIFFICULTY` and `FIXTURE_PLAYERS`
7. `kickoffAt` → format time display using `new Date(f.kickoffAt).toLocaleTimeString()`

**Pattern:**

```tsx
import { useFixtures, useCurrentGameweek, useGwPicks, useClubsMap } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'

export function Fixtures() {
  const { data: gw } = useCurrentGameweek()
  const [selectedGwNumber, setSelectedGwNumber] = useState<number | null>(null)
  // Default to current GW on first load
  const gwNumber = selectedGwNumber ?? gw?.number ?? 30

  // To browse other GWs by number we need to find the gameweekId — for now, only support current GW
  const { data: fixtures = [] } = useFixtures(gw?.id)
  const { data: picks = [] } = useGwPicks(gw?.id)
  const clubsMap = useClubsMap()

  // Which clubs are my picks from?
  const myClubIds = useMemo(() => new Set(picks.map(p => p.clubId)), [picks])

  // "Your players in this fixture"
  const playersInFixture = (fixture: ApiFixture) => {
    const relevantClubIds = new Set([fixture.homeClubId, fixture.awayClubId])
    return picks.filter(p => relevantClubIds.has(p.clubId))
  }
```

Format kickoff time: `new Date(fixture.kickoffAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })`
Format date: `new Date(fixture.kickoffAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })`

Remove difficulty ratings (not in API data — skip this feature for now, or show `—`).

**Step 2: Commit**
```bash
git add apps/web/src/pages/Fixtures.tsx
git commit -m "feat(web): wire Fixtures to real fixtures API"
```

---

## Task 13: Wire Leagues

**Files:**
- Modify: `apps/web/src/pages/Leagues.tsx`

Key changes:
1. Remove `LEADERBOARD` constant
2. Use `useMyLeagues()` to get the first league
3. Use `useLeagueStandings(leagueId)` for standings
4. Use `useGlobalLeaderboard()` as fallback if no leagues yet
5. Wire join league button to `useJoinLeague()` mutation
6. Wire create league button to `useCreateLeague()` mutation
7. Find my entry using `fantasyTeamId` from auth store

**Pattern:**

```tsx
import { useState } from 'react'
import { useMyLeagues, useLeagueStandings, useGlobalLeaderboard, useJoinLeague, useCreateLeague } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'

export function Leagues() {
  const { fantasyTeamId, user } = useAuthStore()
  const [joinCode, setJoinCode] = useState('')
  const [createName, setCreateName] = useState('')
  const { data: myLeagues = [] } = useMyLeagues()
  const firstLeague = myLeagues[0] ?? null
  const { data: standings = [] } = useLeagueStandings(firstLeague?.id ?? null)
  const { data: globalData } = useGlobalLeaderboard()
  const { mutate: joinLeague, isPending: isJoining } = useJoinLeague()
  const { mutate: createLeague, isPending: isCreating } = useCreateLeague()

  // Use league standings if available, else global leaderboard
  const leaderboard = standings.length > 0 ? standings : (globalData?.data ?? [])
  const myEntry = leaderboard.find(e => e.fantasyTeamId === fantasyTeamId)
```

**Step 2: Commit**
```bash
git add apps/web/src/pages/Leagues.tsx
git commit -m "feat(web): wire Leagues to real leaderboard + mini-leagues API"
```

---

## Task 14: PlayerDetail modal with real performance history

**Files:**
- Modify: `apps/web/src/pages/SquadSelection.tsx` (update `PlayerModal`)

The `PlayerModal` currently shows static stats. Update it to fetch `usePlayerDetail` + `usePlayerPerformances` for the selected player.

```tsx
import { usePlayerDetail, usePlayerPerformances } from '../api/hooks'

function PlayerModal({ pick, clubShort, onClose }: {
  pick: ApiPick
  clubShort: string
  onClose: () => void
}) {
  const { data: detail } = usePlayerDetail(pick.playerId)
  const { data: performances = [] } = usePlayerPerformances(pick.playerId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative game-card w-full max-w-sm p-5 anim-pop lg:max-w-md overflow-y-auto max-h-[90vh]"
        onClick={e => e.stopPropagation()}>
        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-game-red text-xl font-bold transition-colors">
          ✕
        </button>

        {/* Header */}
        <div className="flex items-center gap-4 mb-5">
          <div className="anim-float">
            <JerseyIcon clubShort={clubShort} position={pick.position} size="lg" />
          </div>
          <div>
            <div className="font-bangers text-2xl tracking-wider text-white">{pick.playerName}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 text-sm">{pick.clubName}</span>
              <PosBadge pos={pick.position} />
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Price', value: `£${detail?.currentPrice.toFixed(1) ?? '—'}m`, color: 'text-game-gold' },
            { label: 'Ownership', value: detail ? `${detail.ownershipPct.toFixed(1)}%` : '—', color: 'text-game-sky' },
            { label: 'GW Pts', value: pick.gwPoints ?? '—', color: 'text-game-neon' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
              <div className={`font-bangers text-2xl ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Recent performances */}
        {performances.length > 0 && (
          <div className="mb-5">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">
              Recent GWs
            </div>
            <div className="flex flex-col gap-1">
              {performances.slice(-5).reverse().map(p => (
                <div key={p.gameweekId}
                  className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg">
                  <span className="text-xs text-slate-400 font-medium">GW{p.gameweekNumber}</span>
                  <span className="text-xs text-slate-500">{p.minutesPlayed}′</span>
                  <span className={`font-bangers text-sm ${p.totalPoints > 0 ? 'text-game-neon' : 'text-slate-600'}`}>
                    {p.totalPoints} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <button className="btn-secondary flex-1 py-2.5">🔄 TRANSFER</button>
          <button className="btn-primary flex-1 py-2.5">
            {pick.isCaptain ? '★ CAPTAIN' : '👑 MAKE CAPTAIN'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

**Step 2: Commit**
```bash
git add apps/web/src/pages/SquadSelection.tsx
git commit -m "feat(web): add real performance history to PlayerDetail modal"
```

---

## Task 15: Fix mock.ts typo + update progress.md

**Files:**
- Modify: `apps/web/src/data/mock.ts` — fix `isCapitain` → `isCaptain`
- Modify: `progress.md` — mark Phase 4b complete

**Step 1: Fix typo in mock.ts**

In `mock.ts` line 13, change `isCapitain?: boolean` to `isCaptain?: boolean`.
In line 39, change `isCapitain: true` to `isCaptain: true`.

**Step 2: Update progress.md Phase 4b section**

Mark all 9 tasks complete and add implementation notes.

**Step 3: TypeScript check**
```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```
Fix any type errors before committing.

**Step 4: Commit**
```bash
git add apps/web/src/data/mock.ts progress.md
git commit -m "chore: fix isCapitain typo; update progress.md Phase 4b complete"
```

---

## Verification Checklist

Run through these manually after all tasks are done:

- [ ] `pnpm dev` starts without errors
- [ ] Navigate to `http://localhost:5173` → redirects to `/login`
- [ ] Register a new user → auto-login → redirected to squad page
- [ ] Login with existing user → dashboard loads
- [ ] Sidebar shows real GW number and countdown timer ticking
- [ ] Sidebar shows real bank balance from fantasy team
- [ ] Squad page loads real picks (or "Loading squad..." until API responds)
- [ ] Player list loads real players from `/players?competitionId=39`
- [ ] Fixtures page shows real fixtures for current GW
- [ ] Leagues page shows global leaderboard or mini-league standings
- [ ] Player modal shows real ownership % and recent GW performances
- [ ] Deadline passes → countdown shows "DEADLINE PASSED" in red
- [ ] Token refresh: let access token expire (set JWT_SECRET with 15s expiry for test), next request auto-refreshes
- [ ] Logout button clears state and redirects to `/login`

---

## Notes on Known Gaps (post-4b)

1. **Form/total points not in player list API** — `/players` returns price only. A later API extension can add `seasonPoints` and `recentForm` fields to the player list response.
2. **GW browsing in Fixtures** — only current GW is wired. Browsing to other GWs requires a `GET /gameweeks?competitionId=` endpoint (not in current API design — add in Phase 5).
3. **Transfer flow** — staging in `draft.store` is built but the actual `POST /transfers` mutation is not wired to a UI confirm dialog. Add in Phase 5.
4. **Captain/vice-captain changes** — the CAPTAIN button in PlayerModal is not yet wired to `PUT /picks/:gwId`.
