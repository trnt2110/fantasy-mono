import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, ApiGameweek } from '../types'

export function useCurrentGameweek() {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['gameweek', 'current', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiGameweek>>('/gameweeks/current', {
        params: { competitionId },
      })
      return res.data.data
    },
    staleTime: 2 * 60 * 1000,
  })
}
