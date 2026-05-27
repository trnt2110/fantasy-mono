import type { ApiPlayer } from '../../api/types'

interface Props {
  pickedPlayers: ApiPlayer[]
  budget: number
  onAdd: (p: ApiPlayer) => void
  onRemove: (p: ApiPlayer) => void
  onNext: () => void
}

export function Step1PickPlayers(_props: Props) {
  return <div className="p-8 text-slate-400">Step 1 — coming soon</div>
}
