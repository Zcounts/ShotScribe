import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import AppAuthProvider from './auth/AuthProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppAuthProvider>
      <App />
    </AppAuthProvider>
  </React.StrictMode>,
)
