import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) { setLoading(false); return }

    api.get('/auth/me')
      .then((res) => {
        if (res.data.isAdmin) {
          setUser(res.data)
        } else {
          localStorage.removeItem('admin_token')
          setUser(null)
        }
      })
      .catch(() => {
        localStorage.removeItem('admin_token')
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  function login(token, userData) {
    localStorage.setItem('admin_token', token)
    setUser(userData)
  }

  function logout() {
    localStorage.removeItem('admin_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
