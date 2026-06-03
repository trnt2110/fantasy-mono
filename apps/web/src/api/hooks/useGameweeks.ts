import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiGameweekSummary } from '../types'

export function useGameweeks() {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['gameweeks', 'all', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiGameweekSummary[]>>('/gameweeks', {
        params: { competitionId },
      })
      return res.data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useFinishedGameweeks() {
  const { data: gameweeks = [], ...rest } = useGameweeks()
  return { data: gameweeks.filter(gw => gw.status === 'FINISHED'), ...rest }
}
