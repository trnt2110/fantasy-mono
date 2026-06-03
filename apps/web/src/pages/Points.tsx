import { useState, useMemo } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import { useAuthStore } from '../store/auth.store'
import { useFinishedGameweeks, useGwPicks, useGlobalLeaderboard } from '../api/hooks'
import { PosBadge } from '../components/ui/PosBadge'
import { Skeleton } from '../components/ui/Skeleton'
import { ErrorBoundary } from '../components/ErrorBoundary'
import type { ApiLeaderboardEntry, ApiPick } from '../api/types'
import type { Position } from '../data/mock'

// ─── Sub-components ──────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-game-gold/20 text-game-gold border-game-gold/40'
      : rank === 2
      ? 'bg-slate-400/20 text-slate-300 border-slate-400/30'
      : rank === 3
      ? 'bg-amber-700/20 text-amber-600 border-amber-700/30'
      : 'bg-white/5 text-slate-500 border-white/5'
  return (
    <div
      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bangers text-sm
        flex-shrink-0 border ${cls}`}
    >
      {rank}
    </div>
  )
}

function LeaderboardRow({
  entry,
  isMe,
}: {
  entry: ApiLeaderboardEntry
  isMe: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 border-b border-game-border/50
        transition-colors ${isMe ? 'bg-game-neon/5' : 'hover:bg-white/[0.02]'}`}
    >
      <RankBadge rank={entry.rank} />

      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm truncate ${isMe ? 'text-game-neon' : 'text-slate-100'}`}>
          {entry.teamName}
          {isMe && <span className="ml-1.5 text-xs font-bangers text-game-neon/70">(you)</span>}
        </div>
        <div className="text-xs text-slate-500">{entry.username}</div>
      </div>

      <div className="text-right w-12">
        <div className={`text-sm font-bold ${isMe ? 'text-game-sky' : 'text-slate-300'}`}>
          {entry.gwPoints}
        </div>
        <div className="text-xs text-slate-600">GW</div>
      </div>

      <div className="text-right w-14">
        <div className={`text-sm font-bold ${isMe ? 'text-game-gold' : 'text-slate-400'}`}>
          {entry.totalPoints}
        </div>
        <div className="text-xs text-slate-600">Total</div>
      </div>
    </div>
  )
}

function PickRow({ pick }: { pick: ApiPick }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 border-b border-game-border/40
        transition-colors hover:bg-white/[0.02]
        ${!pick.isStarting ? 'opacity-60' : ''}`}
    >
      <PosBadge pos={pick.position as Position} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-sm font-bold text-slate-100 truncate">{pick.playerName}</span>
          {pick.isCaptain && (
            <span className="flex-shrink-0 text-xs font-bangers bg-game-gold/20 text-game-gold
              border border-game-gold/30 rounded px-1 leading-4">C</span>
          )}
          {pick.isViceCaptain && (
            <span className="flex-shrink-0 text-xs font-bangers bg-white/10 text-slate-400
              border border-white/10 rounded px-1 leading-4">V</span>
          )}
        </div>
        <div className="text-xs text-slate-500 truncate">
          {pick.clubName}
          {!pick.isStarting && (
            <span className="ml-1.5 text-slate-600">· bench {pick.benchOrder}</span>
          )}
        </div>
      </div>

      <div className="text-right w-10 flex-shrink-0">
        <div className={`text-sm font-bold ${
          pick.gwPoints === null
            ? 'text-slate-600'
            : pick.gwPoints > 0
            ? 'text-game-neon'
            : 'text-slate-500'
        }`}>
          {pick.gwPoints !== null ? pick.gwPoints * pick.multiplier : '—'}
        </div>
        {pick.isCaptain && pick.gwPoints !== null && (
          <div className="text-xs text-game-gold/70">×{pick.multiplier}</div>
        )}
      </div>
    </div>
  )
}

const POSITION_ORDER: Position[] = ['GKP', 'DEF', 'MID', 'FWD']

