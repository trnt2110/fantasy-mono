import { useMutation } from '@tanstack/react-query'
import { apiClient } from '../client'
import { useAuthStore } from '../../store/auth.store'
import type { ApiResponse, AuthTokens, AuthUser } from '../types'

export function useLogin() {
  const { setAuth } = useAuthStore()
  return useMutation({
    mutationFn: async (creds: { email: string; password: string }) => {
      const tokensRes = await apiClient.post<ApiResponse<AuthTokens>>('/auth/login', creds)
      const tokens = tokensRes.data.data
      const meRes = await apiClient.get<ApiResponse<AuthUser>>('/users/me', {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      })
      return { ...tokens, user: meRes.data.data }
    },
    onSuccess: ({ accessToken, refreshToken, user }) => {
      setAuth({ accessToken, refreshToken }, user)
    },
  })
}

export function useRegister() {
  return useMutation({
    mutationFn: async (body: { email: string; username: string; password: string }) => {
      const res = await apiClient.post<ApiResponse<AuthTokens>>('/auth/register', body)
      return res.data.data
    },
  })
}

export function useLogout() {
  const { refreshToken, clearAuth } = useAuthStore()
  return useMutation({
    mutationFn: async () => {
      await apiClient.post('/auth/logout', { refreshToken })
    },
    onSettled: () => clearAuth(),
  })
}
