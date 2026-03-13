import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'

let _getAccessToken: (() => string | null) = () => null
let _getRefreshToken: (() => string | null) = () => null
let _onTokensRefreshed: ((accessToken: string, refreshToken: string) => void) = () => {}
let _onLogout: (() => void) = () => {}

export function registerAuthCallbacks(callbacks: {
  getAccessToken: () => string | null
  getRefreshToken: () => string | null
  onTokensRefreshed: (accessToken: string, refreshToken: string) => void
  onLogout: () => void
}) {
  _getAccessToken = callbacks.getAccessToken
  _getRefreshToken = callbacks.getRefreshToken
  _onTokensRefreshed = callbacks.onTokensRefreshed
  _onLogout = callbacks.onLogout
}

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach Bearer token to every request
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = _getAccessToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On 401 → refresh once → retry
let isRefreshing = false
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = []

function processQueue(error: unknown, token: string | null) {
  pendingQueue.forEach(p => error ? p.reject(error) : p.resolve(token!))
  pendingQueue = []
}

apiClient.interceptors.response.use(
  res => res,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retry?: boolean }
    if (!error.config || error.response?.status !== 401 || original._retry) return Promise.reject(error)

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        pendingQueue.push({ resolve, reject })
      }).then(token => {
        if (original.headers) original.headers['Authorization'] = `Bearer ${token}`
        return apiClient(original)
      })
    }

    original._retry = true
    isRefreshing = true
    const refreshToken = _getRefreshToken()

    if (!refreshToken) {
      isRefreshing = false
      _onLogout()
      return Promise.reject(error)
    }

    try {
      const { data } = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${BASE_URL}/auth/refresh`,
        { refreshToken },
      )
      const { accessToken, refreshToken: newRefresh } = data.data
      _onTokensRefreshed(accessToken, newRefresh)
      processQueue(null, accessToken)
      if (original.headers) original.headers['Authorization'] = `Bearer ${accessToken}`
      return apiClient(original)
    } catch (refreshErr) {
      processQueue(refreshErr, null)
      _onLogout()
      return Promise.reject(refreshErr)
    } finally {
      isRefreshing = false
    }
  }
)
