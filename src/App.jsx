import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'
import { Spinner } from './components/ui/spinner'
import { AppLayout } from './components/AppLayout'

const PublicBooking = lazy(() => import('./pages/PublicBooking'))
const Login = lazy(() => import('./pages/auth/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Bookings = lazy(() => import('./pages/Bookings'))
const CalendarPage = lazy(() => import('./pages/CalendarPage'))
const Notifications = lazy(() => import('./pages/Notifications'))
const CarsManage = lazy(() => import('./pages/admin/CarsManage'))
const UsersManage = lazy(() => import('./pages/admin/UsersManage'))
const BookingsManage = lazy(() => import('./pages/admin/BookingsManage'))
const Reports = lazy(() => import('./pages/admin/Reports'))

function GuestRoute({ children }) {
  const { isLoggedIn } = useApp()
  if (isLoggedIn) return <Navigate to="/app/" replace />
  return children
}

function ProtectedRoute({ children }) {
  const { isLoggedIn, userLoaded } = useApp()
  if (!userLoaded) return <Spinner />
  if (!isLoggedIn) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { isLoggedIn, isAdmin, userLoaded } = useApp()
  if (!userLoaded) return <Spinner />
  if (!isLoggedIn) return <Navigate to="/login" replace />
  if (!isAdmin) return <Navigate to="/app/" replace />
  return children
}

function Lazy({ children }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lazy><PublicBooking /></Lazy>} />
      <Route path="/login" element={<GuestRoute><Lazy><Login /></Lazy></GuestRoute>} />
      <Route path="/app" element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route index element={<Lazy><Dashboard /></Lazy>} />
        <Route path="bookings" element={<Lazy><Bookings /></Lazy>} />
        <Route path="calendar" element={<Lazy><CalendarPage /></Lazy>} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
        <Route path="admin/cars" element={<AdminRoute><Lazy><CarsManage /></Lazy></AdminRoute>} />
        <Route path="admin/users" element={<AdminRoute><Lazy><UsersManage /></Lazy></AdminRoute>} />
        <Route path="admin/bookings" element={<AdminRoute><Lazy><BookingsManage /></Lazy></AdminRoute>} />
        <Route path="admin/reports" element={<AdminRoute><Lazy><Reports /></Lazy></AdminRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
