const LEADERBOARD = [
  { rank: 1, name: 'Dragon Warriors', manager: 'Trung NT', pts: 1842, gw: 87,  prev: 1, badge: '🐉', streak: 3 },
  { rank: 2, name: 'Gunbound FC',     manager: 'Minh PH',  pts: 1798, gw: 72,  prev: 3, badge: '🔫', streak: 1 },
  { rank: 3, name: 'Liverpool Fans',  manager: 'Hai NT',   pts: 1765, gw: 91,  prev: 2, badge: '🦅', streak: 2 },
  { rank: 4, name: 'Fantasy Kings',   manager: 'Nam TQ',   pts: 1723, gw: 65,  prev: 4, badge: '👑', streak: 0 },
  { rank: 5, name: 'Random XI',       manager: 'Duc LH',   pts: 1701, gw: 58,  prev: 6, badge: '⚡', streak: 1 },
  { rank: 6, name: 'Tactical Noobs',  manager: 'Khoa BV',  pts: 1689, gw: 44,  prev: 5, badge: '🤡', streak: 0 },
  { rank: 7, name: 'Haaland United',  manager: 'Tuan NM',  pts: 1654, gw: 39,  prev: 7, badge: '🚀', streak: 0 },
]

const MAX_PTS = Math.max(...LEADERBOARD.map(e => e.pts))

function RankBadge({ rank }: { rank: number }) {
  const cls = rank === 1
    ? 'bg-game-gold/20 text-game-gold border-game-gold/40 shadow-gold'
    : rank === 2 ? 'bg-slate-400/20 text-slate-300 border-slate-400/30'
    : rank === 3 ? 'bg-amber-700/20 text-amber-600 border-amber-700/30'
    : 'bg-white/5 text-slate-500 border-white/5'
  return (
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bangers text-sm
      flex-shrink-0 border ${cls}`}>
      {rank}
    </div>
  )
}

function MovementArrow({ current, prev }: { current: number; prev: number }) {
  if (current === prev) return <span className="text-slate-600 text-xs">—</span>
  if (current < prev) return <span className="text-game-neon text-xs font-bold">▲{prev - current}</span>
  return <span className="text-game-red text-xs font-bold">▼{current - prev}</span>
}

function LeaderboardRow({ entry, isMe }: { entry: typeof LEADERBOARD[0]; isMe: boolean }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 border-b border-game-border/50
        transition-colors ${isMe ? 'bg-game-neon/5' : 'hover:bg-white/[0.02]'}`}
      style={{ animation: 'slideUp 0.4s ease-out both' }}
    >
      <RankBadge rank={entry.rank} />

      <div className="text-xl flex-shrink-0">{entry.badge}</div>

      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm truncate ${isMe ? 'text-game-neon' : 'text-slate-100'}`}>
          {entry.name}
          {isMe && <span className="ml-1.5 text-xs font-bangers text-game-neon/70">(you)</span>}
        </div>
        <div className="text-xs text-slate-500">{entry.manager}</div>
      </div>

      {/* Points bar — desktop only */}
      <div className="hidden lg:flex items-center gap-2 w-36">
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isMe ? 'bg-game-neon' : 'bg-slate-600'}`}
            style={{ width: `${(entry.pts / MAX_PTS) * 100}%` }}
          />
        </div>
      </div>

      {/* Streak — desktop only */}
      {entry.streak > 0 && (
        <div className="hidden lg:flex items-center gap-1 w-16">
          <span className="text-game-fire text-xs">🔥</span>
          <span className="text-xs font-bold text-game-fire">{entry.streak}</span>
        </div>
      )}
      {entry.streak === 0 && <div className="hidden lg:block w-16" />}

      {/* Movement */}
      <div className="w-10 text-center hidden sm:block">
        <MovementArrow current={entry.rank} prev={entry.prev} />
      </div>

      {/* GW pts */}
      <div className="text-right w-12">
        <div className={`text-sm font-bold ${isMe ? 'text-game-sky' : 'text-slate-300'}`}>
          {entry.gw}
        </div>
      </div>

      {/* Total */}
      <div className="text-right w-14">
        <div className={`text-sm font-bold ${isMe ? 'text-game-gold' : 'text-slate-400'}`}>
          {entry.pts}
        </div>
      </div>
    </div>
  )
}

