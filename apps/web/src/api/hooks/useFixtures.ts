import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import type { ApiListResponse, ApiFixture } from '../types'

export function useFixtures(gameweekId: number | undefined) {
  return useQuery({
    queryKey: ['fixtures', gameweekId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiFixture>>('/fixtures', {
        params: { gameweekId },
      })
      return res.data.data
    },
    enabled: !!gameweekId,
    staleTime: 30 * 60 * 1000,
  })
}
