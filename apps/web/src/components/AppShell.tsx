import { useState } from 'react'
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
  useMyFantasyTeam()  // prefetch on shell mount

  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  )
}
