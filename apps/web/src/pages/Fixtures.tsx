import { useState } from 'react'
import { MOCK_FIXTURES } from '../data/mock'

const CLUB_COLORS: Record<string, string> = {
  ARS: '#EF0107', LIV: '#C8102E', MCI: '#6CABDD', CHE: '#034694',
  TOT: '#132257', MUN: '#DA291C', NEW: '#241F20', EVE: '#003399',
  BRE: '#e30613', BHA: '#0057B8', AVL: '#95BFE5', FUL: '#000000',
  WOL: '#FDB913', LEI: '#003090', NFO: '#DD0000', CRY: '#1B458F',
  SOU: '#D71920', WHU: '#7A263A', BOU: '#DA291C', IPS: '#3a64a3',
}

// Fake difficulty ratings per fixture
const FIXTURE_DIFFICULTY: Record<number, [number, number]> = {
  1: [3, 3], 2: [5, 5], 3: [2, 4], 4: [3, 2], 5: [2, 3],
  6: [2, 4], 7: [2, 3], 8: [2, 3], 9: [3, 2], 10: [2, 3],
}
// Fake "your players" in each fixture
const FIXTURE_PLAYERS: Record<number, string[]> = {
  1: ['Raya', 'Gabriel', 'Saka'], 2: ['Salah'], 4: ['Isak'],
  7: ['Andreas'], 8: [], 9: [], 10: [],
}

function ClubBadge({ short, name, align = 'left' }: {
  short: string; name: string; align?: 'left' | 'right'
}) {
  const color = CLUB_COLORS[short] ?? '#334155'
  return (
    <div className={`flex items-center gap-2 flex-1 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center font-bangers
          text-xs tracking-wider text-white flex-shrink-0"
        style={{
          background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
          border: `1.5px solid ${color}66`,
          boxShadow: `0 2px 8px ${color}44`,
        }}
      >
        {short.slice(0, 3)}
      </div>
      <span className="font-bold text-sm text-slate-100 truncate">{name}</span>
    </div>
  )
}

function DifficultyDot({ value }: { value: number }) {
  const cls = value <= 2 ? 'bg-game-neon text-game-bg' :
              value <= 3 ? 'bg-game-gold text-game-bg' :
              value === 4 ? 'bg-game-fire text-white' : 'bg-game-red text-white'
  return (
    <div className={`w-6 h-6 rounded-lg flex items-center justify-center font-bangers text-sm ${cls}`}>
      {value}
    </div>
  )
}

function FixtureCard({ fixture }: { fixture: typeof MOCK_FIXTURES[0] }) {
  const [expanded, setExpanded] = useState(false)
  const [homeDiff, awayDiff] = FIXTURE_DIFFICULTY[fixture.id] ?? [3, 3]
  const myPlayers = FIXTURE_PLAYERS[fixture.id] ?? []

  return (
    <div
      className={`game-card overflow-hidden cursor-pointer transition-all
        hover:border-game-border-bright ${expanded ? 'border-game-border-bright' : ''}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-2 px-4 py-3.5">
        <ClubBadge short={fixture.homeShort} name={fixture.homeTeam} />
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-20">
          <div className="font-bangers text-lg tracking-wider text-white leading-none">
            {fixture.kickoff}
          </div>
          <div className="text-xs text-slate-500 font-medium">KO</div>
        </div>
        <ClubBadge short={fixture.awayShort} name={fixture.awayTeam} align="right" />

        {/* My players indicator */}
        {myPlayers.length > 0 && (
          <div className="flex-shrink-0 ml-2">
            <div className="bg-game-neon/15 border border-game-neon/30 rounded-lg px-2 py-1
              flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-game-neon flex-shrink-0
                shadow-[0_0_4px_rgba(0,255,135,0.8)]" />
              <span className="text-game-neon text-xs font-bold">{myPlayers.length}</span>
            </div>
          </div>
        )}

        <span className="text-slate-600 text-xs ml-1 flex-shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-game-border/50 pt-3 anim-slide-up">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                Your players
              </div>
              {myPlayers.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {myPlayers.map(name => (
                    <span key={name} className="bg-game-neon/10 text-game-neon border border-game-neon/20
                      px-2 py-0.5 rounded-lg font-bold text-xs">{name}</span>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-slate-600">None this fixture</span>
              )}
            </div>
            <div className="w-px bg-game-border flex-shrink-0" />
            <div>
              <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
                Difficulty
              </div>
              <div className="flex gap-1.5">
                <DifficultyDot value={homeDiff} />
                <DifficultyDot value={awayDiff} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function Fixtures() {
  const [gameweek, setGameweek] = useState(30)

  const grouped = MOCK_FIXTURES.reduce<Record<string, typeof MOCK_FIXTURES>>((acc, f) => {
    if (!acc[f.date]) acc[f.date] = []
    acc[f.date].push(f)
    return acc
  }, {})

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
              FIXTURES
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Click a match to see your players &amp; difficulty
            </p>
          </div>

          {/* GW nav in header on desktop */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setGameweek(g => Math.max(1, g - 1))}
              className="w-9 h-9 rounded-xl bg-game-card border border-game-border
                flex items-center justify-center text-slate-300 hover:border-game-neon
                hover:text-game-neon transition-all font-bold text-lg"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="font-bangers text-xl tracking-wider text-white">GW {gameweek}</div>
              <div className="text-xs text-slate-500">Sat 15 – Wed 19 Mar</div>
            </div>
            <button
              onClick={() => setGameweek(g => Math.min(38, g + 1))}
              className="w-9 h-9 rounded-xl bg-game-card border border-game-border
                flex items-center justify-center text-slate-300 hover:border-game-neon
                hover:text-game-neon transition-all font-bold text-lg"
            >
              ›
            </button>

            {/* Deadline pill */}
            <div className="hidden sm:flex items-center gap-2 bg-game-fire/10 border border-game-fire/30
              rounded-xl px-3 py-2">
              <span className="text-game-fire">⏰</span>
              <span className="text-game-fire font-bold text-sm">Sat 15 Mar, 20:30</span>
            </div>
          </div>
        </div>
      </div>

      {/* Fixtures list */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 lg:pb-8 pt-4">
        {/* Mobile deadline banner */}
        <div className="sm:hidden mb-4 flex items-center justify-center gap-2 bg-game-fire/10
          border border-game-fire/30 rounded-xl py-2">
          <span className="text-game-fire">⏰</span>
          <span className="text-game-fire font-bold text-sm">Deadline: Sat 15 Mar, 20:30</span>
        </div>

        {Object.entries(grouped).map(([date, fixtures]) => (
          <div key={date} className="mb-5">
            {/* Date header */}
            <div className="flex items-center gap-3 mb-2.5">
              <div className="font-bangers text-sm tracking-widest text-slate-400 uppercase">
                {date}
              </div>
              <div className="flex-1 h-px bg-game-border" />
              <div className="text-xs text-slate-600 font-medium">{fixtures.length} matches</div>
            </div>

            {/* Desktop: 2-column grid; mobile: single column */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {fixtures.map(f => <FixtureCard key={f.id} fixture={f} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
