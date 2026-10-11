import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useApp } from './context/AppContext'
import { Spinner } from './components/ui/spinner'
import { AppLayout } from './components/AppLayout'
import { afterLoginPath } from './lib/authRedirect'

const PublicBooking = lazy(() => import('./pages/PublicBooking'))
const Login = lazy(() => import('./pages/auth/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Profile = lazy(() => import('./pages/Profile'))
const CarsManage = lazy(() => import('./pages/admin/CarsManage'))
const UsersManage = lazy(() => import('./pages/admin/UsersManage'))
const BookingsManage = lazy(() => import('./pages/admin/BookingsManage'))
const Reports = lazy(() => import('./pages/admin/Reports'))
const Settings = lazy(() => import('./pages/admin/Settings'))
const DocumentSettings = lazy(() => import('./pages/admin/DocumentSettings'))

function GuestRoute({ children }) {
  const { isLoggedIn } = useApp()
  const location = useLocation()
  if (isLoggedIn) return <Navigate to={afterLoginPath(location)} replace />
  return children
}

// Not signed in → straight to /login (checked before userLoaded, which only
// flips once a stored token has been verified — without a token it would spin
// forever). The original location rides along so login can return there.
function ProtectedRoute({ children }) {
  const { isLoggedIn, userLoaded } = useApp()
  const location = useLocation()
  if (!isLoggedIn) return <Navigate to="/login" replace state={{ from: location }} />
  if (!userLoaded) return <Spinner />
  return children
}

// Unknown paths: signed-in users land on the dashboard, everyone else on login.
// The public booking page stays at "/" for borrowers, who have no account.
function FallbackRoute() {
  const { isLoggedIn } = useApp()
  const location = useLocation()
  return isLoggedIn
    ? <Navigate to="/app/" replace />
    : <Navigate to="/login" replace state={{ from: location }} />
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
        <Route path="reports" element={<Lazy><Reports /></Lazy>} />
        {/* ตั้งค่า groups cars, users and the document settings (header, number
            format, signers, loan rules) as tabs (nested routes) of one page. */}
        <Route path="settings" element={<Lazy><Settings /></Lazy>}>
          <Route index element={<Navigate to="cars" replace />} />
          <Route path="cars" element={<Lazy><CarsManage /></Lazy>} />
          <Route path="users" element={<Lazy><UsersManage /></Lazy>} />
          <Route path="document" element={<Lazy><DocumentSettings /></Lazy>} />
          {/* Former separate tabs, now sections of เอกสาร. */}
          <Route path="signers" element={<Navigate to="/app/settings/document" replace />} />
          <Route path="doc-number" element={<Navigate to="/app/settings/document" replace />} />
        </Route>
        {/* Old standalone pages, kept as redirects for bookmarks. */}
        <Route path="cars" element={<Navigate to="/app/settings/cars" replace />} />
        <Route path="users" element={<Navigate to="/app/settings/users" replace />} />
        {/* เอกสารรอเซ็น moved into a tab on BookingsManage — redirect the old
            standalone route for anyone with it bookmarked. */}
        <Route path="signing" element={<Navigate to="/app/bookings" replace />} />
        <Route path="calendar" element={<Navigate to="/app/bookings" replace />} />
        <Route path="notifications" element={<Lazy><Notifications /></Lazy>} />
        <Route path="profile" element={<Lazy><Profile /></Lazy>} />
      </Route>
      <Route path="*" element={<FallbackRoute />} />
    </Routes>
  )
}
