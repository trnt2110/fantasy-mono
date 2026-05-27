import type { ApiPlayer } from '../../api/types'

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

export function Step2Formation(_props: Props) {
  return <div className="p-8 text-slate-400">Step 2 — coming soon</div>
}
