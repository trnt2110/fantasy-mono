import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiFantasyTeam, ApiListResponse, ApiPick } from '../types'

export function useMyFantasyTeam() {
  const { competitionId, accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['fantasy-team', 'mine', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiFantasyTeam>>('/fantasy-teams/mine', {
        params: { competitionId },
      })
      const team = res.data.data
      useAuthStore.getState().setFantasyTeam(team.id, team.budget)
      return team
    },
    enabled: !!accessToken,
    staleTime: 5 * 60 * 1000,
  })
}

export function useGwPicks(gameweekId: number | undefined) {
  const { fantasyTeamId, accessToken } = useAuthStore()
  return useQuery({
    queryKey: ['picks', gameweekId, fantasyTeamId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPick>>(`/picks/${gameweekId}`, {
        params: { fantasyTeamId },
      })
      return res.data.data
    },
    enabled: !!gameweekId && !!fantasyTeamId && !!accessToken,
    staleTime: 60 * 1000,
  })
}

export function useSubmitPicks(gameweekId: number | undefined) {
  const qc = useQueryClient()
  const { fantasyTeamId } = useAuthStore()
  return useMutation({
    mutationFn: async (body: {
      startingPlayerIds: number[]
      captainId: number
      viceCaptainId: number
      benchOrder: Record<string, number>
    }) => {
      await apiClient.put(`/picks/${gameweekId}`, { fantasyTeamId, ...body })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['picks', gameweekId] }),
  })
}
