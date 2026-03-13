import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiClub } from '../types'

export function useClubs() {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['clubs', competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiClub>>('/clubs', { params: { competitionId } })
      return res.data.data
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useClubsMap() {
  const { data: clubs } = useClubs()
  return new Map(clubs?.map(c => [c.id, c.shortName]) ?? [])
}
