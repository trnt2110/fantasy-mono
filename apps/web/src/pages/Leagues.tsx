import { useState } from 'react'
import { useAuthStore } from '../store/auth.store'
import {
  useMyLeagues,
  useLeagueStandings,
  useGlobalLeaderboard,
  useJoinLeague,
  useCreateLeague,
  useCurrentGameweek,
  useMyFantasyTeam,
} from '../api/hooks'
import type { ApiLeaderboardEntry } from '../api/types'

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? 'bg-game-gold/20 text-game-gold border-game-gold/40 shadow-gold'
      : rank === 2
      ? 'bg-slate-400/20 text-slate-300 border-slate-400/30'
      : rank === 3
      ? 'bg-amber-700/20 text-amber-600 border-amber-700/30'
      : 'bg-white/5 text-slate-500 border-white/5'
  return (
    <div
      className={`w-8 h-8 rounded-xl flex items-center justify-center font-bangers text-sm
        flex-shrink-0 border ${cls}`}
    >
      {rank}
    </div>
  )
}

function LeaderboardRow({
  entry,
  isMe,
  maxPts,
}: {
  entry: ApiLeaderboardEntry
  isMe: boolean
  maxPts: number
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3.5 border-b border-game-border/50
        transition-colors ${isMe ? 'bg-game-neon/5' : 'hover:bg-white/[0.02]'}`}
      style={{ animation: 'slideUp 0.4s ease-out both' }}
    >
      <RankBadge rank={entry.rank} />

      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm truncate ${isMe ? 'text-game-neon' : 'text-slate-100'}`}>
          {entry.teamName}
          {isMe && <span className="ml-1.5 text-xs font-bangers text-game-neon/70">(you)</span>}
        </div>
        <div className="text-xs text-slate-500">{entry.username}</div>
      </div>

      {/* Points bar — desktop only */}
      <div className="hidden lg:flex items-center gap-2 w-36">
        <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${isMe ? 'bg-game-neon' : 'bg-slate-600'}`}
            style={{ width: `${(entry.totalPoints / maxPts) * 100}%` }}
          />
        </div>
      </div>

      {/* Movement placeholder (no prev rank in API) */}
      <div className="w-10 text-center hidden sm:block">
        <span className="text-slate-600 text-xs">—</span>
      </div>

      {/* GW pts */}
      <div className="text-right w-12">
        <div className={`text-sm font-bold ${isMe ? 'text-game-sky' : 'text-slate-300'}`}>
          {entry.gwPoints}
        </div>
      </div>

      {/* Total */}
      <div className="text-right w-14">
        <div className={`text-sm font-bold ${isMe ? 'text-game-gold' : 'text-slate-400'}`}>
          {entry.totalPoints}
        </div>
      </div>
    </div>
  )
}

export function Leagues() {
  const { fantasyTeamId, user } = useAuthStore()
  const { data: gw } = useCurrentGameweek()
  const { data: team } = useMyFantasyTeam()
  const { data: myLeagues = [] } = useMyLeagues()

  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null)

  const { data: standings = [] } = useLeagueStandings(selectedLeagueId)
  const { data: globalEntries = [] } = useGlobalLeaderboard(gw?.id)

  const entries: ApiLeaderboardEntry[] = selectedLeagueId ? standings : globalEntries
  const maxPts = Math.max(...entries.map(e => e.totalPoints), 1)

  const myEntry = entries.find(e => e.fantasyTeamId === fantasyTeamId)

  const [joinCode, setJoinCode] = useState('')
  const [newLeagueName, setNewLeagueName] = useState('')
  const joinLeague = useJoinLeague()
  const createLeague = useCreateLeague()

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

        {/* Stats summary row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            {
              icon: '🏆',
              label: 'League Rank',
              value: myEntry ? `#${myEntry.rank}` : '—',
              color: 'text-game-gold',
            },
            {
              icon: '⚡',
              label: `GW${gw?.number ?? '—'} Points`,
              value: myEntry?.gwPoints?.toString() ?? '—',
              color: 'text-game-sky',
            },
            {
              icon: '📊',
              label: 'Total Points',
              value: myEntry?.totalPoints?.toString() ?? '—',
              color: 'text-game-neon',
            },
            {
              icon: '🔥',
              label: 'Win Streak',
              value: '—',
              color: 'text-game-fire',
            },
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

        {/* League tabs (if user has leagues) */}
        {myLeagues.length > 0 && (
          <div className="flex gap-2 mb-4 flex-wrap">
            <button
              onClick={() => setSelectedLeagueId(null)}
              className={`font-bangers tracking-wider text-sm px-3 py-1.5 rounded-lg transition-all
                ${!selectedLeagueId
                  ? 'bg-game-purple text-white'
                  : 'bg-game-card border border-game-border text-slate-400'
                }`}
            >
              Global
            </button>
            {myLeagues.map(league => (
              <button
                key={league.id}
                onClick={() => setSelectedLeagueId(league.id)}
                className={`font-bangers tracking-wider text-sm px-3 py-1.5 rounded-lg transition-all
                  ${selectedLeagueId === league.id
                    ? 'bg-game-purple text-white'
                    : 'bg-game-card border border-game-border text-slate-400'
                  }`}
              >
                {league.name}
              </button>
            ))}
          </div>
        )}

        {/* Desktop two-column: leaderboard + join/my stats */}
        <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-5">

          {/* Leaderboard */}
          <div className="game-card overflow-hidden mb-5 lg:mb-0">
            {/* Table header */}
            <div className="px-4 py-2.5 bg-white/[0.03] border-b border-game-border">
              <div className="flex items-center gap-3">
                <div className="w-8 flex-shrink-0" />
                <span className="flex-1 font-bangers tracking-widest text-lg text-slate-200">
                  🏆 Standings
                </span>
                <div className="hidden lg:block w-36" />
                <div className="hidden sm:block w-10 text-center text-xs text-slate-500 font-medium">±</div>
                <div className="w-12 text-right text-xs text-slate-500 font-medium">GW</div>
                <div className="w-14 text-right text-xs text-slate-500 font-medium">Total</div>
              </div>
            </div>

            {entries.length === 0 ? (
              <div className="px-4 py-8 text-center text-slate-500 text-sm">
                No standings available
              </div>
            ) : (
              entries.map(entry => (
                <LeaderboardRow
                  key={entry.fantasyTeamId}
                  entry={entry}
                  isMe={entry.fantasyTeamId === fantasyTeamId}
                  maxPts={maxPts}
                />
              ))
            )}
          </div>

          {/* Right panel */}
          <div className="flex flex-col gap-4">
            {/* My team card */}
            <div className="game-card p-4">
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-game-purple to-game-sky
                    flex items-center justify-center text-lg flex-shrink-0 font-bangers text-white"
                >
                  {user?.username?.slice(0, 1).toUpperCase() ?? '?'}
                </div>
                <div>
                  <div className="font-bold text-sm text-slate-100">
                    {team?.name ?? user?.username ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500">{user?.username ?? '—'}</div>
                </div>
              </div>

              {/* GW/Total progress bar */}
              <div className="flex items-center gap-3">
                <div className="text-center flex-shrink-0">
                  <div className="font-bangers text-xl text-game-neon leading-none">
                    {myEntry?.gwPoints ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500">GW{gw?.number ?? '—'}</div>
                </div>
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-game-neon to-game-sky rounded-full"
                    style={{
                      width: myEntry ? `${(myEntry.totalPoints / maxPts) * 100}%` : '0%',
                    }}
                  />
                </div>
                <div className="text-center flex-shrink-0">
                  <div className="font-bangers text-xl text-game-gold leading-none">
                    {myEntry?.totalPoints ?? '—'}
                  </div>
                  <div className="text-xs text-slate-500">Total</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-game-border flex justify-between text-xs text-slate-500">
                <span>
                  Overall rank{' '}
                  <span className="text-slate-300 font-bold">
                    {myEntry ? `#${myEntry.rank}` : '—'}
                  </span>
                </span>
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
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                  text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                  focus:border-game-neon transition-all mb-3 text-center font-nunito"
              />
              {joinLeague.isError && (
                <div className="text-game-red text-xs text-center mb-2">
                  Invalid code or already joined
                </div>
              )}
              <button
                onClick={() => {
                  if (joinCode) {
                    joinLeague.mutate(joinCode, { onSuccess: () => setJoinCode('') })
                  }
                }}
                disabled={!joinCode || joinLeague.isPending}
                className="btn-primary w-full py-2.5 disabled:opacity-50"
              >
                {joinLeague.isPending ? 'Joining...' : '⚡ JOIN NOW'}
              </button>
            </div>

            {/* Create league */}
            <div className="game-card p-4">
              <div className="font-bangers text-lg tracking-wider text-slate-300 mb-3 text-center">
                CREATE LEAGUE
              </div>
              <input
                type="text"
                placeholder="League name..."
                value={newLeagueName}
                onChange={e => setNewLeagueName(e.target.value)}
                className="w-full bg-white/5 border border-game-border rounded-xl px-4 py-2.5
                  text-sm text-slate-100 placeholder-slate-600 focus:outline-none
                  focus:border-game-neon transition-all mb-3 font-nunito"
              />
              <button
                onClick={() => {
                  if (newLeagueName) {
                    createLeague.mutate(newLeagueName, {
                      onSuccess: () => setNewLeagueName(''),
                    })
                  }
                }}
                disabled={!newLeagueName || createLeague.isPending}
                className="btn-secondary w-full py-2.5 disabled:opacity-50"
              >
                {createLeague.isPending ? 'Creating...' : '✨ CREATE LEAGUE'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
