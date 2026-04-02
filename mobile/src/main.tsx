import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
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
    <App />
  </React.StrictMode>
)

registerServiceWorker()