export function Leagues() {
  const myEntry = LEADERBOARD[0]

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-game-border/50">
        <h1 className="font-bangers text-3xl lg:text-4xl tracking-widest text-white leading-none mb-0.5">
          LEAGUES
        </h1>
        <p className="text-slate-400 text-sm">Your mini-league standings</p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-5 pb-6 lg:pb-8 pt-4">

        {/* Desktop: stats summary row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            { icon: '🏆', label: 'League Rank', value: '#1', color: 'text-game-gold' },
            { icon: '⚡', label: 'GW30 Points', value: '87',  color: 'text-game-sky' },
            { icon: '📊', label: 'Total Points', value: '1842', color: 'text-game-neon' },
            { icon: '🔥', label: 'Win Streak',  value: '3 GW', color: 'text-game-fire' },
          ].map(({ icon, label, value, color }) => (
            <div key={label} className="game-card px-4 py-3.5 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">{icon}</span>
              <div>
                <div className="text-xs text-slate-500 font-medium leading-none">{label}</div>
                <div className={`font-bangers text-2xl ${color} leading-tight`}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop two-column: leaderboard + join/my stats */}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-5">

          {/* Leaderboard */}
          <div className="game-card overflow-hidden mb-5 lg:mb-0">
            {/* Table header */}
            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border">
              <div className="flex items-center gap-3">
                <div className="w-8 flex-shrink-0" />
                <div className="text-xl flex-shrink-0 opacity-0">·</div>
                <span className="flex-1 font-bangers tracking-widest text-lg text-slate-200">
                  🏆 Standings
                </span>
                <div className="hidden lg:block w-36" />
                <div className="hidden lg:block w-16" />
                <div className="hidden sm:block w-10 text-center text-xs text-slate-500 font-medium">±</div>
                <div className="w-12 text-right text-xs text-slate-500 font-medium">GW</div>
                <div className="w-14 text-right text-xs text-slate-500 font-medium">Total</div>
              </div>
            </div>

            {LEADERBOARD.map(entry => (
              <LeaderboardRow key={entry.rank} entry={entry} isMe={entry.rank === 1} />
            ))}
          </div>

          {/* Right panel: my stats + join league */}
          <div className="flex flex-col gap-4">
            {/* My team card */}
            <div className="game-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-game-purple to-game-sky
                  flex items-center justify-center text-lg flex-shrink-0">
                  🇻🇳
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-100">Dragon Warriors</div>
                  <div className="text-xs text-slate-500">Trung Nguyen Thanh</div>
                </div>
              </div>

              {/* GW progress bar */}
              <div className="flex items-center gap-3">
                <div className="text-center flex-shrink-0">
                  <div className="font-bangers text-xl text-game-neon leading-none">{myEntry.gw}</div>
                  <div className="text-xs text-slate-500">GW30</div>
                </div>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-game-neon to-game-sky rounded-full"
                    style={{ width: '62%' }} />
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="font-bangers text-xl text-game-gold leading-none">{myEntry.pts}</div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-game-border flex justify-between text-xs text-slate-500">
                <span>Overall rank <span className="text-slate-300 font-bold">#24,831</span></span>
                <span>Top <span className="text-game-neon font-bold">8%</span></span>
              </div>
            </div>

            {/* Join league card */}
            <div className="game-card p-4 border-2 border-dashed border-game-border">
              <div className="text-2xl mb-2 text-center">🔗</div>
              <div className="font-bangers text-lg tracking-wider text-slate-300 mb-3 text-center">
                JOIN A LEAGUE
              </div>
              <input
                type="text"
                placeholder="Enter league code..."
                className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                  text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                  focus:border-game-neon transition-all mb-3 text-center font-nunito"
              />
              <button className="btn-primary w-full py-2.5">⚡ JOIN NOW</button>
            </div>

            {/* Create league */}
            <button className="btn-secondary w-full py-2.5">
              ✨ CREATE LEAGUE
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
