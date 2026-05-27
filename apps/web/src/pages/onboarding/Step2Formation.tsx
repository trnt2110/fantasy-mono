import { useMemo } from 'react'
import { useClubsMap } from '../../api/hooks'
import { JerseyIcon } from '../../components/ui/JerseyIcon'
import type { ApiPlayer } from '../../api/types'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

const VALID_FORMATIONS = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'] as const

interface Props {
  pickedPlayers: ApiPlayer[]
  formation: string
  startingIds: Set<number>
  benchOrderArr: number[]
  onFormationChange: (f: string) => void
  onToggleStarter: (playerId: number) => void
  onMoveBench: (playerId: number, direction: 'up' | 'down') => void
  onBack: () => void
  onNext: () => void
}

function getFormationCounts(f: string): Record<Position, number> {
  const [def, mid, fwd] = f.split('-').map(Number)
  return { GKP: 1, DEF: def, MID: mid, FWD: fwd }
}

function isStep2Valid(
  pickedPlayers: ApiPlayer[],
  startingIds: Set<number>,
  formation: string,
  benchOrderArr: number[],
): boolean {
  if (benchOrderArr.length !== 4) return false
  const starters = pickedPlayers.filter(p => startingIds.has(p.id))
  if (starters.length !== 11) return false
  const required = getFormationCounts(formation)
  const gk = starters.filter(p => p.position === 'GKP').length
  const def = starters.filter(p => p.position === 'DEF').length
  const mid = starters.filter(p => p.position === 'MID').length
  const fwd = starters.filter(p => p.position === 'FWD').length
  return gk === required.GKP && def === required.DEF && mid === required.MID && fwd === required.FWD
}

export function Step2Formation({
  pickedPlayers, formation, startingIds, benchOrderArr,
  onFormationChange, onToggleStarter, onMoveBench, onBack, onNext,
}: Props) {
  const clubsMap = useClubsMap()
  const isValid = isStep2Valid(pickedPlayers, startingIds, formation, benchOrderArr)

  const starters = useMemo(
    () => pickedPlayers.filter(p => startingIds.has(p.id)),
    [pickedPlayers, startingIds],
  )

  const benchPlayers = useMemo(
    () => benchOrderArr.map(id => pickedPlayers.find(p => p.id === id)!).filter(Boolean),
    [benchOrderArr, pickedPlayers],
  )

  // Show all players in position rows: starters first (bright), then bench (dimmed)
  function positionRows(): { pos: Position; players: ApiPlayer[] }[] {
    const byPos = (pos: Position) => {
      const all = pickedPlayers.filter(p => p.position === pos)
      return [
        ...all.filter(p => startingIds.has(p.id)),
        ...all.filter(p => !startingIds.has(p.id)),
      ]
    }
    return [
      { pos: 'GKP', players: byPos('GKP') },
      { pos: 'DEF', players: byPos('DEF') },
      { pos: 'MID', players: byPos('MID') },
      { pos: 'FWD', players: byPos('FWD') },
    ]
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Formation picker */}
        <div className="mb-4">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Formation</div>
          <div className="flex flex-wrap gap-2">
            {VALID_FORMATIONS.map(f => (
              <button
                key={f}
                onClick={() => onFormationChange(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold font-bangers tracking-wide transition-all
                  ${formation === f
                    ? 'bg-game-neon/15 text-game-neon border border-game-neon/50 shadow-[0_0_8px_rgba(0,255,135,0.2)]'
                    : 'bg-game-card border border-game-border text-slate-400 hover:border-game-neon/30'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Tap players to toggle starter (bright) / bench (dim).{' '}
            {11 - starters.length > 0 ? `${11 - starters.length} starters left to pick.` : 'Starting XI complete.'}
          </p>
        </div>

        {/* Pitch — all 15 players in position rows, starters bright / bench dimmed */}
        <div
          className="rounded-xl overflow-hidden mb-4"
          style={{
            background: 'linear-gradient(180deg, #0a260a 0%, #071a07 100%)',
            border: '1px solid rgba(34,80,34,0.6)',
          }}
        >
          {positionRows().map(({ pos, players }) => (
            <div key={pos} className="flex justify-center gap-1.5 py-2.5">
              {players.map(player => {
                const isStarter = startingIds.has(player.id)
                const clubShort = clubsMap.get(player.clubId) ?? (player.clubName ?? '???').slice(0, 3).toUpperCase()
                return (
                  <div
                    key={player.id}
                    onClick={() => onToggleStarter(player.id)}
                    className={`flex flex-col items-center gap-0.5 w-12 cursor-pointer group transition-opacity
                      ${isStarter ? 'opacity-100' : 'opacity-40 hover:opacity-70'}`}
                  >
                    <div className="relative">
                      <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                      <div className={`absolute inset-0 rounded-xl transition-colors
                        ${isStarter
                          ? 'bg-black/0 group-hover:bg-red-500/20'
                          : 'bg-black/0 group-hover:bg-game-neon/20'}`} />
                    </div>
                    <div
                      className={`text-center font-bold truncate w-full leading-tight
                        ${isStarter ? 'text-slate-200' : 'text-slate-500'}`}
                      style={{ fontSize: '9px' }}
                    >
                      {player.name.split(' ').pop()}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
        </div>

        {/* Bench priority — only shown once all 11 starters are picked */}
        {starters.length === 11 && (
          <div className="mb-4">
            <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">
              Bench order (auto-sub priority)
            </div>
            <div className="flex flex-col gap-1.5">
              {benchPlayers.map((player, i) => {
                const clubShort = clubsMap.get(player.clubId) ?? (player.clubName ?? '???').slice(0, 3).toUpperCase()
                return (
                  <div key={player.id} className="flex items-center gap-3 game-card px-3 py-2">
                    <span className="text-xs font-bold text-slate-500 w-4">{i + 1}</span>
                    <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                    <span className="text-xs font-bold text-slate-300 flex-1">{player.name}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => onMoveBench(player.id, 'up')}
                        disabled={i === 0}
                        className="text-slate-500 hover:text-game-sky disabled:opacity-20 text-sm leading-none px-1"
                      >▲</button>
                      <button
                        onClick={() => onMoveBench(player.id, 'down')}
                        disabled={i === benchPlayers.length - 1}
                        className="text-slate-500 hover:text-game-sky disabled:opacity-20 text-sm leading-none px-1"
                      >▼</button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-game-border
        bg-game-card/60 flex-shrink-0">
        <button onClick={onBack} className="btn-secondary px-4 py-2.5 text-sm">← Back</button>
        <div className="text-xs text-slate-500 text-center">
          {starters.length}/11 starters
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
