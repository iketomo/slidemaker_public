import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequireApiKey } from './components/auth/RequireApiKey'
import { AppLayout } from './components/layout/AppLayout'
import Landing from './pages/Landing'
import Onboarding from './pages/Onboarding'
import PresentationPage from './pages/PresentationPage'
import FreeGenerationPage from './pages/FreeGenerationPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Landing />} />

          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<Onboarding />} />

            <Route path="/app" element={<AppLayout />}>
              <Route index element={<Navigate to="presentation" replace />} />

              <Route element={<RequireApiKey />}>
                <Route path="presentation" element={<PresentationPage />} />
                <Route path="free" element={<FreeGenerationPage />} />
              </Route>

              <Route path="history" element={<HistoryPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
