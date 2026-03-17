import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerAuthCallbacks } from '../api/client'
import type { AuthUser } from '../api/types'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: AuthUser | null
  fantasyTeamId: string | null
  competitionId: number
  budget: number
  setAuth: (tokens: { accessToken: string; refreshToken: string }, user: AuthUser) => void
  setFantasyTeam: (fantasyTeamId: string, budget: number) => void
  refreshTokens: (accessToken: string, refreshToken: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      fantasyTeamId: null,
      competitionId: 39, // Premier League — default for MVP
      budget: 0,
      setAuth: (tokens, user) => set({ ...tokens, user }),
      setFantasyTeam: (fantasyTeamId, budget) => set({ fantasyTeamId, budget }),
      refreshTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
      clearAuth: () => set({ accessToken: null, refreshToken: null, user: null, fantasyTeamId: null, budget: 0 }),
    }),
    { name: 'fantasy-auth' }
  )
)

// Register callbacks so the API client can read/write tokens without circular imports
registerAuthCallbacks({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onTokensRefreshed: (accessToken, refreshToken) =>
    useAuthStore.getState().refreshTokens(accessToken, refreshToken),
  onLogout: () => {
    useAuthStore.getState().clearAuth()
    window.location.href = '/login'
  },
})
