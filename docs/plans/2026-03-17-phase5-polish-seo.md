# Phase 5 — Polish + SEO Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Redis caching to the clubs endpoint, add loading skeletons and error boundaries to the frontend, and build a minimal pre-rendered landing page with SEO meta tags.

**Architecture:** Four independent tasks — one backend cache addition, two frontend polish tasks, and one new public page with SSG pre-rendering. Tasks 1–3 can be done in any order; Task 4 (SSG) must be done last as it changes the build pipeline.

**Tech Stack:** NestJS + RedisService (backend caching); React + TanStack Query (skeletons/error boundaries); react-helmet-async + custom Vite prerender plugin (landing page + SSG).

---

## Orientation

Before starting, understand the project layout:
- Monorepo root: `/Users/trung/fantasy/.worktrees/fantasy-game/`
- API: `apps/api/src/` — NestJS, all services use `RedisService` (global `@Global()` module, no import needed)
- Web: `apps/web/src/` — React 19, Vite 8, TanStack Query v5, Zustand v5, React Router v7
- Run commands from their respective directories unless stated otherwise
- `RedisService.getOrSet(key, ttlSeconds, fetchFn)` — existing helper; returns cached value or calls `fetchFn` and caches result

---

## Task 1: Redis cache for ClubsService

`ClubsService.findByCompetition()` hits the DB on every request. This endpoint is called on every page load (for the clubs map). Add a 10-minute Redis cache.

**Files:**
- Modify: `apps/api/src/modules/clubs/clubs.service.ts`
- Modify: `apps/api/src/modules/clubs/clubs.module.ts`

**Step 1: Inject RedisService into ClubsService**

`RedisModule` is `@Global()` so no module import is needed — just add `RedisService` to the constructor.

Open `apps/api/src/modules/clubs/clubs.service.ts`. Replace the entire file with:

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AliasService } from '../alias/alias.service';
import { RedisService } from '../../infrastructure/redis/redis.service';

@Injectable()
export class ClubsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasService: AliasService,
    private readonly redis: RedisService,
  ) {}

  async findByCompetition(competitionId: number) {
    const cacheKey = `clubs:competition:${competitionId}`;
    return this.redis.getOrSet(cacheKey, 600, async () => {
      const clubs = await this.prisma.club.findMany({
        where: { competitionId },
        include: { alias: true },
        orderBy: { id: 'asc' },
      });
      return clubs.map((c) => this.aliasService.resolveClub(c));
    });
  }
}
```

**Step 2: Verify TypeScript compiles**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 3: Manual verification**

```bash
# Start API (from apps/api)
DATABASE_URL="postgresql://fantasy_user:fantasy_pass@localhost:5432/fantasy" \
REDIS_URL="redis://localhost:6379" \
JWT_SECRET="test-secret" JWT_REFRESH_SECRET="test-refresh-secret" \
PORT=3001 pnpm nest start
```

```bash
# Hit /clubs twice — second response should come from cache (faster, no DB query log)
curl "http://localhost:3001/clubs?competitionId=39"
curl "http://localhost:3001/clubs?competitionId=39"
```

Expected: both return the same JSON. Redis key `clubs:competition:39` should now exist:
```bash
docker exec -it fantasy-game-redis-1 redis-cli GET clubs:competition:39
```
Expected: non-null JSON string.

**Step 4: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/api/src/modules/clubs/clubs.service.ts
git commit -m "feat(api): add Redis cache to ClubsService (10 min TTL)"
```

---

## Task 2: Loading skeletons on all four pages

Pages currently render nothing while TanStack Query fetches. Add animated pulse skeleton placeholders that match the real layout.

**Files:**
- Create: `apps/web/src/components/ui/Skeleton.tsx`
- Modify: `apps/web/src/pages/SquadSelection.tsx`
- Modify: `apps/web/src/pages/PlayerSelection.tsx`
- Modify: `apps/web/src/pages/Fixtures.tsx`
- Modify: `apps/web/src/pages/Leagues.tsx`

**Step 1: Create the Skeleton primitive**

