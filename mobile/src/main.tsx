import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { MobileProviders } from './auth'
import './styles.css'
import { registerServiceWorker } from './registerServiceWorker'
import { initializeObservability } from './observability'

initializeObservability()

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Missing #root element for mobile app mount.')
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <MobileProviders><App /></MobileProviders>
  </React.StrictMode>
)

registerServiceWorker()
