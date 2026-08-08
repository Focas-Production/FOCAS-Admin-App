import axios from 'axios'

export const API_BASE = `${import.meta.env.VITE_API_BASE_URL}/api`

const api = axios.create({
  baseURL: API_BASE,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export default api