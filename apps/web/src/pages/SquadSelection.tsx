import { useState, useMemo } from 'react'
import { QueryErrorResetBoundary } from '@tanstack/react-query'
import {
  useCurrentGameweek,
  useGwPicks,
  useMyFantasyTeam,
  useClubsMap,
  usePlayerPerformances,
  usePlayerDetail,
  useSubmitPicks,
} from '../api/hooks'
import { JerseyIcon } from '../components/ui/JerseyIcon'
import { PosBadge } from '../components/ui/PosBadge'
import { Skeleton } from '../components/ui/Skeleton'
import { DeadlineCountdown } from '../components/DeadlineCountdown'
import { ErrorBoundary } from '../components/ErrorBoundary'
import type { ApiPick } from '../api/types'

type SquadByPos = { GKP: ApiPick[]; DEF: ApiPick[]; MID: ApiPick[]; FWD: ApiPick[]; BENCH: ApiPick[] }

function getClubShort(clubsMap: Map<number, string>, p: { clubId: number; clubName: string }): string {
  return clubsMap.get(p.clubId) ?? p.clubName.slice(0, 3).toUpperCase()
}

// --- Pitch Card ---
function PitchCard({ pick, clubShort, onClick, onSubOutClick, isSubOut = false, isSubIn = false, size = 'md' }: {
  pick: ApiPick
  clubShort: string
  onClick: () => void
  onSubOutClick?: () => void
  isSubOut?: boolean
  isSubIn?: boolean
  size?: 'sm' | 'md' | 'lg'
}) {
  const nameSize = size === 'lg' ? 'text-sm' : 'text-xs'
  const minW = size === 'lg' ? 90 : 70

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center gap-1 cursor-pointer group anim-slide-up"
      style={{ minWidth: minW }}
    >
      <div className="flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5 text-xs font-bold text-game-gold border border-game-gold/30">
        {pick.gwPoints !== null ? `${pick.gwPoints}pts` : '—'}
      </div>

      <div className={`relative rounded-xl transition-all ${
        isSubOut ? 'ring-2 ring-game-red shadow-[0_0_12px_rgba(255,59,48,0.6)]' :
        isSubIn  ? 'ring-2 ring-game-neon shadow-[0_0_12px_rgba(0,255,135,0.5)]' : ''
      }`}>
        <JerseyIcon clubShort={clubShort} position={pick.position} size={size} />
        {pick.isCaptain && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-game-gold
            flex items-center justify-center text-game-bg font-bangers text-xs
            shadow-gold border border-yellow-300"
            style={{ animation: 'badge-bounce 2s ease-in-out infinite' }}
          >
            C
          </div>
        )}
        {/* ✕ button — only for starting players (onSubOutClick present) */}
        {onSubOutClick && (
          <div
            className={`absolute -top-1 -left-2 w-5 h-5 rounded-full bg-game-red
              flex items-center justify-center text-white text-xs font-bold
              transition-opacity shadow-fire cursor-pointer z-10
              ${isSubOut ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
            onClick={e => { e.stopPropagation(); onSubOutClick() }}
          >
            ✕
          </div>
        )}
        {/* ↑ indicator for eligible bench players */}
        {isSubIn && (
          <div className="absolute -top-1 -right-2 w-5 h-5 rounded-full bg-game-neon
            flex items-center justify-center text-game-bg text-xs font-bold shadow-neon">
            ↑
          </div>
        )}
      </div>

      <div className="text-center">
        <div className={`font-bold ${nameSize} leading-tight truncate ${isSubOut ? 'text-game-red' : 'text-white'}`}
          style={{ maxWidth: minW }}>
          {pick.playerName.split(' ').at(-1)}
        </div>
        <div className="text-xs text-slate-400">{clubShort}</div>
      </div>
    </div>
  )
}

// --- Pitch View ---
function PitchView({ onPlayerClick, large = false, squadByPos, clubsMap, playerOut, onSubOut, onBenchClick }: {
  onPlayerClick: (p: ApiPick) => void
  large?: boolean
  squadByPos: SquadByPos
  clubsMap: Map<number, string>
  playerOut: ApiPick | null
  onSubOut: (p: ApiPick) => void
  onBenchClick: (p: ApiPick) => void
}) {
  const { GKP, DEF, MID, FWD, BENCH } = squadByPos
  const cardSize = large ? 'lg' : 'md'
  const gap = large ? 'gap-4' : 'gap-2'

  return (
    <div className="relative rounded-2xl overflow-hidden scanlines" style={{ minHeight: 520 }}>
      <div className="pitch-bg absolute inset-0" />

      {/* Pitch markings */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2
          w-28 h-28 rounded-full border border-white/20" />
        <div className="absolute left-6 right-6 top-[45%] -translate-y-1/2 h-px bg-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-40 h-16 border border-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-16 w-40 h-20 border border-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-4 border-b border-x border-white/30" />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-12 w-16 h-4 border-t border-x border-white/30" />
      </div>

      {/* Players on pitch */}
      <div className="relative z-10 flex flex-col py-4 px-2">
        <div className={`flex justify-center ${gap} py-2`}>
          {GKP.map(p => (
            <PitchCard
              key={p.playerId}
              pick={p}
              clubShort={getClubShort(clubsMap, p)}
              onClick={() => onPlayerClick(p)}
              onSubOutClick={() => onSubOut(p)}
              isSubOut={playerOut?.playerId === p.playerId}
              size={cardSize}
            />
          ))}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {DEF.map(p => (
            <PitchCard
              key={p.playerId}
              pick={p}
              clubShort={getClubShort(clubsMap, p)}
              onClick={() => onPlayerClick(p)}
              onSubOutClick={() => onSubOut(p)}
              isSubOut={playerOut?.playerId === p.playerId}
              size={cardSize}
            />
          ))}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {MID.map(p => (
            <PitchCard
              key={p.playerId}
              pick={p}
              clubShort={getClubShort(clubsMap, p)}
              onClick={() => onPlayerClick(p)}
              onSubOutClick={() => onSubOut(p)}
              isSubOut={playerOut?.playerId === p.playerId}
              size={cardSize}
            />
          ))}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {FWD.map(p => (
            <PitchCard
              key={p.playerId}
              pick={p}
              clubShort={getClubShort(clubsMap, p)}
              onClick={() => onPlayerClick(p)}
              onSubOutClick={() => onSubOut(p)}
              isSubOut={playerOut?.playerId === p.playerId}
              size={cardSize}
            />
          ))}
        </div>

        <div className="h-6" />

        {/* Bench */}
        <div className="mx-2 mb-2">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-3">
            <div className="text-center font-bangers tracking-widest text-slate-400 text-xs mb-2">
              🪑 BENCH
            </div>
            <div className="flex justify-around">
              {BENCH.map((p, i) => {
                const isEligible = playerOut !== null && p.position === playerOut.position
                const isDimmed = playerOut !== null && p.position !== playerOut.position
                return (
                  <div key={p.playerId} className="flex flex-col items-center gap-1">
                    <div className="text-xs font-bangers text-slate-500 bg-black/40 rounded-full w-5 h-5
                      flex items-center justify-center">
                      {i + 1}
                    </div>
                    <div className={isDimmed ? 'opacity-40' : ''}>
                      <PitchCard
                        pick={p}
                        clubShort={getClubShort(clubsMap, p)}
                        onClick={() => onBenchClick(p)}
                        isSubIn={isEligible}
                        size={cardSize}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- List View ---
function ListRow({ pick, clubShort }: { pick: ApiPick; clubShort: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-game-border/50
      hover:bg-white/[0.03] transition-colors">
      <JerseyIcon clubShort={clubShort} position={pick.position} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-100">{pick.playerName}</span>
          {pick.isCaptain && (
            <span className="bg-game-gold/20 text-game-gold border border-game-gold/40
              text-xs font-bangers px-1.5 py-0.5 rounded-md">C</span>
          )}
          {!pick.isStarting && (
            <span className="bg-slate-700/50 text-slate-500 border border-slate-600/30
              text-xs font-bangers px-1.5 py-0.5 rounded-md">BENCH</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500">{pick.clubName}</span>
          <PosBadge pos={pick.position} />
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <div className="text-xs text-slate-500">Pts</div>
        <div className="text-sm font-bold text-game-neon">{pick.gwPoints ?? '—'}</div>
      </div>
    </div>
  )
}

function ListView({ squadByPos, clubsMap }: {
  squadByPos: SquadByPos
  clubsMap: Map<number, string>
}) {
  const { GKP, DEF, MID, FWD, BENCH } = squadByPos
  const sections = [
    { label: '🧤 Goalkeepers', players: GKP },
    { label: '🛡️ Defenders',   players: DEF },
    { label: '⚡ Midfielders',  players: MID },
    { label: '🔥 Forwards',     players: FWD },
    { label: '🪑 Bench',        players: BENCH },
  ]

  return (
    <div className="flex flex-col gap-4 anim-slide-up">
      {sections.map(({ label, players }) => (
        <div key={label} className="game-card overflow-hidden">
          <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border flex items-center justify-between">
            <span className="font-bangers tracking-widest text-lg text-slate-200">{label}</span>
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <span className="w-6 text-right">Pts</span>
            </div>
          </div>
          {players.map(p => (
            <ListRow
              key={p.playerId}
              pick={p}
              clubShort={getClubShort(clubsMap, p)}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// --- Player Info Modal ---
function PlayerModal({ pick, clubShort, allPicks, gameweekId, isPastDeadline, onClose }: {
  pick: ApiPick
  clubShort: string
  allPicks: ApiPick[]
  gameweekId: number | undefined
  isPastDeadline: boolean
  onClose: () => void
}) {
  const { data: detail } = usePlayerDetail(pick.playerId)
  const { data: performances = [] } = usePlayerPerformances(pick.playerId)
  const submitPicks = useSubmitPicks(gameweekId)

  const [toast, setToast] = useState<string | null>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000) }

  const totalPoints = performances.reduce((sum, p) => sum + p.totalPoints, 0)

  const isBenchPlayer = !pick.isStarting
  const isAlreadyCaptain = pick.isCaptain

  function handleCaptain() {
    if (isPastDeadline) { showToast('Deadline passed — picks are locked'); return }
    if (isBenchPlayer) { showToast('Bench players cannot be captain'); return }
    if (isAlreadyCaptain) { showToast('Already captain'); return }

    const startingIds = allPicks.filter(p => p.isStarting).map(p => p.playerId)
    const currentVc = allPicks.find(p => p.isViceCaptain)
    const currentCaptain = allPicks.find(p => p.isCaptain)
    const newVcId = currentVc?.playerId === pick.playerId
      ? (currentCaptain?.playerId ?? pick.playerId)
      : (currentVc?.playerId ?? pick.playerId)
    const benchOrder = Object.fromEntries(
      allPicks.filter(p => !p.isStarting && p.benchOrder != null)
        .map(p => [String(p.playerId), p.benchOrder!])
    )
    submitPicks.mutate(
      { startingPlayerIds: startingIds, captainId: pick.playerId, viceCaptainId: newVcId, benchOrder },
      { onSuccess: () => { showToast('Captain updated!'); onClose() }, onError: () => showToast('Failed to update captain') },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative game-card w-full max-w-sm p-5 anim-pop lg:max-w-md"
        onClick={e => e.stopPropagation()}
      >
        {toast && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-game-card border border-white/10
            text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg z-10 whitespace-nowrap">
            {toast}
          </div>
        )}

        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-game-red text-xl font-bold transition-colors">
          ✕
        </button>

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

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Price',     value: detail?.currentPrice != null ? `£${detail.currentPrice.toFixed(1)}m` : '—', color: 'text-game-gold' },
            { label: 'Own%',      value: detail?.ownershipPct != null ? `${detail.ownershipPct.toFixed(1)}%` : '—', color: 'text-game-sky' },
            { label: 'Total Pts', value: performances.length > 0 ? totalPoints : '—', color: 'text-game-neon' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
              <div className={`font-bangers text-2xl ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {performances.length > 0 && (
          <div className="mb-5">
            <div className="text-xs text-slate-500 font-bangers tracking-widest mb-2">RECENT FORM</div>
            <div className="flex gap-2">
              {performances.slice(-5).reverse().map(perf => (
                <div key={perf.gameweekId} className="flex-1 bg-white/5 rounded-lg p-2 text-center border border-white/5">
                  <div className="font-bangers text-lg text-game-neon">{perf.totalPoints}</div>
                  <div className="text-xs text-slate-500">GW{perf.gameweekNumber}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={handleCaptain}
          disabled={submitPicks.isPending || isAlreadyCaptain || isBenchPlayer}
          className={`w-full py-2.5 ${isAlreadyCaptain || isBenchPlayer ? 'btn-secondary opacity-50' : 'btn-primary'}`}
        >
          {submitPicks.isPending ? '...' : isAlreadyCaptain ? '👑 CAPTAIN ✓' : '👑 MAKE CAPTAIN'}
        </button>

        {isPastDeadline && (
          <p className="text-center text-xs text-game-red mt-3 font-medium">
            Deadline passed — picks locked
          </p>
        )}
      </div>
    </div>
  )
}

// --- CTA Buttons ---
function CtaButtons() {
  return (
    <div className="flex gap-3">
      <button className="btn-secondary flex-1 py-3 text-lg">🔄 TRANSFERS</button>
      <button className="btn-primary flex-1 py-3 text-lg shadow-neon anim-pulse-neon">✅ CONFIRM</button>
    </div>
  )
}

// --- Main Squad Selection ---
export function SquadSelection() {
  const [view, setView] = useState<'pitch' | 'list'>('pitch')
  const [selectedPlayer, setSelectedPlayer] = useState<ApiPick | null>(null)
  const [playerOut, setPlayerOut] = useState<ApiPick | null>(null)
  const [subToast, setSubToast] = useState<string | null>(null)

  const { data: gw, isLoading: gwLoading } = useCurrentGameweek()
  const { data: team, isLoading: teamLoading } = useMyFantasyTeam()
  const { data: picks = [], isLoading: picksLoading } = useGwPicks(gw?.id)
  const clubsMap = useClubsMap()
  const submitPicks = useSubmitPicks(gw?.id)

  const squadByPos = useMemo(() => ({
    GKP:   picks.filter(p => p.position === 'GKP' && p.isStarting),
    DEF:   picks.filter(p => p.position === 'DEF' && p.isStarting),
    MID:   picks.filter(p => p.position === 'MID' && p.isStarting),
    FWD:   picks.filter(p => p.position === 'FWD' && p.isStarting),
    BENCH: picks.filter(p => !p.isStarting).sort((a, b) => (a.benchOrder ?? 0) - (b.benchOrder ?? 0)),
  }), [picks])

  const selectedCount = picks.length
  const bank = team?.budget ?? 0
  const isPastDeadline = gw ? new Date(gw.deadlineTime) <= new Date() : false

  const selectedClubShort = selectedPlayer
    ? getClubShort(clubsMap, selectedPlayer)
    : ''

  function showSubToast(msg: string) {
    setSubToast(msg)
    setTimeout(() => setSubToast(null), 3000)
  }

  function handleSubOut(pick: ApiPick) {
    if (isPastDeadline) { showSubToast('Deadline passed — picks are locked'); return }
    // Toggle: clicking ✕ again cancels sub mode
    setPlayerOut(prev => prev?.playerId === pick.playerId ? null : pick)
  }

  function handleBenchClick(benchPick: ApiPick) {
    if (!playerOut) {
      setSelectedPlayer(benchPick)
      return
    }
    if (benchPick.position !== playerOut.position) {
      showSubToast(`${benchPick.position} can't sub for ${playerOut.position}`)
      return
    }

    const newStartingIds = picks
      .filter(p => p.isStarting)
      .map(p => p.playerId === playerOut.playerId ? benchPick.playerId : p.playerId)

    // Transfer captain/vc to incoming player if outgoing held the armband
    const captainId = playerOut.isCaptain
      ? benchPick.playerId
      : (picks.find(p => p.isCaptain)?.playerId ?? newStartingIds[0])
    const viceCaptainId = playerOut.isViceCaptain
      ? benchPick.playerId
      : (picks.find(p => p.isViceCaptain)?.playerId ?? newStartingIds[1])

    // Outgoing player takes the bench slot of incoming player
    const benchOrder = Object.fromEntries(
      picks
        .filter(p => !p.isStarting)
        .map(p => {
          const id = p.playerId === benchPick.playerId ? playerOut.playerId : p.playerId
          return [String(id), p.benchOrder!]
        })
    )

    submitPicks.mutate(
      { startingPlayerIds: newStartingIds, captainId, viceCaptainId, benchOrder },
      {
        onSuccess: () => { setPlayerOut(null); showSubToast('Sub made!') },
        onError:   () => showSubToast('Sub failed — try again'),
      },
    )
  }

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
        {(gwLoading || teamLoading || picksLoading) ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
        ) : (
    <div className="flex flex-col h-full">

      {/* Sub toast */}
      {subToast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-game-card border border-white/20
          text-white text-sm font-medium px-4 py-2 rounded-full shadow-xl pointer-events-none">
          {subToast}
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
              MY SQUAD
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              GW{gw?.number ?? '—'} · {gw && <DeadlineCountdown deadlineTime={gw.deadlineTime} />}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <div className="game-card px-3 py-1.5 text-center">
                <div className="font-bangers text-xl text-game-neon leading-none">{selectedCount}/15</div>
                <div className="text-xs text-slate-500">players</div>
              </div>
              <div className="game-card px-3 py-1.5 text-center">
                <div className="font-bangers text-xl text-game-gold leading-none">£{team != null ? bank.toFixed(1) : '—'}m</div>
                <div className="text-xs text-slate-500">bank</div>
              </div>
            </div>

            <div className="lg:hidden game-card flex overflow-hidden p-1 gap-1">
              {(['pitch', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`font-bangers tracking-wider text-sm px-3 py-1.5 rounded-xl transition-all
                    ${view === v ? 'tab-active' : 'tab-inactive'}`}
                >
                  {v === 'pitch' ? '⚽' : '📋'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content area ─────────────────────────────────────────── */}

      {/* DESKTOP: two-panel side by side */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_400px] lg:flex-1 lg:overflow-hidden" style={{ flex: 1 }}>
        {/* Left: Pitch */}
        <div className="overflow-y-auto p-4 border-r border-game-border/50">
          <PitchView
            onPlayerClick={setSelectedPlayer}
            large
            squadByPos={squadByPos}
            clubsMap={clubsMap}
            playerOut={playerOut}
            onSubOut={handleSubOut}
            onBenchClick={handleBenchClick}
          />
        </div>

        {/* Right: List + CTAs */}
        <div className="flex flex-col overflow-hidden">
          <div className="flex-shrink-0 px-4 py-2.5 bg-white/[0.02] border-b border-game-border
            flex items-center justify-between">
            <span className="font-bangers tracking-widest text-slate-400 text-sm">SQUAD LIST</span>
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <span className="w-6 text-right">Pts</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3">
            <ListView squadByPos={squadByPos} clubsMap={clubsMap} />
          </div>

          <div className="flex-shrink-0 p-4 border-t border-game-border">
            <CtaButtons />
          </div>
        </div>
      </div>

      {/* MOBILE: single panel with toggle */}
      <div className="lg:hidden flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {view === 'pitch' ? (
          <PitchView
            onPlayerClick={setSelectedPlayer}
            squadByPos={squadByPos}
            clubsMap={clubsMap}
            playerOut={playerOut}
            onSubOut={handleSubOut}
            onBenchClick={handleBenchClick}
          />
        ) : (
          <ListView squadByPos={squadByPos} clubsMap={clubsMap} />
        )}
      </div>

      {/* Mobile fixed CTA */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 px-4 py-2 pointer-events-none
        bg-gradient-to-t from-game-bg/95 to-transparent">
        <div className="pointer-events-auto">
          <CtaButtons />
        </div>
      </div>

      {/* Player modal */}
      {selectedPlayer && (
        <PlayerModal
          pick={selectedPlayer}
          clubShort={selectedClubShort}
          allPicks={picks}
          gameweekId={gw?.id}
          isPastDeadline={isPastDeadline}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </div>
        )}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  )
}
