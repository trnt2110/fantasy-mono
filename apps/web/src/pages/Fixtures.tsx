import { useState, useMemo } from 'react'
import { useCurrentGameweek, useFixtures, useGwPicks, useClubsMap } from '../api/hooks'
import { DeadlineCountdown } from '../components/DeadlineCountdown'
import type { ApiFixture } from '../api/types'

const CLUB_COLORS: Record<string, string> = {
  ARS: '#EF0107', LIV: '#C8102E', MCI: '#6CABDD', CHE: '#034694',
  TOT: '#132257', MUN: '#DA291C', NEW: '#241F20', EVE: '#003399',
  BRE: '#e30613', BHA: '#0057B8', AVL: '#95BFE5', FUL: '#000000',
  WOL: '#FDB913', LEI: '#003090', NFO: '#DD0000', CRY: '#1B458F',
  SOU: '#D71920', WHU: '#7A263A', BOU: '#DA291C', IPS: '#3a64a3',
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

function FixtureCard({ fixture, myPlayerNames, homeShort, awayShort }: {
  fixture: ApiFixture
  myPlayerNames: string[]
  homeShort: string
  awayShort: string
}) {
  const [expanded, setExpanded] = useState(false)
  const kickoffTime = new Date(fixture.kickoffAt).toLocaleTimeString('en-GB', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div
      className={`game-card overflow-hidden cursor-pointer transition-all
        hover:border-game-border-bright ${expanded ? 'border-game-border-bright' : ''}`}
      onClick={() => setExpanded(e => !e)}
    >
      <div className="flex items-center gap-2 px-4 py-3.5">
        <ClubBadge short={homeShort} name={fixture.homeClubName} />
        <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-20">
          <div className="font-bangers text-lg tracking-wider text-white leading-none">
            {kickoffTime}
          </div>
          <div className="text-xs text-slate-500 font-medium">KO</div>
        </div>
        <ClubBadge short={awayShort} name={fixture.awayClubName} align="right" />

        {/* My players indicator */}
        {myPlayerNames.length > 0 && (
          <div className="flex-shrink-0 ml-2">
            <div className="bg-game-neon/15 border border-game-neon/30 rounded-lg px-2 py-1
              flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-game-neon flex-shrink-0
                shadow-[0_0_4px_rgba(0,255,135,0.8)]" />
              <span className="text-game-neon text-xs font-bold">{myPlayerNames.length}</span>
            </div>
          </div>
        )}

        <span className="text-slate-600 text-xs ml-1 flex-shrink-0">
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-game-border/50 pt-3 anim-slide-up">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-2">
            Your players
          </div>
          {myPlayerNames.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {myPlayerNames.map(name => (
                <span key={name} className="bg-game-neon/10 text-game-neon border border-game-neon/20
                  px-2 py-0.5 rounded-lg font-bold text-xs">{name}</span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-slate-600">None this fixture</span>
          )}
        </div>
      )}
    </div>
  )
}

export function Fixtures() {
  const { data: gw, isLoading: gwLoading } = useCurrentGameweek()
  const [selectedGwNumber, setSelectedGwNumber] = useState<number | null>(null)

  // Use selectedGwNumber if set, otherwise use current GW number
  const gwNumber = selectedGwNumber ?? gw?.number ?? 1

  // Only pass gwId when viewing the current GW
  const gwId = (selectedGwNumber === null || selectedGwNumber === gw?.number) ? gw?.id : undefined

  const { data: fixtures = [] } = useFixtures(gwId)
  const { data: picks = [] } = useGwPicks(gw?.id)
  const clubsMap = useClubsMap()

  // Derive "my players" per fixture: picks whose clubId matches home or away club
  const myPlayersByFixture = useMemo(() => {
    const map: Record<number, string[]> = {}
    fixtures.forEach(f => {
      const players = picks
        .filter(p => p.clubId === f.homeClubId || p.clubId === f.awayClubId)
        .map(p => p.playerName)
      map[f.id] = players
    })
    return map
  }, [fixtures, picks])

  // Group fixtures by date
  const grouped = useMemo(() => {
    const groups: Record<string, ApiFixture[]> = {}
    fixtures.forEach(f => {
      const date = new Date(f.kickoffAt).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
      if (!groups[date]) groups[date] = []
      groups[date].push(f)
    })
    return groups
  }, [fixtures])

  if (gwLoading) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-slate-500">
        Loading fixtures...
      </div>
    )
  }

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
              Click a match to see your players
            </p>
          </div>

          {/* GW nav in header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedGwNumber(n => Math.max(1, (n ?? gwNumber) - 1))}
              className="w-9 h-9 rounded-xl bg-game-card border border-game-border
                flex items-center justify-center text-slate-300 hover:border-game-neon
                hover:text-game-neon transition-all font-bold text-lg"
            >
              ‹
            </button>
            <div className="text-center">
              <div className="font-bangers text-xl tracking-wider text-white">GW {gwNumber}</div>
              {gw?.deadlineTime && selectedGwNumber === null && (
                <div className="text-xs text-slate-500">
                  <DeadlineCountdown deadline={gw.deadlineTime} />
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedGwNumber(n => Math.min(38, (n ?? gwNumber) + 1))}
              className="w-9 h-9 rounded-xl bg-game-card border border-game-border
                flex items-center justify-center text-slate-300 hover:border-game-neon
                hover:text-game-neon transition-all font-bold text-lg"
            >
              ›
            </button>

            {/* Deadline pill — show when on current GW */}
            {gw?.deadlineTime && selectedGwNumber === null && (
              <div className="hidden sm:flex items-center gap-2 bg-game-fire/10 border border-game-fire/30
                rounded-xl px-3 py-2">
                <span className="text-game-fire">⏰</span>
                <span className="text-game-fire font-bold text-sm">
                  <DeadlineCountdown deadline={gw.deadlineTime} />
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fixtures list */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 lg:pb-8 pt-4">
        {/* Mobile deadline banner */}
        {gw?.deadlineTime && selectedGwNumber === null && (
          <div className="sm:hidden mb-4 flex items-center justify-center gap-2 bg-game-fire/10
            border border-game-fire/30 rounded-xl py-2">
            <span className="text-game-fire">⏰</span>
            <span className="text-game-fire font-bold text-sm">
              Deadline: <DeadlineCountdown deadline={gw.deadlineTime} />
            </span>
          </div>
        )}

        {fixtures.length === 0 && !gwLoading ? (
          <div className="text-center text-slate-500 mt-10">No fixtures for this gameweek</div>
        ) : (
          Object.entries(grouped).map(([date, dayFixtures]) => (
            <div key={date} className="mb-5">
              <div className="flex items-center gap-3 mb-2.5">
                <div className="font-bangers text-sm tracking-widest text-slate-400 uppercase">
                  {date}
                </div>
                <div className="flex-1 h-px bg-game-border" />
                <div className="text-xs text-slate-600 font-medium">{dayFixtures.length} matches</div>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
                {dayFixtures.map(f => (
                  <FixtureCard
                    key={f.id}
                    fixture={f}
                    myPlayerNames={myPlayersByFixture[f.id] ?? []}
                    homeShort={clubsMap.get(f.homeClubId) ?? f.homeClubName.slice(0, 3).toUpperCase()}
                    awayShort={clubsMap.get(f.awayClubId) ?? f.awayClubName.slice(0, 3).toUpperCase()}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
