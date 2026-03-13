import { useQuery } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiListResponse, ApiPlayer, ApiPlayerDetail, ApiResponse } from '../types'

export interface PlayerFilters {
  position?: string
  search?: string
  minPrice?: number
  maxPrice?: number
  page?: number
  limit?: number
}

export function usePlayers(filters: PlayerFilters = {}) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['players', competitionId, filters],
    queryFn: async () => {
      const res = await apiClient.get<ApiListResponse<ApiPlayer>>('/players', {
        params: { competitionId, ...filters },
      })
      return res.data
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev,
  })
}

export function usePlayerDetail(playerId: number | null) {
  const competitionId = useAuthStore(s => s.competitionId)
  return useQuery({
    queryKey: ['player', playerId, competitionId],
    queryFn: async () => {
      const res = await apiClient.get<ApiResponse<ApiPlayerDetail>>(`/players/${playerId}`, {
        params: { competitionId },
      })
      return res.data.data
    },
    enabled: playerId !== null,
    staleTime: 10 * 60 * 1000,
  })
}