Create `apps/web/src/components/ui/Skeleton.tsx`:

```tsx
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/5 ${className}`} />
  )
}
```

**Step 2: Add skeleton to SquadSelection**

In `apps/web/src/pages/SquadSelection.tsx`, find the component that renders the squad (the top-level exported component). Near the top, after the hooks, add a loading guard. The component currently starts something like:

```tsx
// Find the top-level SquadSelection export function. Look for where isLoading could be checked.
```

Read the full `SquadSelection.tsx` to find the exact location of the main export. Then add:

```tsx
import { Skeleton } from '../components/ui/Skeleton'

// Inside the exported component, after the hooks:
const { data: team, isLoading: teamLoading } = useMyFantasyTeam()
const { data: picks, isLoading: picksLoading } = useGwPicks(gw?.id)

if (teamLoading || picksLoading) {
  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {/* Pitch skeleton */}
      <Skeleton className="h-8 w-48 mx-auto mb-4" />
      <div className="space-y-6">
        {[1, 2, 3, 4].map(row => (
          <div key={row} className="flex justify-center gap-4">
            {Array.from({ length: row === 1 ? 1 : row === 2 ? 4 : row === 3 ? 3 : 3 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="w-[70px] h-[85px] rounded-xl" />
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
```

> Note: The exact hooks and variable names are in the file. Read the file first to find `useMyFantasyTeam`, `useGwPicks`, and `useCurrentGameweek` calls and their returned `isLoading` flags before editing.

**Step 3: Add skeleton to PlayerSelection**

In `apps/web/src/pages/PlayerSelection.tsx`, find `usePlayers` call. When `isLoading` is true, show player row skeletons:

```tsx
import { Skeleton } from '../components/ui/Skeleton'

// After usePlayers hook:
const { data, isLoading } = usePlayers({ competitionId, position, page })

// In JSX, where the player list renders, add:
{isLoading && (
  <div className="space-y-0">
    {Array.from({ length: 10 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-game-border/50">
        <Skeleton className="w-5 h-5 rounded-full" />
        <Skeleton className="w-8 h-10 rounded-lg" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-4 w-12" />
        <Skeleton className="w-7 h-7 rounded-lg" />
      </div>
    ))}
  </div>
)}
```

**Step 4: Add skeleton to Fixtures**

In `apps/web/src/pages/Fixtures.tsx`, find `useFixtures` call. Add:

```tsx
import { Skeleton } from '../components/ui/Skeleton'

// When fixtures isLoading:
{isLoading && (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4">
    {Array.from({ length: 6 }).map((_, i) => (
      <div key={i} className="game-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="w-9 h-9 rounded-xl" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-5 w-8" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="w-9 h-9 rounded-xl" />
          </div>
        </div>
        <Skeleton className="h-3 w-28 mx-auto" />
      </div>
    ))}
  </div>
)}
```

**Step 5: Add skeleton to Leagues**

In `apps/web/src/pages/Leagues.tsx`, find `useGlobalLeaderboard` call. Add:

```tsx
import { Skeleton } from '../components/ui/Skeleton'

// When leaderboard isLoading:
{isLoading && (
  <div className="space-y-1 p-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 px-3 py-2.5 game-card">
        <Skeleton className="w-8 h-8 rounded-xl" />
        <div className="flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="h-3 w-16" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>
    ))}
  </div>
)}
```

**Step 6: Check TypeScript**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 7: Visual check**

```bash
pnpm dev
```

Open browser. The skeleton states appear briefly on first load before data arrives. You can slow it down using DevTools → Network → Slow 3G to confirm.

**Step 8: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/components/ui/Skeleton.tsx \
        apps/web/src/pages/SquadSelection.tsx \
        apps/web/src/pages/PlayerSelection.tsx \
        apps/web/src/pages/Fixtures.tsx \
        apps/web/src/pages/Leagues.tsx
git commit -m "feat(web): add loading skeletons to all four main pages"
```

---

## Task 3: Error boundaries

Add a global React error boundary wrapping AppShell, and use TanStack Query's `QueryErrorResetBoundary` for query-level error recovery per page.

**Files:**
- Create: `apps/web/src/components/ErrorBoundary.tsx`
- Modify: `apps/web/src/components/AppShell.tsx`
- Modify: `apps/web/src/pages/SquadSelection.tsx`
- Modify: `apps/web/src/pages/PlayerSelection.tsx`
- Modify: `apps/web/src/pages/Fixtures.tsx`
- Modify: `apps/web/src/pages/Leagues.tsx`

**Step 1: Create the ErrorBoundary component**

Create `apps/web/src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="text-5xl">⚠️</div>
          <h2 className="font-bangers text-2xl tracking-widest text-white">
            Something went wrong
          </h2>
          <p className="text-slate-400 text-sm text-center max-w-xs">
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <button className="btn-primary" onClick={this.handleReset}>
            Try again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
```

**Step 2: Wrap AppShell with ErrorBoundary**

In `apps/web/src/components/AppShell.tsx`, import and wrap the return value:

```tsx
import { ErrorBoundary } from './ErrorBoundary'

// Change the return to:
return (
  <ErrorBoundary>
    <div className="h-screen overflow-hidden bg-game-bg flex">
      {/* ... existing content unchanged ... */}
    </div>
  </ErrorBoundary>
)
```

**Step 3: Add QueryErrorResetBoundary to each page**

Each page should handle query errors gracefully. Wrap each page's main return with `QueryErrorResetBoundary` + `ErrorBoundary`.

In each of the four page files (`SquadSelection.tsx`, `PlayerSelection.tsx`, `Fixtures.tsx`, `Leagues.tsx`), add this pattern around the outer JSX:

```tsx
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { ErrorBoundary } from '../components/ErrorBoundary'

// Wrap the top-level return of each exported page component:
return (
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary
        fallback={
          <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
            <div className="text-5xl">⚠️</div>
            <p className="text-slate-400 text-sm">Failed to load data.</p>
            <button className="btn-primary" onClick={reset}>Retry</button>
          </div>
        }
      >
        {/* existing page JSX */}
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
)
```

> Note: Read each page file carefully. The outer-most JSX returned by the exported function is what gets wrapped. The ErrorBoundary fallback overrides the generic one with a reset function tied to the query error state.

**Step 4: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 5: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/src/components/ErrorBoundary.tsx \
        apps/web/src/components/AppShell.tsx \
        apps/web/src/pages/SquadSelection.tsx \
        apps/web/src/pages/PlayerSelection.tsx \
        apps/web/src/pages/Fixtures.tsx \
        apps/web/src/pages/Leagues.tsx
git commit -m "feat(web): add global error boundary and per-page QueryErrorResetBoundary"
```

---

## Task 4: Landing page + SEO meta tags + pre-rendering

Add a public `/` landing page with SEO meta tags. Use `react-helmet-async` for dynamic meta tags and a custom Vite plugin to bake the pre-rendered HTML into `dist/index.html` at build time. The rest of the app remains a standard SPA.

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/src/pages/Landing.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/vite.config.ts`

**Step 1: Install react-helmet-async**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm add react-helmet-async
pnpm add -D @types/react-helmet
```

**Step 2: Add HelmetProvider to main.tsx**

Open `apps/web/src/main.tsx`. Import and wrap with `HelmetProvider`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './store/auth.store'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
)
```

**Step 3: Create the Landing page**

Create `apps/web/src/pages/Landing.tsx`:

```tsx
import { Helmet } from 'react-helmet-async'
import { Link } from 'react-router-dom'

export function Landing() {
  return (
    <>
      <Helmet>
        <title>FantasyFooty — Play Fantasy Football Across 5 Leagues</title>
        <meta
          name="description"
          content="Pick your squad from the Premier League, La Liga, Serie A, Bundesliga, and Ligue 1. Earn points every week. Play free."
        />
        <meta property="og:title" content="FantasyFooty" />
        <meta
          property="og:description"
          content="Season-long fantasy football across Europe's top 5 leagues. Free to play."
        />
        <meta property="og:type" content="website" />
      </Helmet>

      <div className="min-h-screen bg-game-bg flex flex-col items-center justify-center px-6 text-center">
        {/* Logo */}
        <div className="mb-6 flex items-center gap-3">
          <span
            className="text-6xl"
            style={{ filter: 'drop-shadow(0 0 20px rgba(0,255,135,0.6))' }}
          >
            ⚽
          </span>
          <h1 className="font-bangers text-6xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </h1>
        </div>

        {/* Tagline */}
        <p className="text-slate-400 text-xl font-nunito max-w-md mb-2">
          5 leagues. One squad. Season-long glory.
        </p>
        <p className="text-slate-500 text-base font-nunito max-w-sm mb-10">
          Premier League · La Liga · Serie A · Bundesliga · Ligue 1
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-xs sm:max-w-sm">
          <Link to="/register" className="btn-primary w-full sm:w-auto flex-1 text-center text-lg py-3">
            Play Free
          </Link>
          <Link
            to="/login"
            className="btn-secondary w-full sm:w-auto flex-1 text-center text-lg py-3"
          >
            Sign In
          </Link>
        </div>
      </div>
    </>
  )
}
```

**Step 4: Add `/` route to App.tsx**

Open `apps/web/src/App.tsx`. Add the landing route **before** the protected catch-all:

```tsx
import { Routes, Route } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
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

**Step 5: Add SSG pre-render plugin to vite.config.ts**

The plugin runs after the build, renders the Landing page to a static HTML string using `react-dom/server`, and injects it into `dist/index.html` so crawlers see real content.

Open `apps/web/vite.config.ts` and replace the entire file:

```typescript
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'

function prerenderLandingPlugin(): Plugin {
  return {
    name: 'prerender-landing',
    apply: 'build',
    async closeBundle() {
      // Only pre-render in production builds
      try {
        const { renderToString } = await import('react-dom/server')
        const { createElement } = await import('react')
        const { HelmetProvider } = await import('react-helmet-async')
        const { StaticRouter } = await import('react-router-dom/server')

        // Dynamically import the Landing component from the SSR build
        // We pre-render a minimal shell; the full app hydrates on the client
        const helmetContext: Record<string, any> = {}

        const { Landing } = await import('./src/pages/Landing.tsx')

        const html = renderToString(
          createElement(HelmetProvider, { context: helmetContext },
            createElement(StaticRouter, { location: '/' },
              createElement(Landing)
            )
          )
        )

        const indexPath = resolve(__dirname, 'dist/index.html')
        let template = readFileSync(indexPath, 'utf-8')

        // Inject pre-rendered HTML into the root div
        template = template.replace(
          '<div id="root"></div>',
          `<div id="root">${html}</div>`,
        )

        // Inject helmet-collected meta tags into <head>
        const { helmet } = helmetContext
        if (helmet) {
          template = template.replace(
            '</head>',
            `${helmet.title.toString()}${helmet.meta.toString()}${helmet.link.toString()}</head>`,
          )
        }

        writeFileSync(indexPath, template)
        console.log('✓ Landing page pre-rendered into dist/index.html')
      } catch (e) {
        console.warn('Pre-render skipped:', (e as Error).message)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), prerenderLandingPlugin()],
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

> **Note:** The pre-render runs in the Vite Node.js context after the client build. It imports the Landing component directly from source (Vite handles the TypeScript transform). If the import fails in any environment, it logs a warning and the build still succeeds — the app works as a normal SPA.

**Step 6: TypeScript check**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit
```

Expected: no errors.

**Step 7: Dev check — verify landing page renders**

```bash
pnpm dev
```

Open `http://localhost:5173/` in browser. Expected: landing page with logo, tagline, "Play Free" + "Sign In" buttons. Clicking "Play Free" navigates to `/register`. Clicking "Sign In" navigates to `/login`.

Verify unauthenticated users at `/` see the landing, not a redirect to `/login`.

**Step 8: Build check — verify pre-rendering**

```bash
pnpm build
# Check dist/index.html contains pre-rendered content:
grep -o 'FANTASY.*FOOTY' dist/index.html
grep -o 'og:title.*content' dist/index.html
```

Expected first grep: `FANTASYFOOTY` (the logo text).
Expected second grep: a match showing the og:title tag was injected.

**Step 9: Preview build**

```bash
pnpm preview
```

Open `http://localhost:4173/`. View page source (`Cmd+U`). Confirm:
- `<div id="root">` contains HTML content (not empty)
- `<title>FantasyFooty — Play Fantasy Football Across 5 Leagues</title>` is present in `<head>`
- `<meta property="og:description"` is present

**Step 10: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add apps/web/package.json \
        apps/web/src/main.tsx \
        apps/web/src/App.tsx \
        apps/web/src/pages/Landing.tsx \
        apps/web/vite.config.ts
git commit -m "feat(web): add landing page with SEO meta tags and SSG pre-rendering"
```

---

## Task 5: Update progress.md

Mark Phase 5 as complete and record what was built.

**File:** `progress.md` (monorepo root of the worktree)

Update the Phase 5 section:
- Change status from `🔲 Not started` to `✅ Done` in the phase table
- Add implementation notes for each task (similar style to Phase 4b notes)
- Check off all verification items

**Step 1: Update the phase table row**

Change:
```
| **Phase 5** — Polish + SEO | 🔲 Not started | — | Caching, SEO, deadline countdown |
```
To:
```
| **Phase 5** — Polish + SEO | ✅ Done | feature/fantasy-game | Clubs Redis cache; loading skeletons; error boundaries; landing page + SSG pre-rendering |
```

**Step 2: Fill in the Phase 5 section body**

Replace the Phase 5 task checklist with completed items and add implementation notes:

```markdown
## Phase 5 — Polish + SEO ✅

**Completed:** 2026-03-17

Tasks:
- [x] 24. Redis caching added to ClubsService (`clubs:competition:{id}`, 600s TTL)
- [x] 25. Loading skeletons (Skeleton primitive + pulse placeholders on all 4 pages); error boundaries (global ErrorBoundary + per-page QueryErrorResetBoundary with retry)
- [x] 26. Landing page (`/`) with react-helmet-async meta tags + SSG pre-render plugin in vite.config.ts
- [x] 27. Rate limit alerting — already implemented in Phase 1 (ApiFootballClient warns at >80 req/day)

Implementation notes:
- `ClubsService` now uses `RedisService.getOrSet` — `RedisModule` is `@Global()` so no module import change needed
- `Skeleton` component: single `animate-pulse bg-white/5` primitive; layout-specific shapes inlined per page
- `ErrorBoundary` is a class component (required for `getDerivedStateFromError`); `QueryErrorResetBoundary` wraps each page to reset TanStack Query error state on retry
- SSG pre-render: custom Vite `closeBundle` plugin renders `Landing` via `renderToString` + `StaticRouter` after build; injects into `dist/index.html`; non-fatal (warns and skips on failure)
- Pre-render runs in Vite's Node context at build time — no separate SSR server needed

Verification checklist:
- [x] GET /clubs?competitionId=39 twice → Redis key `clubs:competition:39` exists after first call
- [x] All 4 pages show skeleton placeholders while TanStack Query is loading
- [x] Throwing an error in a page component shows error fallback UI with Retry button
- [x] `http://localhost:5173/` shows landing page (not login redirect) for unauthenticated users
- [x] `pnpm build` → `dist/index.html` contains pre-rendered landing content and og:title meta tag
```

**Step 3: Commit**

```bash
cd /Users/trung/fantasy/.worktrees/fantasy-game
git add progress.md
git commit -m "docs: mark Phase 5 complete in progress.md"
```

---

## Final verification

```bash
# API: TypeScript clean
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/api
pnpm exec tsc --noEmit

# Web: TypeScript clean
cd /Users/trung/fantasy/.worktrees/fantasy-game/apps/web
pnpm exec tsc --noEmit

# Web: production build succeeds with pre-rendering
pnpm build

# Confirm pre-render output
grep -c 'FANTASYFOOTY\|og:title\|og:description' dist/index.html
# Expected: 3 (all three strings found)
```
