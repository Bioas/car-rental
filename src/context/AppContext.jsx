import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { invalidateApi } from '../lib/apiCache'

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
  const sseErrorRef = useRef(0)
  const fetchUserRef = useRef(null)
  const logoutRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const pendingEventsRef = useRef(0)
  const fetchingCountRef = useRef(false)
  const lastNotifFetchRef = useRef(0)

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
    invalidateApi()
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
    invalidateApi()
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
      // A transient network error must not end the session — only an explicit
      // 401 response (handled above) should log the user out.
    } finally {
      setUserLoaded(true)
    }
  }, [token])

  const logout = useCallback(() => {
    invalidateApi()
    setUser(null)
    setToken('')
    localStorage.removeItem('token')
    navigate('/login')
  }, [navigate])

  // Keep the newest callbacks reachable from the SSE event handlers. Assigned in
  // an effect rather than during render, which would be a render side effect.
  useEffect(() => {
    fetchUserRef.current = fetchUser
    logoutRef.current = logout
  }, [fetchUser, logout])

  // Realtime events can arrive in bursts (one admin action fans out to every
  // open tab). Coalesce them so pages refetch once instead of N times, and the
  // notification count is fetched once after the dust settles.
  const scheduleRefresh = useCallback(() => {
    pendingEventsRef.current += 1
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      const count = pendingEventsRef.current
      pendingEventsRef.current = 0
      setRefreshSignal(prev => prev + count)
      fetchNotificationCount()
    }, 300)
  }, [])

  const connectSSE = useCallback(() => {
    const t = localStorage.getItem('token')
    if (!t) return
    if (eventSourceRef.current) eventSourceRef.current.close()
    const es = new EventSource(`${API}/events?token=${encodeURIComponent(t)}`)
    es.onopen = () => { sseErrorRef.current = 0; setSseConnected(true) }
    es.addEventListener('data-changed', (e) => {
      scheduleRefresh()
      try {
        const data = JSON.parse(e.data)
        if (data.action === 'new-booking') {
          setGlobalToast({ type: 'new-booking', submessage: 'มีคำขอยืมรถใหม่', message: data.user_name && data.car_brand ? `${data.user_name} — ${data.car_brand} ${data.car_model}` : 'คลิกเพื่อดูรายละเอียด' })
        }
      } catch {}
    })
    // The server re-validates the stream's token periodically and announces a
    // revocation (password change, role change, deleted account) before closing
    // it — end the session here instead of waiting for the next API call.
    es.addEventListener('session-expired', () => {
      es.close()
      if (eventSourceRef.current === es) eventSourceRef.current = null
      setSseConnected(false)
      logoutRef.current && logoutRef.current()
    })
    es.onerror = () => {
      setSseConnected(false)
      sseErrorRef.current += 1
      // EventSource retries on its own forever. If it keeps failing (e.g. the
      // token expired or was revoked) stop and re-validate the session instead
      // of hammering the server with a dead token.
      if (sseErrorRef.current >= 3) {
        es.close()
        if (eventSourceRef.current === es) eventSourceRef.current = null
        fetchUserRef.current && fetchUserRef.current()
      }
    }
    eventSourceRef.current = es
  }, [])

  const fetchNotificationCount = useCallback(async () => {
    // Skip overlapping calls and throttle to once a second — realtime bursts
    // must not fan out one notifications query per event.
    if (fetchingCountRef.current) return
    const now = Date.now()
    if (now - lastNotifFetchRef.current < 1000) return
    lastNotifFetchRef.current = now
    fetchingCountRef.current = true
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
    } catch {} finally {
      fetchingCountRef.current = false
    }
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
