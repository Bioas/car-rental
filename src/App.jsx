import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useApp } from './context/AppContext'
import { Spinner } from './components/ui/spinner'
import { AppLayout } from './components/AppLayout'

const PublicBooking = lazy(() => import('./pages/PublicBooking'))
const Login = lazy(() => import('./pages/auth/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
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
        <Route path="bookings" element={<Lazy><BookingsManage /></Lazy>} />
        <Route path="cars" element={<Lazy><CarsManage /></Lazy>} />
        <Route path="users" element={<Lazy><UsersManage /></Lazy>} />
        <Route path="reports" element={<Lazy><Reports /></Lazy>} />
        <Route path="calendar" element={<Navigate to="/app/bookings" replace />} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
