import type { ApiPlayer } from '../../api/types'

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

export function Step3Captain(_props: Props) {
  return <div className="p-8 text-slate-400">Step 3 — coming soon</div>
}
