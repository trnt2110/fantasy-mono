const NAV_ITEMS = [
  { id: 'squad',    icon: '⚽', label: 'My Squad',   sub: 'Team & transfers' },
  { id: 'players',  icon: '🔍', label: 'Players',    sub: 'Browse & pick' },
  { id: 'fixtures', icon: '📅', label: 'Fixtures',   sub: 'GW30 schedule' },
  { id: 'leagues',  icon: '🏆', label: 'Leagues',    sub: 'Standings' },
]

export function Sidebar({ active, onChange }: {
  active: string
  onChange: (id: string) => void
}) {
  return (
    <aside className="hidden lg:flex flex-col w-64 h-screen fixed left-0 top-0 z-40
      bg-game-card border-r border-game-border overflow-hidden">

      {/* Logo */}
      <div className="px-5 py-5 border-b border-game-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="text-3xl" style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,135,0.6))' }}>⚽</span>
          <div>
            <div className="font-bangers text-2xl tracking-widest leading-none text-white">
              FANTASY<span className="text-game-neon">FOOTY</span>
            </div>
            <div className="text-xs text-slate-500 font-medium tracking-wider">TOP 5 LEAGUES</div>
          </div>
        </div>

        {/* GW info pill */}
        <div className="mt-3 flex items-center gap-2 bg-game-fire/10 border border-game-fire/30
          rounded-xl px-3 py-2">
          <span className="text-game-fire text-sm">⏰</span>
          <div>
            <div className="text-game-fire font-bold text-xs leading-none">GW30 DEADLINE</div>
            <div className="text-slate-400 text-xs mt-0.5">Sat 14 Mar, 20:30</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left
                relative group ${isActive
                  ? 'bg-game-neon/10 text-game-neon'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                }`}
            >
              {/* Active left border */}
              {isActive && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-game-neon rounded-full
                  shadow-[0_0_8px_rgba(0,255,135,0.8)]" />
              )}

              <span className={`text-xl flex-shrink-0 transition-transform duration-200
                ${isActive ? 'scale-110' : 'group-hover:scale-105'}`}
                style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(0,255,135,0.5))' } : {}}
              >
                {item.icon}
              </span>
              <div className="min-w-0">
                <div className={`font-bangers tracking-wider text-base leading-none
                  ${isActive ? 'text-game-neon' : ''}`}>
                  {item.label}
                </div>
                <div className="text-xs text-slate-600 mt-0.5 font-medium">{item.sub}</div>
              </div>

              {isActive && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-game-neon flex-shrink-0
                  shadow-[0_0_6px_rgba(0,255,135,0.8)]" />
              )}
            </button>
          )
        })}
      </nav>

      {/* Bottom: user card + bank */}
      <div className="px-4 py-4 border-t border-game-border flex-shrink-0 space-y-2.5">
        {/* Bank balance */}
        <div className="game-card px-3 py-2.5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-game-gold/15 border border-game-gold/30
            flex items-center justify-center text-base flex-shrink-0">
            💰
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium leading-none">Bank</div>
            <div className="font-bangers text-lg text-game-gold leading-tight">£8.1m</div>
          </div>
          <div className="ml-auto text-right">
            <div className="text-xs text-slate-500 font-medium leading-none">Squad</div>
            <div className="font-bangers text-lg text-game-neon leading-tight">15/15</div>
          </div>
        </div>

        {/* User */}
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
          hover:bg-white/[0.04] transition-colors group">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-game-purple to-game-sky
            flex items-center justify-center text-sm flex-shrink-0">
            🇻🇳
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-bold text-slate-200 truncate">Dragon Warriors</div>
            <div className="text-xs text-slate-500 truncate">Trung Nguyen Thanh</div>
          </div>
          <span className="text-slate-600 group-hover:text-slate-400 transition-colors text-xs">⚙️</span>
        </button>
      </div>
    </aside>
  )
}
