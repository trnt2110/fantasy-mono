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
    counts[p.position as Position]++
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
    for (const p of pickedPlayers) c[p.position as Position]++
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
      (!search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.clubName ?? '').toLowerCase().includes(search.toLowerCase()))
    ),
    [players, search, maxPrice]
  )

  function canAdd(p: ApiPlayer): boolean {
    return (
      !pickedIds.has(p.id) &&
      posCounts[p.position as Position] < POS_REQUIRED[p.position as Position] &&
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
          <span className="text-xs text-slate-400">Max</span>
          <span className="text-xs text-slate-200 font-bold">£{maxPrice}m</span>
          <input
            type="range" min={4} max={15} step={0.5} value={maxPrice}
            onChange={e => setMaxPrice(parseFloat(e.target.value))}
            className="w-16 accent-game-neon"
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
              const clubShort = clubsMap.get(p.clubId) ?? (p.clubName ?? '???').slice(0, 3).toUpperCase()
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
                      className="w-7 h-7 rounded-full bg-red-500/15 border border-red-500/30 text-red-400
                        text-xs font-bold flex items-center justify-center hover:bg-red-500/30 transition-colors flex-shrink-0"
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
        {(['GKP', 'DEF', 'MID', 'FWD'] as Position[]).map(pos => {
          const count = POS_REQUIRED[pos]
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
                const clubShort = clubsMap.get(player.clubId) ?? (player.clubName ?? '???').slice(0, 3).toUpperCase()
                return (
                  <div
                    key={player.id}
                    onClick={() => onRemove(player)}
                    className="flex flex-col items-center gap-0.5 w-12 cursor-pointer group"
                  >
                    <div className="relative">
                      <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                      <div className="absolute inset-0 rounded-xl bg-red-500/0 group-hover:bg-red-500/40
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
          <div className="text-xs text-slate-500 uppercase tracking-wider">Remaining Budget</div>
          <div className={`font-bangers text-lg tracking-wide ${budget < 0 ? 'text-red-400' : budget < 5 ? 'text-orange-400' : 'text-game-gold'}`}>
            £{budget.toFixed(1)}m
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
