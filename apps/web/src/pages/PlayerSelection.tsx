import { useState, useMemo } from 'react'
import { useDraftStore } from '../store/draft.store'
import { useClubsMap, usePlayers, useGwPicks, useMyFantasyTeam, useCurrentGameweek } from '../api/hooks'
import type { ApiPlayer } from '../api/types'
import { JerseyIcon } from '../components/ui/JerseyIcon'
import { PosBadge } from '../components/ui/PosBadge'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

const POSITIONS: Position[] = ['GKP', 'DEF', 'MID', 'FWD']
const SORT_OPTIONS = ['Total Pts', 'Price'] as const

function PlayerRow({ player, clubShort, isPicked, onAdd, onRemove }: {
  player: ApiPlayer
  clubShort: string
  isPicked: boolean
  onAdd: (p: ApiPlayer) => void
  onRemove: (p: ApiPlayer) => void
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-game-border/50
        hover:bg-white/[0.03] transition-colors group ${isPicked ? 'opacity-60' : ''}`}
    >
      <button className="text-slate-500 hover:text-game-sky transition-colors text-xs font-bold w-5 flex-shrink-0">
        ⓘ
      </button>
      <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm text-slate-100 truncate">{player.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500">{player.clubName}</span>
          <PosBadge pos={player.position} />
        </div>
      </div>

      <div className="flex items-center gap-3 text-right flex-shrink-0">
        <div>
          <div className="text-xs text-slate-500 font-medium">Price</div>
          <div className="text-sm font-bold text-game-gold">£{player.currentPrice.toFixed(1)}m</div>
        </div>

        {isPicked ? (
          <button
            onClick={() => onRemove(player)}
            className="w-8 h-8 rounded-full bg-game-red/20 border border-game-red/40
              text-game-red flex items-center justify-center text-sm font-bold
              hover:bg-game-red/40 transition-colors flex-shrink-0"
          >
            ✕
          </button>
        ) : (
          <button
            onClick={() => onAdd(player)}
            className="w-8 h-8 rounded-full bg-game-neon/10 border border-game-neon/30
              text-game-neon flex items-center justify-center text-sm font-bold
              hover:bg-game-neon/25 transition-colors flex-shrink-0"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shared filter state props ─────────────────────────────────
interface FilterState {
  search: string
  posFilter: Position | 'ALL'
  sortBy: typeof SORT_OPTIONS[number]
  maxPrice: number
}
interface FilterActions {
  setSearch: (v: string) => void
  setPosFilter: (v: Position | 'ALL') => void
  setSortBy: (v: typeof SORT_OPTIONS[number]) => void
  setMaxPrice: (v: number) => void
  reset: () => void
}

// ── Desktop filter sidebar ────────────────────────────────────
function FilterSidebar({ f, a, squadCount, filteredCount, budget, onAutoPick }: {
  f: FilterState
  a: FilterActions
  squadCount: number
  filteredCount: number
  budget: number
  onAutoPick: () => void
}) {
  return (
    <aside className="flex flex-col gap-4 overflow-y-auto">
      {/* Squad counter */}
      <div className="game-card p-4">
        <div className="text-xs text-slate-500 font-medium mb-2 tracking-wider uppercase">Squad</div>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-game-neon to-game-sky rounded-full transition-all"
              style={{ width: `${(squadCount / 15) * 100}%` }}
            />
          </div>
          <div className="font-bangers text-xl text-game-neon w-12 text-right">{squadCount}/15</div>
        </div>
        <div className="flex justify-between text-xs text-slate-600 mt-1">
          <span>GKP 0/2</span><span>DEF 0/5</span><span>MID 0/5</span><span>FWD 0/3</span>
        </div>
      </div>

      {/* Budget */}
      <div className="game-card px-4 py-3 flex items-center gap-3">
        <span className="text-2xl">💰</span>
        <div>
          <div className="text-xs text-slate-500 font-medium">Budget</div>
          <div className="font-bangers text-xl text-game-gold">£{budget.toFixed(1)}m</div>
        </div>
      </div>

      {/* Search */}
      <div>
        <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
          Find a player
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
          <input
            type="text"
            placeholder="Name or club..."
            value={f.search}
            onChange={e => a.setSearch(e.target.value)}
            className="w-full bg-game-card border border-game-border rounded-xl
              pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600
              focus:outline-none focus:border-game-neon transition-all font-nunito"
          />
        </div>
      </div>

      {/* Position filter */}
      <div>
        <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
          Position
        </label>
        <div className="grid grid-cols-5 gap-1">
          {(['ALL', ...POSITIONS] as const).map(pos => (
            <button
              key={pos}
              onClick={() => a.setPosFilter(pos)}
              className={`font-bangers tracking-wider text-xs py-2 rounded-lg transition-all
                ${f.posFilter === pos
                  ? 'bg-game-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                  : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
                }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* Sort */}
      <div>
        <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
          Sort by
        </label>
        <div className="flex flex-col gap-1">
          {SORT_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => a.setSortBy(s)}
              className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all
                ${f.sortBy === s
                  ? 'bg-game-sky/15 text-game-sky border border-game-sky/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
            >
              {{ 'Total Pts': '🏆 Total Points', Price: '💰 Price' }[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Max price slider */}
      <div>
        <label className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5 block">
          Max price: <span className="text-game-gold font-bold">£{f.maxPrice.toFixed(1)}m</span>
        </label>
        <input
          type="range" min={4} max={15} step={0.5} value={f.maxPrice}
          onChange={e => a.setMaxPrice(parseFloat(e.target.value))}
          className="w-full accent-game-gold"
        />
        <div className="flex justify-between text-xs text-slate-600 mt-0.5">
          <span>£4m</span><span>£15m</span>
        </div>
      </div>

      {/* Reset */}
      <button
        onClick={a.reset}
        className="w-full text-center py-2 rounded-xl text-slate-500 hover:text-game-red
          border border-game-border/50 hover:border-game-red/30 text-sm font-bold transition-all"
      >
        Reset filters ↺
      </button>

      {/* Spacer + Auto Pick */}
      <div className="flex-1" />
      <button
        onClick={onAutoPick}
        className="btn-primary w-full py-3 text-xl shadow-neon anim-pulse-neon mt-auto"
      >
        ⚡ AUTO PICK
      </button>

      {/* Player count */}
      <div className="text-center text-xs text-slate-500 font-medium">
        <span className="text-game-sky font-bold">{filteredCount}</span> players shown
      </div>
    </aside>
  )
}

// ── Player list section ───────────────────────────────────────
function PlayerListSection({ grouped, clubsMap, pickedIds, onAdd, onRemove, filteredCount }: {
  grouped: Record<Position, ApiPlayer[]>
  clubsMap: Map<number, string>
  pickedIds: Set<number>
  onAdd: (p: ApiPlayer) => void
  onRemove: (p: ApiPlayer) => void
  filteredCount: number
}) {
  return (
    <>
      {/* Count bar */}
      <div className="mb-3 rounded-xl py-2 text-center font-bangers tracking-wider text-sm
        bg-gradient-to-r from-game-sky/20 via-game-sky/10 to-game-sky/20
        border border-game-sky/30 text-game-sky flex-shrink-0">
        {filteredCount} PLAYERS SHOWN
      </div>

      <div className="flex flex-col gap-4">
        {POSITIONS.filter(pos => grouped[pos].length > 0).map(pos => (
          <div key={pos} className="game-card overflow-hidden">
            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border flex items-center">
              <span className="font-bangers tracking-widest text-lg text-slate-200">
                {{ GKP: '🧤 Goalkeepers', DEF: '🛡️ Defenders', MID: '⚡ Midfielders', FWD: '🔥 Forwards' }[pos]}
              </span>
              <div className="flex-1" />
              <span className="text-xs text-slate-500 font-medium w-12 text-right">Price</span>
              <div className="w-8" />
            </div>
            {grouped[pos].map(p => (
              <PlayerRow
                key={p.id}
                player={p}
                clubShort={clubsMap.get(p.clubId) ?? p.clubName.slice(0, 3).toUpperCase()}
                isPicked={pickedIds.has(p.id)}
                onAdd={onAdd}
                onRemove={onRemove}
              />
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

// ── Main PlayerSelection ──────────────────────────────────────
export function PlayerSelection() {
  const { playerIn: draftPlayerIn, setPlayerIn } = useDraftStore()
  const clubsMap = useClubsMap()
  const { data: gw } = useCurrentGameweek()
  const { data: team } = useMyFantasyTeam()
  const { data: picks = [] } = useGwPicks(gw?.id)

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>('ALL')
  const [sortBy, setSortBy] = useState<typeof SORT_OPTIONS[number]>('Total Pts')
  const [maxPrice, setMaxPrice] = useState(15)
  const [toast, setToast] = useState<string | null>(null)
  const [toastKey, setToastKey] = useState(0)

  const pickedIds = useMemo(() => {
    const ids = new Set(picks.map(p => p.playerId))
    if (draftPlayerIn) ids.add(draftPlayerIn.id)
    return ids
  }, [picks, draftPlayerIn])
  const squadCount = picks.length

  // Build filter params for usePlayers — only position (API-supported)
  const filterParams = useMemo(() => ({
    position: posFilter !== 'ALL' ? posFilter : undefined,
  }), [posFilter])

  const { data: playersResponse } = usePlayers(filterParams)
  const allPlayers = playersResponse?.data ?? []

  // Client-side filter for search + maxPrice + sort
  const filtered = useMemo(() => {
    return allPlayers
      .filter(p => p.currentPrice <= maxPrice)
      .filter(p => {
        if (!search) return true
        const q = search.toLowerCase()
        return p.name.toLowerCase().includes(q) || p.clubName.toLowerCase().includes(q)
      })
      .sort((a, b) => {
        if (sortBy === 'Price') return b.currentPrice - a.currentPrice
        return 0 // 'Total Pts' — API already returns in default order
      })
  }, [allPlayers, maxPrice, search, sortBy])

  const grouped = useMemo(() => {
    const groups: Record<Position, ApiPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] }
    filtered.forEach(p => groups[p.position].push(p))
    return groups
  }, [filtered])

  const showToast = (msg: string) => {
    setToast(msg)
    setToastKey(k => k + 1)
    setTimeout(() => setToast(null), 2500)
  }

  const handleAdd = (player: ApiPlayer) => {
    setPlayerIn(player)
    showToast(`${player.name} staged for transfer ⚡`)
  }

  const handleRemove = (player: ApiPlayer) => {
    if (draftPlayerIn?.id === player.id) {
      setPlayerIn(null)
    }
    showToast(`${player.name} removed 👋`)
  }

  const reset = () => { setSearch(''); setPosFilter('ALL'); setMaxPrice(15); setSortBy('Total Pts') }

  const budget = team?.budget ?? 0
  const filterState: FilterState = { search, posFilter, sortBy, maxPrice }
  const filterActions: FilterActions = { setSearch, setPosFilter, setSortBy, setMaxPrice, reset }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
              PLAYER SELECT
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              Max 3 per club · <span className="text-game-gold font-bold">£{budget.toFixed(1)}m</span> budget
            </p>
          </div>
          <div className="game-card px-3 py-1.5 text-center">
            <div className="font-bangers text-xl text-game-neon leading-none">{squadCount}/15</div>
            <div className="text-xs text-slate-500 font-medium">in squad</div>
          </div>
        </div>
      </div>

      {/* ── DESKTOP: sidebar + list ──────────────────────────── */}
      <div className="hidden lg:grid lg:flex-1 lg:overflow-hidden"
        style={{ flex: 1, gridTemplateColumns: '280px 1fr' }}>
        {/* Filter sidebar */}
        <div className="overflow-y-auto p-4 border-r border-game-border/50 flex flex-col gap-4">
          <FilterSidebar
            f={filterState}
            a={filterActions}
            squadCount={squadCount}
            filteredCount={filtered.length}
            budget={budget}
            onAutoPick={() => showToast('Auto pick applied! ⚡')}
          />
        </div>
        {/* Player list */}
        <div className="overflow-y-auto p-4 flex flex-col">
          <PlayerListSection
            grouped={grouped}
            clubsMap={clubsMap}
            pickedIds={pickedIds}
            onAdd={handleAdd}
            onRemove={handleRemove}
            filteredCount={filtered.length}
          />
        </div>
      </div>

      {/* ── MOBILE: stacked layout ────────────────────────────── */}
      <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
        {/* Mobile filter bar */}
        <div className="flex-shrink-0 px-4 pt-3">
          <div className="relative mb-2.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">🔍</span>
            <input
              type="text"
              placeholder="Search players or clubs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-game-card border border-game-border rounded-xl
                pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-600
                focus:outline-none focus:border-game-neon transition-all font-nunito"
            />
          </div>
          <div className="flex gap-2 flex-wrap mb-2">
            {(['ALL', ...POSITIONS] as const).map(pos => (
              <button
                key={pos}
                onClick={() => setPosFilter(pos)}
                className={`font-bangers tracking-wider text-sm px-3 py-1.5 rounded-lg transition-all
                  ${posFilter === pos
                    ? 'bg-game-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                    : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
                  }`}
              >
                {pos}
              </button>
            ))}
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as typeof SORT_OPTIONS[number])}
              className="bg-game-card border border-game-border text-slate-300 text-sm
                px-3 py-1.5 rounded-lg focus:outline-none font-nunito cursor-pointer"
            >
              {SORT_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            <div className="flex items-center gap-2 bg-game-card border border-game-border rounded-lg px-3 py-1.5">
              <span className="text-game-gold text-sm font-bold">£{maxPrice}m</span>
              <input type="range" min={4} max={15} step={0.5} value={maxPrice}
                onChange={e => setMaxPrice(parseFloat(e.target.value))}
                className="w-20 accent-game-gold" />
            </div>
          </div>
          <div className="mb-2 rounded-xl py-2 text-center font-bangers tracking-wider text-sm
            bg-gradient-to-r from-game-sky/20 via-game-sky/10 to-game-sky/20
            border border-game-sky/30 text-game-sky">
            {filtered.length} PLAYERS SHOWN
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-4 pb-24">
          <PlayerListSection
            grouped={grouped}
            clubsMap={clubsMap}
            pickedIds={pickedIds}
            onAdd={handleAdd}
            onRemove={handleRemove}
            filteredCount={filtered.length}
          />
        </div>
      </div>

      {/* Mobile fixed CTA */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 px-4 py-2
        bg-gradient-to-t from-game-bg via-game-bg/95 to-transparent pointer-events-none">
        <div className="pointer-events-auto flex gap-3">
          <button className="btn-primary flex-1 py-3 text-xl shadow-neon anim-pulse-neon">
            ⚡ AUTO PICK
          </button>
          <button className="btn-secondary py-3 px-5 text-xl">💾 SAVE</button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div key={toastKey}
          className="fixed top-6 left-1/2 -translate-x-1/2 anim-pop z-50
            bg-game-card border-2 border-game-neon rounded-2xl px-5 py-3
            font-bold text-sm text-game-neon shadow-neon whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
