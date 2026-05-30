import { Routes, Route, Navigate } from 'react-router-dom'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Onboarding } from './pages/Onboarding'
import { AdminPage } from './pages/admin/AdminPage'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import { useAuthStore } from './store/auth.store'

function AdminRoute({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'ADMIN') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/onboarding" element={
        <ProtectedRoute><Onboarding /></ProtectedRoute>
      } />
      <Route path="/admin" element={
        <AdminRoute><AdminPage /></AdminRoute>
      } />
      <Route path="/*" element={
        <ProtectedRoute><AppShell /></ProtectedRoute>
      } />
    </Routes>
  )
}
