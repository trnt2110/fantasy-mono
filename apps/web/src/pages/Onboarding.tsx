import { useState, useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useMyFantasyTeam, useCreateTeam } from '../api/hooks'
import { useAuthStore } from '../store/auth.store'
import { Step1PickPlayers } from './onboarding/Step1PickPlayers'
import { Step2Formation } from './onboarding/Step2Formation'
import { Step3Captain } from './onboarding/Step3Captain'
import type { ApiPlayer } from '../api/types'

export function Onboarding() {
  const { data: existingTeam, isSuccess: teamLoaded } = useMyFantasyTeam()
  if (teamLoaded && existingTeam) return <Navigate to="/squad" replace />
  return <OnboardingWizard />
}

function OnboardingWizard() {
  const navigate = useNavigate()
  const competitionId = useAuthStore(s => s.competitionId)
  const { mutate: createTeam, isPending, error } = useCreateTeam()

  const [step, setStep] = useState<1 | 2 | 3>(1)

  // Step 1
  const [pickedPlayers, setPickedPlayers] = useState<ApiPlayer[]>([])

  // Step 2
  const [formation, setFormationState] = useState('4-4-2')
  const [startingIds, setStartingIds] = useState<Set<number>>(new Set())
  const [benchOrderArr, setBenchOrderArr] = useState<number[]>([])

  // Step 3
  const [teamName, setTeamName] = useState('')
  const [captainId, setCaptainId] = useState<number | null>(null)
  const [viceCaptainId, setViceCaptainId] = useState<number | null>(null)

  const budget = useMemo(
    () => Math.round((100 - pickedPlayers.reduce((s, p) => s + p.currentPrice, 0)) * 10) / 10,
    [pickedPlayers]
  )

  const benchOrder = useMemo(
    () => Object.fromEntries(benchOrderArr.map((id, i) => [String(id), i + 1])),
    [benchOrderArr]
  )

  function addPlayer(p: ApiPlayer) {
    setPickedPlayers(prev => [...prev, p])
  }

  function removePlayer(p: ApiPlayer) {
    setPickedPlayers(prev => prev.filter(x => x.id !== p.id))
    setStartingIds(prev => { const n = new Set(prev); n.delete(p.id); return n })
    setBenchOrderArr(prev => prev.filter(id => id !== p.id))
    if (captainId === p.id) setCaptainId(null)
    if (viceCaptainId === p.id) setViceCaptainId(null)
  }

  function changeFormation(f: string) {
    setFormationState(f)
    const gks = pickedPlayers.filter(p => p.position === 'GKP')
    const newStarters = gks.length === 1 ? new Set([gks[0].id]) : new Set<number>()
    setStartingIds(newStarters)
    setBenchOrderArr(pickedPlayers.filter(p => !newStarters.has(p.id)).map(p => p.id))
    setCaptainId(null)
    setViceCaptainId(null)
  }

  function toggleStarter(playerId: number) {
    const player = pickedPlayers.find(p => p.id === playerId)
    if (!player) return

    let newStarters: Set<number>

    if (startingIds.has(playerId)) {
      newStarters = new Set(startingIds)
      newStarters.delete(playerId)
      if (captainId === playerId) setCaptainId(null)
      if (viceCaptainId === playerId) setViceCaptainId(null)
    } else {
      const [def, mid, fwd] = formation.split('-').map(Number)
      const required: Record<string, number> = { GKP: 1, DEF: def, MID: mid, FWD: fwd }
      const starters = pickedPlayers.filter(p => startingIds.has(p.id))
      if (starters.length >= 11) return
      if (starters.filter(p => p.position === player.position).length >= required[player.position]) return
      newStarters = new Set(startingIds)
      newStarters.add(playerId)
    }

    setStartingIds(newStarters)
    setBenchOrderArr(prev => {
      const bench = pickedPlayers.filter(p => !newStarters.has(p.id))
      const ordered = prev.filter(id => bench.some(p => p.id === id))
      const unordered = bench.filter(p => !prev.includes(p.id))
      return [...ordered, ...unordered.map(p => p.id)]
    })
  }

  function handleStep1Next() {
    changeFormation(formation)
    setStep(2)
  }

  function moveBenchPlayer(playerId: number, direction: 'up' | 'down') {
    setBenchOrderArr(prev => {
      const idx = prev.indexOf(playerId)
      if (idx === -1) return prev
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1
      if (targetIdx < 0 || targetIdx >= prev.length) return prev
      const next = [...prev]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next
    })
  }

  function handleCaptainTap(playerId: number) {
    if (captainId === playerId) {
      setCaptainId(null)
      setViceCaptainId(playerId)
    } else if (viceCaptainId === playerId) {
      setViceCaptainId(null)
    } else {
      setCaptainId(playerId)
      if (viceCaptainId === playerId) setViceCaptainId(null)
    }
  }

  function handleSubmit() {
    if (!captainId || !viceCaptainId) return
    createTeam(
      {
        competitionId,
        name: teamName.trim(),
        playerIds: pickedPlayers.map(p => p.id),
        formation,
        startingIds: [...startingIds],
        captainId,
        viceCaptainId,
        benchOrder,
      },
      { onSuccess: () => navigate('/squad', { replace: true }) }
    )
  }

  const STEPS = [
    { num: 1, label: 'Squad' },
    { num: 2, label: 'Formation' },
    { num: 3, label: 'Captain' },
  ] as const

  return (
    <div className="min-h-screen bg-game-bg flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-game-border bg-game-card/50">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <span className="font-bangers text-xl tracking-widest text-white">
            FANTASY<span className="text-game-neon">FOOTY</span>
          </span>
          <div className="flex items-center gap-1">
            {STEPS.map((s, idx) => (
              <div key={s.num} className="flex items-center">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                  ${step === s.num
                    ? 'bg-game-neon text-game-bg shadow-[0_0_10px_rgba(0,255,135,0.5)]'
                    : step > s.num
                    ? 'bg-game-neon/25 text-game-neon border border-game-neon/40'
                    : 'bg-game-card text-slate-500 border border-game-border'}`}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span className={`text-xs font-bold ml-1 hidden sm:inline ${step === s.num ? 'text-game-neon' : 'text-slate-500'}`}>
                  {s.label}
                </span>
                {idx < 2 && <div className={`w-6 h-px mx-2 ${step > s.num ? 'bg-game-neon/40' : 'bg-game-border'}`} />}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden max-w-6xl mx-auto w-full">
        {step === 1 && (
          <Step1PickPlayers
            pickedPlayers={pickedPlayers}
            budget={budget}
            onAdd={addPlayer}
            onRemove={removePlayer}
            onNext={handleStep1Next}
          />
        )}
        {step === 2 && (
          <Step2Formation
            pickedPlayers={pickedPlayers}
            formation={formation}
            startingIds={startingIds}
            benchOrderArr={benchOrderArr}
            onFormationChange={changeFormation}
            onToggleStarter={toggleStarter}
            onMoveBench={moveBenchPlayer}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Captain
            startingPlayers={pickedPlayers.filter(p => startingIds.has(p.id))}
            teamName={teamName}
            captainId={captainId}
            viceCaptainId={viceCaptainId}
            onTeamNameChange={setTeamName}
            onCaptainTap={handleCaptainTap}
            onBack={() => setStep(2)}
            onSubmit={handleSubmit}
            isPending={isPending}
            error={error ? 'Failed to create team. Please try again.' : null}
          />
        )}
      </div>
    </div>
  )
}
