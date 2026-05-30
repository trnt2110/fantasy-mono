import { useState } from 'react'
import { useAdminCompetitions, useUpdateCompetitionAlias } from '../../api/hooks/useAdminAliases'
import { EditableCell } from './EditableCell'

type Filter = 'all' | 'unaliased' | 'aliased'

export function AdminCompetitions() {
  const [filter, setFilter] = useState<Filter>('all')
  const [toast, setToast] = useState<string | null>(null)
  const { data, isLoading } = useAdminCompetitions(filter)
  const updateAlias = useUpdateCompetitionAlias()

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value as Filter)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
        >
          <option value="all">All competitions</option>
          <option value="unaliased">Unnamed only</option>
          <option value="aliased">Aliased only</option>
        </select>
        <p className="text-slate-500 text-xs ml-auto">{data?.length ?? 0} competitions</p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/5 text-slate-400 text-left">
              <th className="px-3 py-2 w-16">ID</th>
              <th className="px-3 py-2">Real Name</th>
              <th className="px-3 py-2">Country</th>
              <th className="px-3 py-2">Alias Name</th>
              <th className="px-3 py-2 w-24">Short</th>
              <th className="px-3 py-2 w-24">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading && (
              <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Loading...</td></tr>
            )}
            {data?.map(comp => (
              <tr key={comp.id} className="hover:bg-white/[0.02]">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{comp.id}</td>
                <td className="px-3 py-2 text-slate-400">{comp.realName}</td>
                <td className="px-3 py-2 text-slate-500 text-xs">{comp.country}</td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={comp.isAliased ? comp.name : ''}
                    onSave={v => updateAlias.mutate({ id: comp.id, name: v, shortName: comp.shortName })}
                    placeholder="Click to add alias"
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={comp.shortName ?? ''}
                    onSave={v => {
                      if (!comp.isAliased) { showToast('Set an alias name first'); return }
                      updateAlias.mutate({ id: comp.id, name: comp.name, shortName: v })
                    }}
                    placeholder="—"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${comp.isAliased ? 'bg-game-neon/10 text-game-neon' : 'bg-game-fire/10 text-game-fire'}`}>
                    {comp.isAliased ? 'Aliased' : 'Unnamed'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 bg-game-card border border-white/10 rounded-xl px-4 py-3 text-sm text-white shadow-lg z-50 max-w-sm">
          {toast}
        </div>
      )}
    </div>
  )
}
