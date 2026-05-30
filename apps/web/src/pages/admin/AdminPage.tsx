import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth.store'
import { useLogout } from '../../api/hooks'
import { AdminClubs } from './AdminClubs'
import { AdminPlayers } from './AdminPlayers'
import { AdminCompetitions } from './AdminCompetitions'

type Tab = 'clubs' | 'players' | 'competitions'

const TABS: { id: Tab; label: string }[] = [
  { id: 'clubs', label: 'Clubs' },
  { id: 'players', label: 'Players' },
  { id: 'competitions', label: 'Competitions' },
]

export function AdminPage() {
  const [tab, setTab] = useState<Tab>('clubs')
  const user = useAuthStore(s => s.user)
  const { mutate: logout } = useLogout()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-game-bg text-white flex flex-col">
      <header className="bg-game-card border-b border-white/10 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="font-bangers text-xl tracking-widest">
          FANTASY<span className="text-game-neon">FOOTY</span>
          <span className="text-slate-500 text-sm ml-3 font-nunito font-normal tracking-normal">Admin</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-slate-400 text-sm">{user?.email}</span>
          <button onClick={handleLogout} className="text-slate-400 hover:text-white text-sm transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="bg-game-card border-b border-white/10 px-6 flex gap-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.id
                ? 'border-game-neon text-game-neon'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {tab === 'clubs'        && <AdminClubs />}
        {tab === 'players'      && <AdminPlayers />}
        {tab === 'competitions' && <AdminCompetitions />}
      </div>
    </div>
  )
}
