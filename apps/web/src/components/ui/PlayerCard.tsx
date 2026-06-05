import { JerseyIcon } from './JerseyIcon'
import { PosBadge } from './PosBadge'
import type { ApiPlayer } from '../../api/types'

interface PlayerCardProps {
  player: ApiPlayer
  clubShort: string
  isInSquad: boolean
  isTransferMode: boolean
  isAffordable?: boolean
  onTap: (player: ApiPlayer) => void
}

export function PlayerCard({
  player, clubShort, isInSquad, isTransferMode, isAffordable = true, onTap,
}: PlayerCardProps) {
  const disabled = isTransferMode && !isAffordable

  return (
    <div
      onClick={() => !disabled && onTap(player)}
      className={`relative rounded-xl p-3 border transition-colors select-none
        ${isInSquad
          ? 'bg-game-neon/5 border-game-neon/45 cursor-pointer'
          : disabled
            ? 'bg-game-card border-game-border opacity-50 cursor-not-allowed'
            : 'bg-game-card border-game-border hover:border-game-neon/30 cursor-pointer'
        }`}
    >
      {isInSquad && (
        <div className="absolute top-1.5 right-1.5 bg-game-neon text-black text-[9px] font-black px-1.5 py-0.5 rounded leading-none">
          IN SQUAD
        </div>
      )}

      <div className="mb-2">
        <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
      </div>

      <div className={`font-bold text-[11px] truncate mb-0.5 ${isInSquad ? 'text-game-neon' : 'text-slate-100'}`}>
        {player.name}
      </div>
      <div className="flex items-center gap-1 mb-2">
        <span className="text-slate-500 text-[9px] truncate max-w-[70px]">{player.clubName}</span>
        <PosBadge pos={player.position} />
      </div>

      <div className="flex justify-between items-end">
        <div>
          <div className="text-slate-100 font-bold text-[14px] leading-none">{player.totalPoints}</div>
          <div className="text-slate-500 text-[8px] uppercase mt-0.5">PTS</div>
        </div>
        <div className="text-right">
          <div className="text-game-gold text-[10px] font-bold leading-none">£{player.currentPrice.toFixed(1)}</div>
          {player.currentGwPoints != null && (
            <div className="text-slate-500 text-[8px] mt-0.5">GW:{player.currentGwPoints}</div>
          )}
        </div>
      </div>

      {isTransferMode && disabled && (
        <div className="mt-2 bg-game-red/10 border border-game-red/30 rounded text-center py-1 text-game-red text-[9px] font-bold">
          Too expensive
        </div>
      )}
      {isTransferMode && !disabled && !isInSquad && (
        <div className="mt-2 bg-game-neon/10 border border-game-neon/30 rounded text-center py-1 text-game-neon text-[9px] font-bold">
          ✓ Select
        </div>
      )}
    </div>
  )
}
