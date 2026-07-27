import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
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
  const [refreshSignal, setRefreshSignal] = useState(0)
  const [globalToast, setGlobalToast] = useState(null)
  const [sseConnected, setSseConnected] = useState(false)
  const eventSourceRef = useRef(null)

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

  const connectSSE = useCallback(() => {
    const t = localStorage.getItem('token')
    if (!t) return
    if (eventSourceRef.current) eventSourceRef.current.close()
    const es = new EventSource(`${API}/events?token=${encodeURIComponent(t)}`)
    es.onopen = () => setSseConnected(true)
    es.addEventListener('data-changed', (e) => {
      setRefreshSignal(prev => prev + 1)
      fetchNotificationCount()
      try {
        const data = JSON.parse(e.data)
        if (data.action === 'new-booking') {
          setGlobalToast({ type: 'new-booking', submessage: 'มีคำขอยืมรถใหม่', message: data.user_name && data.car_brand ? `${data.user_name} — ${data.car_brand} ${data.car_model}` : 'คลิกเพื่อดูรายละเอียด' })
        }
      } catch {}
    })
    es.onerror = () => setSseConnected(false)
    eventSourceRef.current = es
  }, [])

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

  // Listen for cross-tab token changes (sync localStorage across tabs)
  useEffect(() => {
    function handleStorage(e) {
      if (e.key === 'token') {
        setToken(e.newValue || '')
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // SSE connection — auto-reconnects when token changes (login/logout/refresh/cross-tab)
  useEffect(() => {
    if (!token) return

    connectSSE()

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      setSseConnected(false)
    }
  }, [token])

  useEffect(() => {
    if (isLoggedIn) {
      fetchUser()
      fetchNotificationCount()
    }
  }, [])

  const value = {
    user, token, isLoggedIn, isAdmin, userLoaded, sseConnected,
    darkMode, sidebarOpen, notificationCount, refreshSignal,
    globalToast, setGlobalToast,
    setNotificationCount, connectSSE,
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
