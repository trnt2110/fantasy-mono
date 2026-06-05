import { usePlayerDetail, usePlayerPerformances } from '../../api/hooks'
import { JerseyIcon } from './JerseyIcon'
import { PosBadge } from './PosBadge'
import type { ApiPlayer } from '../../api/types'

interface PlayerStatsModalProps {
  player: ApiPlayer
  clubShort: string
  onClose: () => void
}

export function PlayerStatsModal({ player, clubShort, onClose }: PlayerStatsModalProps) {
  const { data: detail } = usePlayerDetail(player.id)
  const { data: performances = [] } = usePlayerPerformances(player.id)

  const maxPts = Math.max(...performances.map(p => p.totalPoints), 1)
  const totalGoals = performances.reduce((s, p) => s + p.goalsScored, 0)
  const totalAssists = performances.reduce((s, p) => s + p.assists, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full bg-game-card rounded-t-2xl max-h-[85vh] overflow-y-auto anim-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="pt-3 pb-1 flex justify-center">
          <div className="w-8 h-1 bg-white/20 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex gap-4 items-center px-5 pt-2 pb-4 border-b border-game-border/50">
          <div className="anim-float">
            <JerseyIcon clubShort={clubShort} position={player.position} size="lg" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bangers text-2xl tracking-wider text-white truncate">{player.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 text-sm truncate">{player.clubName}</span>
              <PosBadge pos={player.position} />
            </div>
            <div className="text-game-gold font-bold text-sm mt-1">£{player.currentPrice.toFixed(1)}m</div>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <div className="bg-white/5 rounded-xl px-3 py-2 text-center border border-white/5">
              <div className="font-bangers text-2xl text-game-neon leading-none">{player.totalPoints}</div>
              <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide">Total Pts</div>
            </div>
            <div className="bg-white/5 rounded-xl px-3 py-2 text-center border border-white/5">
              <div className="font-bangers text-xl text-game-gold leading-none">
                {player.currentGwPoints ?? '—'}
              </div>
              <div className="text-[9px] text-slate-500 mt-0.5 uppercase tracking-wide">GW Pts</div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 divide-x divide-game-border/50 border-b border-game-border/50">
          {[
            { label: 'Own%', value: detail?.ownershipPct != null ? `${detail.ownershipPct.toFixed(1)}%` : '—' },
            { label: 'Goals', value: totalGoals },
            { label: 'Assists', value: totalAssists },
          ].map(({ label, value }) => (
            <div key={label} className="py-3 text-center">
              <div className="font-bold text-slate-100 text-base">{value}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* GW bar chart */}
        {performances.length > 0 && (
          <div className="px-5 py-4">
            <div className="text-[10px] text-slate-500 font-bangers tracking-widest mb-3">FORM BY GAMEWEEK</div>
            <div className="flex items-end gap-1.5 h-12">
              {performances.map(perf => (
                <div key={perf.gameweekId} className="flex-1 flex flex-col items-center justify-end">
                  <div
                    className="w-full bg-game-sky/70 rounded-t"
                    style={{ height: `${Math.max((perf.totalPoints / maxPts) * 48, 3)}px` }}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-1.5 mt-1">
              {performances.map(perf => (
                <div key={perf.gameweekId} className="flex-1 text-center text-[7px] text-slate-600">
                  {perf.gameweekNumber}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pb-8">
          <button onClick={onClose} className="w-full btn-secondary py-3 font-bold">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
