import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { registerServiceWorker } from './registerServiceWorker'

window.addEventListener('error', (event) => {
  console.error('[mobile] uncaught startup error', event.error ?? event.message)
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[mobile] unhandled rejection', event.reason)
})

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
