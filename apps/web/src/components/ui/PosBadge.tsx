import type { Position } from '../../data/mock'

const MAP: Record<Position, string> = {
  GKP: 'pos-gkp',
  DEF: 'pos-def',
  MID: 'pos-mid',
  FWD: 'pos-fwd',
}

export function PosBadge({ pos }: { pos: Position }) {
  return <span className={`pos-badge ${MAP[pos]}`}>{pos}</span>
}
