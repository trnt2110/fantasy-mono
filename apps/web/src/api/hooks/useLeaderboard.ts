import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiLeaderboardEntry } from '../types'

export function useGlobalLeaderboard(gameweekId?: number, page = 1) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['leaderboard', 'global', competitionId, gameweekId, page],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiLeaderboardEntry>>('/leaderboard/global', {
        params: { competitionId, gameweekId, page, limit: 20 },
      })
      return res.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}
