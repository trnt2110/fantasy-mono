import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useDraftStore } from '../store/draft.store'
import { useClubs, useClubsMap, usePlayers, useGwPicks, useMyFantasyTeam, useCurrentGameweek, usePlayerDetail } from '../api/hooks'
import type { ApiPlayer } from '../api/types'
import { PlayerCard } from '../components/ui/PlayerCard'
import { PlayerStatsModal } from '../components/ui/PlayerStatsModal'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorBoundary } from '../components/ErrorBoundary'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'
const POSITIONS: Position[] = ['GKP', 'DEF', 'MID', 'FWD']

export function PlayerSelection() {
  const navigate = useNavigate()
  const { playerOut: draftPlayerOut, setPlayerIn, setPlayerOut: setDraftPlayerOut } = useDraftStore()
  const isTransferMode = !!draftPlayerOut

  const clubsMap = useClubsMap()
  const { data: clubs = [] } = useClubs()
  const { data: gw } = useCurrentGameweek()
  const { data: team } = useMyFantasyTeam()
  const { data: picks = [] } = useGwPicks(gw?.id)

  const { data: playerOutDetail } = usePlayerDetail(draftPlayerOut?.playerId ?? null)
  const budget = team?.budget ?? 0
  const availableBudget = isTransferMode ? budget + (playerOutDetail?.currentPrice ?? 0) : budget

  const [search, setSearch] = useState('')
  const [posFilter, setPosFilter] = useState<Position | 'ALL'>(
    draftPlayerOut ? (draftPlayerOut.position as Position) : 'ALL'
  )
  const [clubId, setClubId] = useState<number | undefined>(undefined)
  const [sortByPrice, setSortByPrice] = useState(false)
  const [limit, setLimit] = useState(50)
  const [selectedPlayer, setSelectedPlayer] = useState<ApiPlayer | null>(null)

  useEffect(() => {
    if (draftPlayerOut) setPosFilter(draftPlayerOut.position as Position)
    else setPosFilter('ALL')
  }, [draftPlayerOut?.playerId])

  function handlePosFilter(pos: Position | 'ALL') { setPosFilter(pos); setLimit(50) }
  function handleClubId(id: number | undefined) { setClubId(id); setLimit(50) }
  function handleSearch(s: string) { setSearch(s); setLimit(50) }

  const pickedIds = useMemo(() => new Set(picks.map(p => p.playerId)), [picks])

  const filterParams = useMemo(() => ({
    position: posFilter !== 'ALL' ? posFilter : undefined,
    clubId,
    search: search || undefined,
    limit,
  }), [posFilter, clubId, search, limit])

  const { data: playersResponse, isLoading } = usePlayers(filterParams)
  const rawPlayers = playersResponse?.data ?? []
  const meta = playersResponse?.meta

  const players = useMemo(() => {
    if (sortByPrice) return [...rawPlayers].sort((a, b) => b.currentPrice - a.currentPrice)
    return rawPlayers
  }, [rawPlayers, sortByPrice])

  const hasMore = meta ? meta.total > limit : false

  function handleCardTap(player: ApiPlayer) {
    if (isTransferMode) {
      if (player.currentPrice > availableBudget) return
      setPlayerIn(player)
      navigate('/squad')
    } else {
      setSelectedPlayer(player)
    }
  }

  function cancelTransfer() {
    setDraftPlayerOut(null)
    navigate('/squad')
  }

  const filterBar = (
    <div className="flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[140px]">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
        <input
          type="text"
          placeholder="Name…"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          className="w-full bg-game-card border border-game-border rounded-xl
            pl-8 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600
            focus:outline-none focus:border-game-neon transition-all font-nunito"
        />
      </div>
      <div className="flex gap-1">
        {(['ALL', ...POSITIONS] as const).map(pos => (
          <button
            key={pos}
            onClick={() => handlePosFilter(pos)}
            className={`font-bangers tracking-wider text-xs px-2.5 py-1.5 rounded-lg transition-all
              ${posFilter === pos
                ? 'bg-game-purple text-white'
                : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
              }`}
          >
            {pos}
          </button>
        ))}
      </div>
      <select
        value={clubId ?? ''}
        onChange={e => handleClubId(e.target.value ? Number(e.target.value) : undefined)}
        className="bg-game-card border border-game-border text-slate-300 text-sm
          px-3 py-2 rounded-xl focus:outline-none font-nunito cursor-pointer
          focus:border-game-neon transition-all"
      >
        <option value="">All Clubs</option>
        {clubs.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <button
        onClick={() => setSortByPrice(v => !v)}
        className={`text-xs font-bold px-3 py-2 rounded-xl border transition-all
          ${sortByPrice
            ? 'bg-game-sky/15 text-game-sky border-game-sky/30'
            : 'bg-game-card border-game-border text-slate-400 hover:border-game-sky/30'
          }`}
      >
        {sortByPrice ? '£ ↓' : 'Pts ↓'}
      </button>
    </div>
  )

  const cardGrid = (
    <>
      <div className="grid grid-cols-2 gap-3">
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))
          : players.map(p => (
              <PlayerCard
                key={p.id}
                player={p}
                clubShort={clubsMap.get(p.clubId) ?? p.clubName.slice(0, 3).toUpperCase()}
                isInSquad={pickedIds.has(p.id)}
                isTransferMode={isTransferMode}
                isAffordable={p.currentPrice <= availableBudget}
                onTap={handleCardTap}
              />
            ))
        }
      </div>
      {hasMore && !isLoading && (
        <button
          onClick={() => setLimit(l => l + 50)}
          className="w-full mt-4 py-3 rounded-xl border border-game-border text-slate-400
            hover:text-game-sky hover:border-game-sky/30 text-sm font-bold transition-all"
        >
          ↓ Load more ({meta!.total - players.length} more)
        </button>
      )}
    </>
  )

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="text-5xl">⚠️</div>
              <p className="text-slate-400 text-sm">Failed to load players.</p>
              <button className="btn-primary" onClick={reset}>Retry</button>
            </div>
          }
        >
          <div className="flex flex-col h-full">

            {isTransferMode && draftPlayerOut && (
              <div className="flex-shrink-0 flex items-center gap-3 px-5 py-3
                bg-game-gold/10 border-b-2 border-game-gold/40">
                <span className="text-xl">🔄</span>
                <div className="flex-1 min-w-0">
                  <div className="font-bangers tracking-wider text-game-gold text-base leading-none">
                    REPLACING {draftPlayerOut.playerName.toUpperCase()}
                  </div>
                  <div className="text-slate-400 text-xs mt-0.5">
                    {draftPlayerOut.position} · Budget: £{availableBudget.toFixed(1)}m
                  </div>
                </div>
                <button
                  onClick={cancelTransfer}
                  className="text-slate-500 hover:text-game-red text-xl font-bold transition-colors flex-shrink-0"
                >
                  ✕
                </button>
              </div>
            )}

            {!isTransferMode && (
              <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
                      PLAYERS
                    </h1>
                    <p className="text-slate-400 text-sm mt-0.5">
                      {meta ? `${meta.total} players` : 'Browse & scout'}
                    </p>
                  </div>
                  <div className="game-card px-3 py-1.5 text-center">
                    <div className="font-bangers text-xl text-game-gold leading-none">
                      £{budget.toFixed(1)}m
                    </div>
                    <div className="text-xs text-slate-500 font-medium">budget</div>
                  </div>
                </div>
              </div>
            )}

            <div className="hidden lg:grid lg:flex-1 lg:overflow-hidden"
              style={{ flex: 1, gridTemplateColumns: '280px 1fr' }}>
              <div className="overflow-y-auto p-4 border-r border-game-border/50 flex flex-col gap-4">
                <div className="flex flex-col gap-3">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">🔍</span>
                    <input
                      type="text"
                      placeholder="Name…"
                      value={search}
                      onChange={e => handleSearch(e.target.value)}
                      className="w-full bg-game-card border border-game-border rounded-xl
                        pl-8 pr-3 py-2.5 text-sm text-slate-100 placeholder-slate-600
                        focus:outline-none focus:border-game-neon transition-all font-nunito"
                    />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Position</div>
                    <div className="grid grid-cols-5 gap-1">
                      {(['ALL', ...POSITIONS] as const).map(pos => (
                        <button
                          key={pos}
                          onClick={() => handlePosFilter(pos)}
                          className={`font-bangers tracking-wider text-xs py-2 rounded-lg transition-all
                            ${posFilter === pos
                              ? 'bg-game-purple text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                              : 'bg-game-card border border-game-border text-slate-400 hover:border-game-purple/50'
                            }`}
                        >
                          {pos}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Club</div>
                    <select
                      value={clubId ?? ''}
                      onChange={e => handleClubId(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full bg-game-card border border-game-border text-slate-300 text-sm
                        px-3 py-2.5 rounded-xl focus:outline-none font-nunito cursor-pointer
                        focus:border-game-neon transition-all"
                    >
                      <option value="">All Clubs</option>
                      {clubs.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 font-medium tracking-wider uppercase mb-1.5">Sort by</div>
                    <div className="flex flex-col gap-1">
                      {[
                        { label: '🏆 Total Points', value: false },
                        { label: '💰 Price', value: true },
                      ].map(opt => (
                        <button
                          key={String(opt.value)}
                          onClick={() => setSortByPrice(opt.value)}
                          className={`text-left px-3 py-2 rounded-xl text-sm font-bold transition-all
                            ${sortByPrice === opt.value
                              ? 'bg-game-sky/15 text-game-sky border border-game-sky/30'
                              : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                            }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => { setSearch(''); setPosFilter('ALL'); setClubId(undefined); setSortByPrice(false); setLimit(50) }}
                    className="w-full text-center py-2 rounded-xl text-slate-500 hover:text-game-red
                      border border-game-border/50 hover:border-game-red/30 text-sm font-bold transition-all"
                  >
                    Reset filters ↺
                  </button>
                </div>
                {meta && (
                  <div className="text-center text-xs text-slate-500 mt-auto">
                    <span className="text-game-sky font-bold">{meta.total}</span> players total
                  </div>
                )}
              </div>
              <div className="overflow-y-auto p-4">
                {cardGrid}
              </div>
            </div>

            <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
              <div className="flex-shrink-0 px-4 pt-3 pb-2">
                {filterBar}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-24">
                {cardGrid}
              </div>
            </div>

          </div>

          {selectedPlayer && !isTransferMode && (
            <PlayerStatsModal
              player={selectedPlayer}
              clubShort={clubsMap.get(selectedPlayer.clubId) ?? selectedPlayer.clubName.slice(0, 3).toUpperCase()}
              onClose={() => setSelectedPlayer(null)}
            />
          )}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
