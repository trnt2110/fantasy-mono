import type { Position } from '../../data/mock'

// Club-color mapping (placeholder — will be replaced with real images)
const CLUB_COLORS: Record<string, [string, string]> = {
  ARS: ['#EF0107', '#ffffff'],
  LIV: ['#C8102E', '#ffffff'],
  MCI: ['#6CABDD', '#ffffff'],
  CHE: ['#034694', '#ffffff'],
  TOT: ['#132257', '#ffffff'],
  MUN: ['#DA291C', '#000000'],
  NEW: ['#241F20', '#ffffff'],
  EVE: ['#003399', '#ffffff'],
  BRE: ['#e30613', '#ffffff'],
  BHA: ['#0057B8', '#ffffff'],
  AVL: ['#95BFE5', '#7B1C3E'],
  FUL: ['#000000', '#ffffff'],
  WOL: ['#FDB913', '#231F20'],
  LEI: ['#003090', '#ffffff'],
  NFO: ['#DD0000', '#ffffff'],
  CRY: ['#1B458F', '#c4122e'],
  SOU: ['#D71920', '#ffffff'],
  WHU: ['#7A263A', '#1BB1E7'],
  BOU: ['#DA291C', '#000000'],
  IPS: ['#3a64a3', '#ffffff'],
}

interface JerseyProps {
  clubShort: string
  position: Position
  size?: 'sm' | 'md' | 'lg'
}

export function JerseyIcon({ clubShort, position, size = 'md' }: JerseyProps) {
  const [primary, secondary] = CLUB_COLORS[clubShort] ?? ['#334155', '#94a3b8']
  const isGK = position === 'GKP'
  const [bg, fg] = isGK ? [secondary, primary] : [primary, secondary]

  const sizeClass = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-16 h-16' : 'w-12 h-12'
  const fontSize = size === 'sm' ? '9px' : size === 'lg' ? '14px' : '11px'

  return (
    <div
      className={`${sizeClass} rounded-xl flex items-center justify-center font-bangers tracking-wider select-none flex-shrink-0`}
      style={{
        background: `linear-gradient(145deg, ${bg} 0%, ${bg}cc 100%)`,
        color: fg,
        border: `2px solid ${fg}33`,
        boxShadow: `0 2px 8px ${bg}66, inset 0 1px 0 ${fg}22`,
        fontSize,
      }}
    >
      {clubShort.slice(0, 3)}
    </div>
  )
}
