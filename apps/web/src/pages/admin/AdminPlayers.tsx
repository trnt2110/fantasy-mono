import { useState, useRef } from 'react'
import { useAdminPlayers, useUpdatePlayerAlias, useImportAliases } from '../../api/hooks/useAdminAliases'
import { EditableCell } from './EditableCell'
import type { ImportResult } from '../../api/types'

type Filter = 'all' | 'unaliased' | 'aliased'

export function AdminPlayers() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [toast, setToast] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const { data, isLoading } = useAdminPlayers(page, search, filter)
  const updateAlias = useUpdatePlayerAlias()
  const importAliases = useImportAliases()

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('players', file)
    importAliases.mutate(fd, {
      onSuccess: (result: ImportResult) => {
        const s = result.players
        showToast(s
          ? `Players: ${s.processed} aliased, ${s.skipped} skipped${s.errors.length ? `, ${s.errors.length} errors` : ''}`
          : 'No players file processed'
        )
      },
      onError: () => showToast('Import failed — check console'),
    })
    e.target.value = ''
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search real name or alias..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white
            placeholder:text-slate-500 outline-none focus:border-game-neon/50 w-64"
        />
        <select
          value={filter}
          onChange={e => { setFilter(e.target.value as Filter); setPage(1) }}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All players</option>
          <option value="unaliased">Unnamed only</option>
          <option value="aliased">Aliased only</option>
        </select>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={importAliases.isPending}
          className="ml-auto px-4 py-2 bg-game-neon/10 border border-game-neon/30 text-game-neon
            rounded-lg text-sm hover:bg-game-neon/20 transition-colors disabled:opacity-50"
        >
          {importAliases.isPending ? 'Importing...' : 'Import players CSV'}
        </button>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
      </div>

      {data && (
        <p className="text-slate-500 text-xs">{data.total} players · page {data.page} of {totalPages}</p>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-left">
              <th className="px-3 py-2 w-16">ID</th>
              <th className="px-3 py-2">Real Name</th>
              <th className="px-3 py-2 w-12">Pos</th>
              <th className="px-3 py-2">Club</th>
              <th className="px-3 py-2">Alias Name</th>
              <th className="px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {data?.items.map(player => (
              <tr key={player.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{player.id}</td>
                <td className="px-3 py-2 text-slate-400">{player.realName}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{player.position}</td>
                <td className="px-3 py-2 text-slate-500 text-xs truncate max-w-[140px]">{player.clubRealName}</td>
                <td className="px-3 py-2">
                  <EditableCell value={player.isAliased ? player.name : ''} onSave={v => updateAlias.mutate({ id: player.id, name: v })} placeholder="Click to add alias" />
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${player.isAliased ? 'bg-game-neon/10 text-game-neon' : 'bg-game-fire/10 text-game-fire'}`}>
                    {player.isAliased ? 'Aliased' : 'Unnamed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex gap-2 items-center justify-end">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30">← Prev</button>
          <span className="text-slate-500 text-sm">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-30">Next →</button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-game-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white shadow-lg z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
