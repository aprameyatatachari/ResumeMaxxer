import { Route, Routes } from 'react-router-dom'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import History from './pages/History'
import Landing from './pages/Landing'
import NotFound from './pages/NotFound'
import PdfSandbox from './pages/PdfSandbox'
import SignInPage from './pages/SignIn'
import SignUpPage from './pages/SignUp'
import Tailor from './pages/Tailor'
import VaultPage from './pages/Vault'

/**
 * Route table.
 *
 * `/vault`, `/tailor` and `/history` sit behind <ProtectedRoute>, which is a
 * UX guard only - it stops signed-out users seeing a broken shell. The real
 * enforcement is the JWT check on every backend endpoint. Never rely on a
 * client-side route guard for security.
 */
export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Landing />} />

        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />

        <Route element={<ProtectedRoute />}>
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/tailor" element={<Tailor />} />
          <Route path="/history" element={<History />} />
        </Route>

        {/* Dev-only PDF sandbox. `import.meta.env.DEV` is statically replaced
            at build time, so the route and its fixture are tree-shaken out of
            the production bundle entirely. */}
        {import.meta.env.DEV && (
          <Route path="/pdf-sandbox" element={<PdfSandbox />} />
        )}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
