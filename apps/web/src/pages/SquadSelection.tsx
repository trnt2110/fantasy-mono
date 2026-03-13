import { useState } from 'react'
import { MOCK_PLAYERS, SQUAD_BY_POSITION, type Player } from '../data/mock'
import { JerseyIcon } from '../components/ui/JerseyIcon'
import { PosBadge } from '../components/ui/PosBadge'

// --- Pitch Card ---
function PitchCard({ player, onClick, size = 'md' }: {
  player: Player
  onClick: () => void
  size?: 'sm' | 'md' | 'lg'
}) {
  const nameSize = size === 'lg' ? 'text-sm' : 'text-xs'
  const minW = size === 'lg' ? 90 : 70

  return (
    <div
      onClick={onClick}
      className="flex flex-col items-center gap-1 cursor-pointer group anim-slide-up"
      style={{ minWidth: minW }}
    >
      <div className="flex items-center gap-1 bg-black/50 rounded-full px-2 py-0.5 text-xs font-bold text-game-gold border border-game-gold/30">
        £{player.price.toFixed(1)}m
      </div>

      <div className="relative">
        <JerseyIcon clubShort={player.clubShort} position={player.position} size={size} />
        {player.isCapitain && (
          <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-game-gold
            flex items-center justify-center text-game-bg font-bangers text-xs
            shadow-gold border border-yellow-300"
            style={{ animation: 'badge-bounce 2s ease-in-out infinite' }}
          >
            C
          </div>
        )}
        <div className="absolute -top-1 -left-2 w-5 h-5 rounded-full bg-game-red
          flex items-center justify-center text-white text-xs font-bold
          opacity-0 group-hover:opacity-100 transition-opacity shadow-fire">
          ✕
        </div>
      </div>

      <div className="text-center">
        <div className={`font-bold ${nameSize} text-white leading-tight truncate`}
          style={{ maxWidth: minW }}>
          {player.name.split(' ').at(-1)}
        </div>
        <div className="text-xs text-slate-400">{player.clubShort} (H)</div>
      </div>
    </div>
  )
}

