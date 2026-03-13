import { useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { BottomNav } from './components/BottomNav'
import { SquadSelection } from './pages/SquadSelection'
import { PlayerSelection } from './pages/PlayerSelection'
import { Fixtures } from './pages/Fixtures'
import { Leagues } from './pages/Leagues'

export default function App() {
  const [page, setPage] = useState('squad')

  return (
    <div className="h-screen overflow-hidden bg-game-bg flex">
      {/* Desktop sidebar — hidden on mobile */}
      <Sidebar active={page} onChange={setPage} />

      {/* Main content: full width on mobile, offset by sidebar on desktop */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden lg:ml-64">

        {/* Mobile-only top bar */}
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
              <span className="font-bangers text-game-gold tracking-wider">£8.1m</span>
            </div>
            <button className="w-9 h-9 game-card rounded-xl flex items-center justify-center
              text-slate-400 hover:text-slate-200 transition-colors text-lg">
              👤
            </button>
          </div>
        </div>

        {/* Page content — fills remaining height */}
        <div className="flex-1 overflow-hidden">
          {page === 'squad'    && <SquadSelection />}
          {page === 'players'  && <PlayerSelection />}
          {page === 'fixtures' && <Fixtures />}
          {page === 'leagues'  && <Leagues />}
        </div>

        {/* Mobile-only bottom nav */}
        <BottomNav active={page} onChange={setPage} />
      </div>
    </div>
  )
}
