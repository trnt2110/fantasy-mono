interface NavItem {
  id: string
  icon: string
  label: string
}

const ITEMS: NavItem[] = [
  { id: 'squad',    icon: '⚽', label: 'Squad' },
  { id: 'players',  icon: '🔍', label: 'Players' },
  { id: 'fixtures', icon: '📅', label: 'Fixtures' },
  { id: 'leagues',  icon: '🏆', label: 'Leagues' },
]

export function BottomNav({ active, onChange }: {
  active: string
  onChange: (id: string) => void
}) {
  return (
    /* Hidden on desktop — sidebar handles navigation there */
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40">
      <div className="absolute inset-0 bg-game-bg/90 backdrop-blur-md border-t border-game-border" />
      <div className="relative flex">
        {ITEMS.map(item => {
          const isActive = item.id === active
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-all duration-200
                ${isActive ? 'text-game-neon' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {isActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-0.5
                  bg-game-neon rounded-full shadow-neon" />
              )}
              <span
                className={`text-xl transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}
                style={isActive ? { filter: 'drop-shadow(0 0 6px rgba(0,255,135,0.6))' } : {}}
              >
                {item.icon}
              </span>
              <span className="text-xs font-bangers tracking-wider">{item.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