// --- Pitch View ---
function PitchView({ onPlayerClick, large = false }: {
  onPlayerClick: (p: Player) => void
  large?: boolean
}) {
  const { GKP, DEF, MID, FWD, BENCH } = SQUAD_BY_POSITION
  const cardSize = large ? 'lg' : 'md'
  const gap = large ? 'gap-4' : 'gap-2'

  return (
    <div className="relative rounded-2xl overflow-hidden scanlines h-full" style={{ minHeight: 480 }}>
      <div className="pitch-bg absolute inset-0" />

      {/* Pitch markings */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-[45%] -translate-x-1/2 -translate-y-1/2
          w-28 h-28 rounded-full border border-white/20" />
        <div className="absolute left-6 right-6 top-[45%] -translate-y-1/2 h-px bg-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 top-2 w-40 h-16 border border-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-16 w-40 h-20 border border-white/20" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 w-16 h-4 border-b border-x border-white/30" />
        <div className="absolute left-1/2 -translate-x-1/2 bottom-12 w-16 h-4 border-t border-x border-white/30" />
      </div>

      {/* Players on pitch */}
      <div className="relative z-10 flex flex-col py-4 px-2 h-full">
        <div className={`flex justify-center ${gap} py-2`}>
          {GKP.map(p => <PitchCard key={p.id} player={p} onClick={() => onPlayerClick(p)} size={cardSize} />)}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {DEF.map(p => <PitchCard key={p.id} player={p} onClick={() => onPlayerClick(p)} size={cardSize} />)}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {MID.map(p => <PitchCard key={p.id} player={p} onClick={() => onPlayerClick(p)} size={cardSize} />)}
        </div>
        <div className={`flex justify-center ${gap} py-2 flex-wrap`}>
          {FWD.map(p => <PitchCard key={p.id} player={p} onClick={() => onPlayerClick(p)} size={cardSize} />)}
        </div>
        <div className="flex-1" />

        {/* Bench */}
        <div className="relative z-10 mx-2 mb-2">
          <div className="bg-black/40 border border-white/10 rounded-2xl p-3">
            <div className="text-center font-bangers tracking-widest text-slate-400 text-xs mb-2">
              🪑 BENCH
            </div>
            <div className="flex justify-around">
              {BENCH.map((p, i) => (
                <div key={p.id} className="flex flex-col items-center gap-1">
                  <div className="text-xs font-bangers text-slate-500 bg-black/40 rounded-full w-5 h-5
                    flex items-center justify-center">
                    {i + 1}
                  </div>
                  <PitchCard player={p} onClick={() => onPlayerClick(p)} size={cardSize} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- List View ---
function ListRow({ player }: { player: Player }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-game-border/50
      hover:bg-white/[0.03] transition-colors">
      <JerseyIcon clubShort={player.clubShort} position={player.position} size="sm" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm text-slate-100">{player.name}</span>
          {player.isCapitain && (
            <span className="bg-game-gold/20 text-game-gold border border-game-gold/40
              text-xs font-bangers px-1.5 py-0.5 rounded-md">C</span>
          )}
          {player.isBench && (
            <span className="bg-slate-700/50 text-slate-500 border border-slate-600/30
              text-xs font-bangers px-1.5 py-0.5 rounded-md">BENCH</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-xs text-slate-500">{player.club}</span>
          <PosBadge pos={player.position} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 text-right flex-shrink-0">
        <div>
          <div className="text-xs text-slate-500">Price</div>
          <div className="text-sm font-bold text-game-gold">£{player.price.toFixed(1)}m</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Form</div>
          <div className="text-sm font-bold text-game-sky">{player.form.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-500">Pts</div>
          <div className="text-sm font-bold text-game-neon">{player.totalPoints}</div>
        </div>
      </div>

      <button className="ml-2 w-8 h-8 rounded-full bg-game-red/20 border border-game-red/40
        text-game-red flex items-center justify-center text-sm font-bold
        hover:bg-game-red/40 transition-colors flex-shrink-0">
        ✕
      </button>
    </div>
  )
}

function ListView() {
  const { GKP, DEF, MID, FWD, BENCH } = SQUAD_BY_POSITION
  const sections = [
    { label: '🧤 Goalkeepers', players: GKP },
    { label: '🛡️ Defenders',   players: DEF },
    { label: '⚡ Midfielders',  players: MID },
    { label: '🔥 Forwards',     players: FWD },
    { label: '🪑 Bench',        players: BENCH },
  ]

  return (
    <div className="flex flex-col gap-4 anim-slide-up">
      {sections.map(({ label, players }) => (
        <div key={label} className="game-card overflow-hidden">
          <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border flex items-center justify-between">
            <span className="font-bangers tracking-widest text-lg text-slate-200">{label}</span>
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <span className="w-12 text-right">Price</span>
              <span className="w-8 text-right">Form</span>
              <span className="w-6 text-right">Pts</span>
              <div className="w-8" />
            </div>
          </div>
          {players.map(p => <ListRow key={p.id} player={p} />)}
        </div>
      ))}
    </div>
  )
}

// --- Player Info Modal ---
function PlayerModal({ player, onClose }: { player: Player; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative game-card w-full max-w-sm p-5 anim-pop lg:max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose}
          className="absolute top-4 right-4 text-slate-500 hover:text-game-red text-xl font-bold transition-colors">
          ✕
        </button>

        <div className="flex items-center gap-4 mb-5">
          <div className="anim-float">
            <JerseyIcon clubShort={player.clubShort} position={player.position} size="lg" />
          </div>
          <div>
            <div className="font-bangers text-2xl tracking-wider text-white">{player.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-slate-400 text-sm">{player.club}</span>
              <PosBadge pos={player.position} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label: 'Price', value: `£${player.price.toFixed(1)}m`, color: 'text-game-gold' },
            { label: 'Form',  value: player.form.toFixed(1),          color: 'text-game-sky' },
            { label: 'Pts',   value: player.totalPoints,               color: 'text-game-neon' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white/5 rounded-xl p-3 text-center border border-white/5">
              <div className={`font-bangers text-2xl ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <button className="btn-secondary flex-1 py-2.5">🔄 TRANSFER</button>
          <button className="btn-primary flex-1 py-2.5">👑 CAPTAIN</button>
        </div>
      </div>
    </div>
  )
}

// --- CTA Buttons (shared between mobile fixed and desktop inline) ---
function CtaButtons() {
  return (
    <div className="flex gap-3">
      <button className="btn-secondary flex-1 py-3 text-lg">🔄 TRANSFERS</button>
      <button className="btn-primary flex-1 py-3 text-lg shadow-neon anim-pulse-neon">✅ CONFIRM</button>
    </div>
  )
}

// --- Main Squad Selection ---
export function SquadSelection() {
  const [view, setView] = useState<'pitch' | 'list'>('pitch')
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [showToast, setShowToast] = useState(false)

  const selectedCount = MOCK_PLAYERS.filter(p => p.selected).length
  const bank = 8.1

  return (
    <div className="flex flex-col h-full">

      {/* ── Header (full width, always) ─────────────────────────── */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none">
              MY SQUAD
            </h1>
            <p className="text-slate-400 text-sm mt-0.5">
              GW30 · <span className="text-game-fire font-bold">Deadline: Sat 14 Mar, 20:30</span>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Stats pills */}
            <div className="hidden sm:flex items-center gap-2">
              <div className="game-card px-3 py-1.5 text-center">
                <div className="font-bangers text-xl text-game-neon leading-none">{selectedCount}/15</div>
                <div className="text-xs text-slate-500">players</div>
              </div>
              <div className="game-card px-3 py-1.5 text-center">
                <div className="font-bangers text-xl text-game-gold leading-none">£{bank}m</div>
                <div className="text-xs text-slate-500">bank</div>
              </div>
            </div>

            {/* View toggle — mobile only (desktop shows both panels) */}
            <div className="lg:hidden game-card flex overflow-hidden p-1 gap-1">
              {(['pitch', 'list'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`font-bangers tracking-wider text-sm px-3 py-1.5 rounded-xl transition-all
                    ${view === v ? 'tab-active' : 'tab-inactive'}`}
                >
                  {v === 'pitch' ? '⚽' : '📋'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Toast notification */}
        {!showToast && (
          <div
            className="mt-2 rounded-xl px-4 py-2 font-bold text-sm
              border border-game-purple/50 bg-game-purple/10 text-slate-200
              cursor-pointer hover:border-game-purple transition-colors"
            onClick={() => setShowToast(true)}
          >
            <span className="text-game-purple font-bangers tracking-wider">Ekitiké</span> has been added to your squad 🎉
          </div>
        )}
      </div>

      {/* ── Content area ─────────────────────────────────────────── */}

      {/* DESKTOP: two-panel side by side */}
      <div className="hidden lg:grid lg:grid-cols-[1fr_400px] lg:flex-1 lg:overflow-hidden" style={{ flex: 1 }}>
        {/* Left: Pitch */}
        <div className="overflow-y-auto p-4 border-r border-game-border/50">
          <PitchView onPlayerClick={setSelectedPlayer} large />
        </div>

        {/* Right: List + CTAs */}
        <div className="flex flex-col overflow-hidden">
          {/* Column headers */}
          <div className="flex-shrink-0 px-4 py-2.5 bg-white/[0.02] border-b border-game-border
            flex items-center justify-between">
            <span className="font-bangers tracking-widest text-slate-400 text-sm">SQUAD LIST</span>
            <div className="flex gap-4 text-xs text-slate-500 font-medium">
              <span className="w-12 text-right">Price</span>
              <span className="w-8 text-right">Form</span>
              <span className="w-6 text-right">Pts</span>
              <div className="w-8" />
            </div>
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <ListView />
          </div>

          {/* Inline CTA — desktop only */}
          <div className="flex-shrink-0 p-4 border-t border-game-border">
            <CtaButtons />
          </div>
        </div>
      </div>

      {/* MOBILE: single panel with toggle */}
      <div className="lg:hidden flex-1 overflow-y-auto px-4 pb-24 pt-3">
        {view === 'pitch' ? (
          <PitchView onPlayerClick={setSelectedPlayer} />
        ) : (
          <ListView />
        )}
      </div>

      {/* Mobile fixed CTA */}
      <div className="lg:hidden fixed bottom-16 left-0 right-0 px-4 py-2 pointer-events-none
        bg-gradient-to-t from-game-bg/95 to-transparent">
        <div className="pointer-events-auto">
          <CtaButtons />
        </div>
      </div>

      {/* Player modal */}
      {selectedPlayer && (
        <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />
      )}
    </div>
  )
}
