import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

const AppContext = createContext(null)

const API = '/api'

function authHeaders() {
  const token = localStorage.getItem('token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function AppProvider({ children }) {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [userLoaded, setUserLoaded] = useState(false)
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [darkMode, setDarkMode] = useState(localStorage.getItem('darkMode') === 'true')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notificationCount, setNotificationCount] = useState(0)

  const isLoggedIn = !!token
  const isAdmin = user?.role === 'admin'

  const applyTheme = useCallback(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  useEffect(() => {
    applyTheme()
  }, [applyTheme])

  const toggleDark = useCallback(() => {
    setDarkMode(prev => {
      const next = !prev
      localStorage.setItem('darkMode', next)
      return next
    })
  }, [])

  const toggleSidebar = useCallback(() => {
    setSidebarOpen(prev => !prev)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setToken(data.token)
    setUser(data.user)
    setUserLoaded(true)
    localStorage.setItem('token', data.token)
  }, [])

  const register = useCallback(async (name, email, password, phone) => {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, phone })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    setToken(data.token)
    setUser(data.user)
    setUserLoaded(true)
    localStorage.setItem('token', data.token)
  }, [])

  const fetchUser = useCallback(async () => {
    if (!token) { setUserLoaded(true); return }
    try {
      const res = await fetch(`${API}/auth/me`, {
        headers: authHeaders()
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user)
      } else {
        logout()
      }
    } catch {
      logout()
    } finally {
      setUserLoaded(true)
    }
  }, [token])

  const logout = useCallback(() => {
    setUser(null)
    setToken('')
    localStorage.removeItem('token')
    navigate('/login')
  }, [navigate])

  const fetchNotificationCount = useCallback(async () => {
    try {
      const t = localStorage.getItem('token')
      if (!t) return
      const res = await fetch(`${API}/notifications`, {
        headers: { Authorization: `Bearer ${t}` }
      })
      if (res.ok) {
        const data = await res.json()
        setNotificationCount(data.unread)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (isLoggedIn) {
      fetchUser()
      fetchNotificationCount()
    }
  }, [])

  const value = {
    user, token, isLoggedIn, isAdmin, userLoaded,
    darkMode, sidebarOpen, notificationCount,
    setNotificationCount,
    login, register, fetchUser, logout,
    toggleDark, toggleSidebar, fetchNotificationCount,
    authHeaders,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
