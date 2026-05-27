import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type { ApiResponse, ApiFantasyTeam } from '../types'

interface CreateTeamDto {
  competitionId: number
  name: string
  playerIds: number[]
  formation: string
  startingIds: number[]
  captainId: number
  viceCaptainId: number
  benchOrder: Record<string, number>
}

export function useCreateTeam() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (dto: CreateTeamDto) => {
      const res = await apiClient.post<ApiResponse<ApiFantasyTeam>>('/fantasy-teams', dto)
      return res.data.data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fantasy-team'] })
    },
  })
}
