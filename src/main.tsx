import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AuthProvider } from './auth/AuthContext'
import { RepoDataProvider } from './github/RepoData'
import { App } from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename derives from Vite `base`, which derives from REPO — single source. */}
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <RepoDataProvider>
          <App />
        </RepoDataProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
