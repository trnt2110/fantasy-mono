import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type {
  AdminClub, AdminPlayer, AdminCompetition,
  AdminListResponse, ImportResult,
} from '../types'

type AliasFilter = 'all' | 'unaliased' | 'aliased'

export function useAdminClubs(page: number, search: string, filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'clubs', page, search, filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminListResponse<AdminClub> }>(
        '/admin/aliases/clubs',
        { params: { page, limit: 50, search, filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdateClubAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, shortName, city }: { id: number; name: string; shortName?: string; city?: string }) =>
      apiClient.put(`/admin/aliases/clubs/${id}`, { name, shortName, city }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'clubs'] }),
  })
}

export function useAdminPlayers(page: number, search: string, filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'players', page, search, filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminListResponse<AdminPlayer> }>(
        '/admin/aliases/players',
        { params: { page, limit: 50, search, filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdatePlayerAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      apiClient.put(`/admin/aliases/players/${id}`, { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'players'] }),
  })
}

export function useAdminCompetitions(filter: AliasFilter = 'all') {
  return useQuery({
    queryKey: ['admin', 'competitions', filter],
    queryFn: async () => {
      const r = await apiClient.get<{ data: AdminCompetition[] }>(
        '/admin/aliases/competitions',
        { params: { filter } },
      )
      return r.data.data
    },
  })
}

export function useUpdateCompetitionAlias() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, shortName }: { id: number; name: string; shortName?: string }) =>
      apiClient.put(`/admin/aliases/competitions/${id}`, { name, shortName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'competitions'] }),
  })
}

export function useImportAliases() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const r = await apiClient.post<{ data: ImportResult }>(
        '/admin/import/aliases',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return r.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'clubs'] })
      qc.invalidateQueries({ queryKey: ['admin', 'players'] })
      qc.invalidateQueries({ queryKey: ['admin', 'competitions'] })
    },
  })
}
