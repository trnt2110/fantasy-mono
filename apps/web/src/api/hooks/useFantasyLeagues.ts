import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiListResponse, ApiFantasyLeague, ApiLeagueStanding } from '../types'

export function useMyLeagues() {
  const { accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['fantasy-leagues', 'mine'],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiFantasyLeague>>('/fantasy-leagues/mine')
      return res.data.data
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  })
}

export function useLeagueStandings(leagueId: number | null) {
  return useQuery({
    queryKey: ['league-standings', leagueId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiLeagueStanding>>(
        `/fantasy-leagues/${leagueId}/standings`
      )
      return res.data.data
    },
    enabled: leagueId !== null,
    staleTime: 5 * 60 * 1000,
  })
}

export function useJoinLeague() {
  const qc = useQueryClient()
  const { fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (code: string) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyLeague>>('/fantasy-leagues/join', {
        code,
        fantasyTeamId,
      })
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fantasy-leagues', 'mine'] }),
  })
}

export function useCreateLeague() {
  const qc = useQueryClient()
  const { competitionId, fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyLeague>>('/fantasy-leagues', {
        name,
        competitionId,
        fantasyTeamId,
      })
      return res.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fantasy-leagues', 'mine'] }),
  })
}
