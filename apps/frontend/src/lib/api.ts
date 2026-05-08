import axios, { AxiosError } from 'axios'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 30000,
  withCredentials: false,
})

// Request interceptor - add auth token
api.interceptors.request.use(config => {
  if (typeof window !== 'undefined') {
    const state = JSON.parse(localStorage.getItem('voxora-auth') || '{}')
    const token = state?.state?.accessToken
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Response interceptor - handle token refresh
api.interceptors.response.use(
  response => response,
  async (error: AxiosError) => {
    const original = error.config as any

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true

      try {
        if (typeof window !== 'undefined') {
          const state = JSON.parse(localStorage.getItem('voxora-auth') || '{}')
          const { userId, refreshToken } = state?.state || {}

          if (refreshToken && userId) {
            const res = await axios.post(`${API_URL}/api/auth/refresh`, { userId, refreshToken })
            const { accessToken, refreshToken: newRefresh } = res.data

            // Update store
            const newState = { ...state, state: { ...state.state, accessToken, refreshToken: newRefresh } }
            localStorage.setItem('voxora-auth', JSON.stringify(newState))

            original.headers.Authorization = `Bearer ${accessToken}`
            return api(original)
          }
        }
      } catch {
        // Redirect to login on refresh failure
        if (typeof window !== 'undefined') {
          localStorage.removeItem('voxora-auth')
          window.location.href = '/login'
        }
      }
    }

    return Promise.reject(error)
  },
)

export default api
