import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../client'
import type {
  SimulationStatus,
  CreateBotsResult,
  OpenGwResult,
  BotPicksResult,
  FinalizeGwResult,
} from '../types'

const STATUS_KEY = ['admin', 'simulation', 'status']

export function useSimulationStatus() {
  return useQuery({
    queryKey: STATUS_KEY,
    queryFn: async () => {
      const r = await apiClient.get<{ data: SimulationStatus }>('/admin/simulate/status')
      return r.data.data
    },
  })
}

export function useCreateBots() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body: { count: number; competitionId: number }) => {
      const r = await apiClient.post<{ data: CreateBotsResult }>('/admin/simulate/bots', body)
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useOpenGameweek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ gwId, minutesFromNow = 60 }: { gwId: number; minutesFromNow?: number }) => {
      const r = await apiClient.post<{ data: OpenGwResult }>(
        `/admin/simulate/gw/${gwId}/open`,
        { minutesFromNow },
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useSubmitBotPicks() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gwId: number) => {
      const r = await apiClient.post<{ data: BotPicksResult }>(
        `/admin/simulate/gw/${gwId}/bot-picks`,
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}

export function useFinalizeGameweek() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (gwId: number) => {
      const r = await apiClient.post<{ data: FinalizeGwResult }>(
        `/admin/simulate/gw/${gwId}/finalize`,
      )
      return r.data.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: STATUS_KEY }),
  })
}
