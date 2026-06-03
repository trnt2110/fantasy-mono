import { useState } from 'react'
import {
  useSimulationStatus,
  useCreateBots,
  useResetBots,
  useOpenGameweek,
  useSubmitBotPicks,
  useFinalizeGameweek,
} from '../../api/hooks/useAdminSimulation'
import type { FinalizeGwResult, BotPicksResult, SimulationCurrentGw } from '../../api/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtDeadline(iso: string) {
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function isPast(iso: string) {
  return new Date(iso) <= new Date()
}

function StepDot({ n, done, active }: { n: number; done: boolean; active: boolean }) {
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
      ${done ? 'bg-green-500 text-white' : active ? 'bg-game-neon text-game-bg' : 'bg-white/10 text-slate-400'}`}>
      {done ? '✓' : n}
    </div>
  )
}

function ActionBtn({
  label, onClick, isPending, disabled = false, variant = 'neon',
}: {
  label: string
  onClick: () => void
  isPending: boolean
  disabled?: boolean
  variant?: 'neon' | 'gold' | 'muted'
}) {
  const colors = {
    neon: 'bg-game-neon/10 border-game-neon/40 text-game-neon hover:bg-game-neon/20',
    gold: 'bg-game-gold/10 border-game-gold/40 text-game-gold hover:bg-game-gold/20',
    muted: 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10',
  }
  return (
    <button
      onClick={onClick}
      disabled={isPending || disabled}
      className={`px-4 py-2 border rounded-lg text-sm font-medium transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 ${colors[variant]}`}
    >
      {isPending && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
      )}
      {label}
    </button>
  )
}

function StatusBadge({ status }: { status: SimulationCurrentGw['status'] }) {
  const map = {
    SCHEDULED: 'bg-slate-500/20 text-slate-400',
    ACTIVE: 'bg-blue-500/20 text-blue-400',
    SCORING: 'bg-amber-500/20 text-amber-400',
    FINISHED: 'bg-green-500/20 text-green-400',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>{status}</span>
  )
}

export function AdminSimulation() {
  const [toast, setToast] = useState<string | null>(null)
  const [botCount, setBotCount] = useState(5)
  const [lastFinalize, setLastFinalize] = useState<FinalizeGwResult | null>(null)
  const [lastBotPicks, setLastBotPicks] = useState<BotPicksResult | null>(null)

  const { data: status, isLoading, error } = useSimulationStatus()
  const createBots = useCreateBots()
  const resetBots = useResetBots()
  const openGw = useOpenGameweek()
  const submitBotPicks = useSubmitBotPicks()
  const finalizeGw = useFinalizeGameweek()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  const gw = status?.currentGameweek ?? null
  const deadlinePassed = gw ? isPast(gw.deadlineTime) : true
  const gwIsFinished = gw?.status === 'FINISHED'

  const step1Done = !deadlinePassed
  const step2Done = step1Done
  const step3Done = lastBotPicks !== null
  const step4Done = gwIsFinished

  function handleCreateBots() {
    createBots.mutate(
      { count: botCount, competitionId: 39 },
      {
        onSuccess: (r) => showToast(`${r.created} bots created, ${r.skipped} already exist`),
        onError: () => showToast('Failed to create bots — check API logs'),
      },
    )
  }

  function handleResetBots() {
    resetBots.mutate(undefined, {
      onSuccess: (r) => showToast(`${r.deleted} bots deleted — ready to recreate`),
      onError: () => showToast('Failed to reset bots — check API logs'),
    })
  }

  function handleOpenGw() {
    if (!gw) return
    openGw.mutate(
      { gwId: gw.id, minutesFromNow: 60 },
      {
        onSuccess: () => showToast(`GW ${gw.number} opened — 60 min to deadline`),
        onError: () => showToast('Failed to open gameweek'),
      },
    )
  }

  function handleBotPicks() {
    if (!gw) return
    submitBotPicks.mutate(gw.id, {
      onSuccess: (r) => {
        setLastBotPicks(r)
        showToast(`Bot picks submitted — ${r.picksSeeded} seeded, ${r.bots - r.picksSeeded} already set`)
      },
      onError: () => showToast('Failed to submit bot picks'),
    })
  }

  function handleFinalize() {
    if (!gw) return
    finalizeGw.mutate(gw.id, {
      onSuccess: (r) => {
        setLastFinalize(r)
        setLastBotPicks(null)
        showToast(`GW ${gw.number} finalized — ${r.teamsScored} teams scored`)
      },
      onError: () => showToast('Failed to finalize gameweek'),
    })
  }

  function handleNextGw() {
    if (!lastFinalize?.nextGameweekId) return
    openGw.mutate(
      { gwId: lastFinalize.nextGameweekId, minutesFromNow: 60 },
      {
        onSuccess: () => {
          setLastFinalize(null)
          setLastBotPicks(null)
          showToast('Next GW opened — 60 min to deadline')
        },
        onError: () => showToast('Failed to open next gameweek'),
      },
    )
  }

  if (isLoading) {
    return <div className="text-slate-400 text-sm animate-pulse">Loading simulation status…</div>
  }

  if (error) {
    return <div className="text-red-400 text-sm">Failed to load simulation status. Is the API running?</div>
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {toast && (
        <div className="fixed top-4 right-4 bg-game-card border border-white/20 text-white
          px-4 py-3 rounded-lg text-sm shadow-xl z-50">
          {toast}
        </div>
      )}

      {/* Bot Setup Card */}
      <div className={`bg-game-card rounded-xl p-5 border transition-all
        ${(status?.botCount ?? 0) > 0 ? 'border-white/10 opacity-70' : 'border-game-neon/30'}`}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-bangers text-lg tracking-wide text-white">Bot Players</h2>
            {(status?.botCount ?? 0) > 0 ? (
              <p className="text-slate-400 text-sm mt-0.5">
                <span className="text-green-400">●</span>{' '}
                {status!.botCount} bots active · Premier League
              </p>
            ) : (
              <p className="text-slate-500 text-sm mt-0.5">No bots yet</p>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {(status?.botCount ?? 0) === 0 && (
              <div className="flex items-center gap-2">
                <label className="text-slate-400 text-xs">Bots:</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={botCount}
                  onChange={e => setBotCount(Number(e.target.value))}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5
                    text-sm text-white text-center outline-none focus:border-game-neon/50"
                />
              </div>
            )}
            {(status?.botCount ?? 0) > 0 ? (
              <ActionBtn
                label="Reset Bots"
                onClick={handleResetBots}
                isPending={resetBots.isPending}
                variant="muted"
              />
            ) : (
              <ActionBtn
                label="Create Bots"
                onClick={handleCreateBots}
                isPending={createBots.isPending}
                variant="neon"
              />
            )}
          </div>
        </div>
        {createBots.error && (
          <p className="text-red-400 text-xs mt-2">Failed to create bots — check API logs</p>
        )}
      </div>

      {/* Current GW Card */}
      <div className="bg-game-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
          <span className="font-bangers text-lg tracking-wide">
            {gw ? `GW ${gw.number}` : 'No Active Gameweek'}
          </span>
          {gw && <StatusBadge status={gw.status} />}
          {gw && (
            <span className="text-slate-500 text-xs ml-auto">
              Deadline: {fmtDeadline(gw.deadlineTime)}
              {deadlinePassed
                ? <span className="text-red-400 ml-2">● PASSED</span>
                : <span className="text-game-neon ml-2">● OPEN</span>}
            </span>
          )}
        </div>

        {!gw ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            All gameweeks may be finished, or no current gameweek is set.
          </div>
        ) : (
          <div className="px-5 py-5">
            <div className="flex items-start gap-0 mb-6">
              <div className="flex flex-col items-center flex-1">
                <StepDot n={1} done={step1Done} active={!step1Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Open</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Set deadline</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step1Done ? 'bg-green-500/50' : 'bg-white/10'}`} />
              <div className="flex flex-col items-center flex-1">
                <StepDot n={2} done={step2Done} active={step1Done && !step2Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Your Picks</div>
                <div className="text-xs text-game-gold text-center mt-0.5">Main app →</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step3Done ? 'bg-green-500/50' : 'bg-white/10'}`} />
              <div className="flex flex-col items-center flex-1">
                <StepDot n={3} done={step3Done} active={step2Done && !step3Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Bot Picks</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Auto-seed</div>
              </div>
              <div className={`flex-1 h-px mt-4 ${step4Done ? 'bg-green-500/50' : 'bg-white/10'}`} />
              <div className="flex flex-col items-center flex-1">
                <StepDot n={4} done={step4Done} active={step3Done && !step4Done} />
                <div className="text-xs mt-2 text-center font-medium text-slate-300">Finalize</div>
                <div className="text-xs text-slate-500 text-center mt-0.5">Score + advance</div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              {!step1Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn label="Open GW" onClick={handleOpenGw} isPending={openGw.isPending} variant="neon" />
                  {openGw.error && <span className="text-red-400 text-xs">Failed to open</span>}
                </div>
              )}
              {step1Done && !step4Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn
                    label={lastBotPicks ? `Bot Picks ✓ (${lastBotPicks.picksSeeded} seeded)` : 'Submit Bot Picks'}
                    onClick={handleBotPicks}
                    isPending={submitBotPicks.isPending}
                    variant={lastBotPicks ? 'muted' : 'neon'}
                  />
                  {submitBotPicks.error && <span className="text-red-400 text-xs">Failed to submit</span>}
                </div>
              )}
              {!step4Done && (
                <div className="flex flex-col gap-1">
                  <ActionBtn label="Finalize GW" onClick={handleFinalize} isPending={finalizeGw.isPending} variant="gold" />
                  {finalizeGw.error && <span className="text-red-400 text-xs">Failed to finalize</span>}
                </div>
              )}
              {step4Done && (
                <ActionBtn
                  label={lastFinalize?.nextGameweekId ? 'Next GW →' : 'All GWs Complete'}
                  onClick={handleNextGw}
                  isPending={openGw.isPending}
                  disabled={!lastFinalize?.nextGameweekId}
                  variant="neon"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* GW History Table */}
      <div className="bg-game-card rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-3 border-b border-white/10">
          <h2 className="font-bangers text-base tracking-wide text-slate-300">GW History</h2>
        </div>
        {(status?.finishedGameweeks?.length ?? 0) === 0 ? (
          <div className="px-5 py-6 text-center text-slate-500 text-sm">
            No gameweeks finalized yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">GW</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Status</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Teams Scored</th>
                <th className="px-5 py-2.5 text-left text-slate-500 font-medium">Deadline</th>
              </tr>
            </thead>
            <tbody>
              {status!.finishedGameweeks.map(gw => (
                <tr key={gw.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-medium text-white">GW {gw.number}</td>
                  <td className="px-5 py-3">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/20 text-green-400">
                      ✓ FINISHED
                    </span>
                  </td>
                  <td className="px-5 py-3 text-slate-300">{gw.teamsScored}</td>
                  <td className="px-5 py-3 text-slate-400">{fmtDate(gw.deadlineTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
