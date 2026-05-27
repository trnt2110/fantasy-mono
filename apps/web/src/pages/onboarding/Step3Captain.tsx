import { useClubsMap } from '../../api/hooks'
import { JerseyIcon } from '../../components/ui/JerseyIcon'
import type { ApiPlayer } from '../../api/types'

type Position = 'GKP' | 'DEF' | 'MID' | 'FWD'

interface Props {
  startingPlayers: ApiPlayer[]
  teamName: string
  captainId: number | null
  viceCaptainId: number | null
  onTeamNameChange: (name: string) => void
  onCaptainTap: (playerId: number) => void
  onBack: () => void
  onSubmit: () => void
  isPending: boolean
  error: string | null
}

function groupByPosition(players: ApiPlayer[]): Record<Position, ApiPlayer[]> {
  const g: Record<Position, ApiPlayer[]> = { GKP: [], DEF: [], MID: [], FWD: [] }
  for (const p of players) g[p.position as Position].push(p)
  return g
}

export function Step3Captain({
  startingPlayers, teamName, captainId, viceCaptainId,
  onTeamNameChange, onCaptainTap, onBack, onSubmit, isPending, error,
}: Props) {
  const clubsMap = useClubsMap()
  const grouped = groupByPosition(startingPlayers)

  const canSubmit =
    teamName.trim().length > 0 &&
    captainId !== null &&
    viceCaptainId !== null &&
    !isPending

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {/* Team name */}
        <div className="mb-5">
          <label className="text-xs text-slate-500 uppercase tracking-wider mb-1.5 block">
            Team Name
          </label>
          <input
            type="text"
            value={teamName}
            onChange={e => onTeamNameChange(e.target.value)}
            maxLength={50}
            placeholder="My Fantasy FC"
            className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
              text-sm text-slate-100 placeholder-slate-600 focus:outline-none
              focus:border-game-neon transition-all font-nunito"
          />
        </div>

        {/* Captain instructions */}
        <div className="mb-3">
          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">
            Captain + Vice-Captain
          </div>
          <p className="text-xs text-slate-600">
            Tap once = Captain (gold C) · Tap again = Vice-Captain (blue VC) · Third tap = clear
          </p>
        </div>

        {/* Starting XI pitch (captain picker) */}
        <div
          className="rounded-xl overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #0a260a 0%, #071a07 100%)',
            border: '1px solid rgba(34,80,34,0.6)',
          }}
        >
          {(['GKP', 'DEF', 'MID', 'FWD'] as Position[]).map(pos => {
            const players = grouped[pos]
            if (players.length === 0) return null
            return (
              <div key={pos} className="flex justify-center gap-2 py-2.5">
                {players.map(player => {
                  const isCaptain = captainId === player.id
                  const isVC = viceCaptainId === player.id
                  const clubShort = clubsMap.get(player.clubId) ?? (player.clubName ?? '???').slice(0, 3).toUpperCase()
                  return (
                    <div
                      key={player.id}
                      onClick={() => onCaptainTap(player.id)}
                      className="flex flex-col items-center gap-0.5 w-14 cursor-pointer group"
                    >
                      <div className="relative">
                        <JerseyIcon clubShort={clubShort} position={player.position} size="sm" />
                        {isCaptain && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                            bg-game-gold flex items-center justify-center font-bangers text-xs text-game-bg
                            shadow-[0_0_6px_rgba(255,214,10,0.6)] border border-yellow-300">
                            C
                          </div>
                        )}
                        {isVC && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full
                            bg-game-sky flex items-center justify-center font-bangers text-xs text-game-bg
                            shadow-[0_0_6px_rgba(56,189,248,0.5)] border border-sky-300">
                            V
                          </div>
                        )}
                        {!isCaptain && !isVC && (
                          <div className="absolute inset-0 rounded-xl bg-game-gold/0
                            group-hover:bg-game-gold/15 transition-colors" />
                        )}
                      </div>
                      <div
                        className={`text-center font-bold truncate w-full leading-tight
                          ${isCaptain ? 'text-game-gold' : isVC ? 'text-game-sky' : 'text-slate-200'}`}
                        style={{ fontSize: '9px' }}
                      >
                        {player.name.split(' ').pop()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Status summary */}
        <div className="flex gap-4 mt-3 justify-center">
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bangers text-xs
              ${captainId ? 'bg-game-gold text-game-bg' : 'bg-game-card text-slate-500 border border-game-border'}`}>
              C
            </div>
            <span className={captainId ? 'text-game-gold' : 'text-slate-500'}>
              {captainId
                ? (startingPlayers.find(p => p.id === captainId)?.name.split(' ').pop() ?? '?')
                : 'None'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center font-bangers text-xs
              ${viceCaptainId ? 'bg-game-sky text-game-bg' : 'bg-game-card text-slate-500 border border-game-border'}`}>
              V
            </div>
            <span className={viceCaptainId ? 'text-game-sky' : 'text-slate-500'}>
              {viceCaptainId
                ? (startingPlayers.find(p => p.id === viceCaptainId)?.name.split(' ').pop() ?? '?')
                : 'None'}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-game-border bg-game-card/60 flex-shrink-0">
        {error && (
          <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg
            text-red-400 text-xs font-bold text-center">
            {error}
          </div>
        )}
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="btn-secondary px-4 py-2.5 text-sm">← Back</button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="btn-primary px-6 py-2.5 text-sm font-bangers tracking-wider
              disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Creating...' : '✨ CREATE TEAM'}
          </button>
        </div>
      </div>
    </div>
  )
}
