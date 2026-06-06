import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppAuthProvider from './auth/AuthProvider'
import { initializeErrorMonitoring, logTelemetry } from './utils/telemetry'
import './index.css'
import { SonnerToaster } from './components/ui/sonner'
import AppErrorBoundary from './components/AppErrorBoundary'

initializeErrorMonitoring()
logTelemetry('frontend.app_boot', { mode: import.meta.env?.MODE || 'unknown' })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppAuthProvider>
      <AppErrorBoundary>
        <App />
        <SonnerToaster />
      </AppErrorBoundary>
    </AppAuthProvider>
  </React.StrictMode>,
)
