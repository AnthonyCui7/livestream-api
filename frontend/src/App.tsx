import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Layout } from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import SignUpPage from './pages/SignUpPage'
import ProjectsPage from './pages/ProjectsPage'
import ProjectDetailPage from './pages/ProjectDetailPage'
import ClipEditorPage from './pages/ClipEditorPage'
import SocialConnectedPage from './pages/SocialConnectedPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return null
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          {/* OAuth return target (Zernio redirect_url) — public, no Layout. */}
          <Route path="/social/connected" element={<SocialConnectedPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Layout>
                  <ProjectsPage />
                </Layout>
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <RequireAuth>
                <Layout>
                  <ProjectDetailPage />
                </Layout>
              </RequireAuth>
            }
          />
          {/* Full-bleed clip editor — deliberately outside <Layout> (no navbar),
              mirroring how narrative mounts its editor as a dedicated surface. */}
          <Route
            path="/projects/:id/clips/:clipId/edit"
            element={
              <RequireAuth>
                <ClipEditorPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