function SquadSection({ picks, isLoading, gwNumber }: {
  picks: ApiPick[] | undefined
  isLoading: boolean
  gwNumber: number
}) {
  if (isLoading) {
    return (
      <div className="space-y-1">
        {Array.from({ length: 11 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="w-10 h-5 rounded" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-8" />
          </div>
        ))}
      </div>
    )
  }

  if (!picks || picks.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-slate-500 text-sm">
        No picks recorded for this GW.
      </div>
    )
  }

  const starters = picks.filter(p => p.isStarting)
  const bench = picks.filter(p => !p.isStarting).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99))

  // Group starters by position in defined order
  const grouped = POSITION_ORDER.map(pos => ({
    pos,
    players: starters.filter(p => p.position === pos),
  })).filter(g => g.players.length > 0)

  return (
    <>
      <div className="px-4 py-2 bg-white/[0.02] border-b border-game-border">
        <span className="font-bangers tracking-widest text-base text-slate-300">
          📋 STARTING XI — GW {gwNumber}
        </span>
      </div>

      {grouped.map(({ pos, players }) => (
        <div key={pos}>
          <div className="px-4 py-1.5 bg-white/[0.015]">
            <span className="text-xs font-medium text-slate-600 uppercase tracking-wider">{pos}</span>
          </div>
          {players.map(p => <PickRow key={p.playerId} pick={p} />)}
        </div>
      ))}

      {bench.length > 0 && (
        <>
          <div className="px-4 py-2 bg-white/[0.02] border-t border-b border-game-border mt-1">
            <span className="font-bangers tracking-widest text-base text-slate-500">
              🪑 BENCH
            </span>
          </div>
          {bench.map(p => <PickRow key={p.playerId} pick={p} />)}
        </>
      )}
    </>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

function PointsInner() {
  const { fantasyTeamId } = useAuthStore()

  const { data: finishedGws = [], isLoading: gwsLoading } = useFinishedGameweeks()

  // Default to last finished GW (highest number)
  const defaultGwId = useMemo(() => {
    if (finishedGws.length === 0) return undefined
    return finishedGws.reduce((best, gw) => gw.number > best.number ? gw : best).id
  }, [finishedGws])

  const [selectedGwId, setSelectedGwId] = useState<number | undefined>(undefined)

  // Resolve: use local state if set, otherwise default
  const activeGwId = selectedGwId ?? defaultGwId
  const activeGw = finishedGws.find(gw => gw.id === activeGwId)

  const { data: leaderboard = [], isLoading: lbLoading } = useGlobalLeaderboard(activeGwId)
  const { data: picks, isLoading: picksLoading } = useGwPicks(activeGwId)

  const myEntry = leaderboard.find(e => e.fantasyTeamId === fantasyTeamId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none mb-0.5">
          POINTS HISTORY
        </h1>
        <p className="text-slate-400 text-sm">Review your score for finished gameweeks</p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-20 lg:pb-8 pt-4">

        {/* Loading GWs skeleton */}
        {gwsLoading && (
          <div className="flex gap-2 mb-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-16 rounded-xl" />
            ))}
          </div>
        )}

        {/* No finished GWs yet */}
        {!gwsLoading && finishedGws.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="text-5xl">📅</div>
            <div className="text-center">
              <div className="font-bangers text-xl tracking-wider text-slate-300 mb-1">
                NO FINISHED GAMEWEEKS YET
              </div>
              <p className="text-slate-500 text-sm">
                Check back once the first gameweek has been finalised.
              </p>
            </div>
          </div>
        )}

        {!gwsLoading && finishedGws.length > 0 && (
          <>
            {/* GW tab selector */}
            <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
              {finishedGws.map(gw => {
                const isActive = gw.id === activeGwId
                return (
                  <button
                    key={gw.id}
                    onClick={() => setSelectedGwId(gw.id)}
                    className={`flex-shrink-0 font-bangers tracking-wider text-sm px-4 py-2 rounded-xl
                      transition-all border ${
                        isActive
                          ? 'bg-game-neon/10 text-game-neon border-game-neon/40 shadow-[0_0_8px_rgba(0,255,135,0.15)]'
                          : 'bg-game-card border-game-border text-slate-400 hover:text-slate-200 hover:border-slate-600'
                      }`}
                  >
                    GW {gw.number}
                  </button>
                )
              })}
            </div>

            {/* Score summary card */}
            <div className="game-card p-4 mb-5">
              <div className="text-xs text-slate-500 font-medium uppercase tracking-wider mb-3">
                Your Score — GW {activeGw?.number ?? '—'}
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="text-center flex-1 min-w-16">
                  <div className="font-bangers text-3xl text-game-neon leading-none">
                    {myEntry?.gwPoints ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">GW Points</div>
                </div>
                <div className="w-px h-10 bg-game-border hidden sm:block" />
                <div className="text-center flex-1 min-w-16">
                  <div className="font-bangers text-3xl text-game-gold leading-none">
                    {myEntry ? `#${myEntry.rank}` : '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Rank</div>
                </div>
                <div className="w-px h-10 bg-game-border hidden sm:block" />
                <div className="text-center flex-1 min-w-16">
                  <div className="font-bangers text-3xl text-game-sky leading-none">
                    {myEntry?.totalPoints ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">Total Pts</div>
                </div>
              </div>
            </div>

            {/* Leaderboard + Squad — desktop two-column */}
            <div className="lg:grid lg:grid-cols-[1fr_380px] lg:gap-5">

              {/* GW Leaderboard */}
              <div className="game-card overflow-hidden mb-5 lg:mb-0">
                <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 flex-shrink-0" />
                    <span className="flex-1 font-bangers tracking-widest text-lg text-slate-200">
                      🏆 GW {activeGw?.number ?? '—'} Leaderboard
                    </span>
                    <div className="w-12 text-right text-xs text-slate-500 font-medium">GW</div>
                    <div className="w-14 text-right text-xs text-slate-500 font-medium">Total</div>
                  </div>
                </div>

                {lbLoading ? (
                  <div className="space-y-1 p-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                        <Skeleton className="w-8 h-8 rounded-xl" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-28" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-4 w-12" />
                      </div>
                    ))}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="px-4 py-8 text-center text-slate-500 text-sm">
                    No leaderboard data for this gameweek.
                  </div>
                ) : (
                  leaderboard.slice(0, 20).map(entry => (
                    <LeaderboardRow
                      key={entry.fantasyTeamId}
                      entry={entry}
                      isMe={entry.fantasyTeamId === fantasyTeamId}
                    />
                  ))
                )}
              </div>

              {/* Squad section */}
              <div className="game-card overflow-hidden">
                <SquadSection
                  picks={picks}
                  isLoading={picksLoading}
                  gwNumber={activeGw?.number ?? 0}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function Points() {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          fallback={
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
              <div className="text-5xl">⚠️</div>
              <p className="text-slate-400 text-sm">Failed to load points data.</p>
              <button className="btn-primary" onClick={reset}>Retry</button>
            </div>
          }
        >
          <PointsInner />
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
