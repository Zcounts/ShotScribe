import React from 'react'

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Unknown error' }
  }

  componentDidCatch(error, info) {
    console.error('ShotScribe app render failure', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: '#111318',
          color: '#E7ECF3',
        }}
      >
        <div style={{ maxWidth: 560, border: '1px solid #7F1D1D', borderRadius: 12, background: '#171C24', padding: 20 }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 20, color: '#FCA5A5' }}>ShotScribe hit a recoverable display error.</h1>
          <p style={{ margin: '0 0 12px', lineHeight: 1.5 }}>
            Your project data is still protected by the local save flow. Reload the app to restore the workspace.
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 12, color: '#AAB4C5', wordBreak: 'break-word' }}>
            Error: {this.state.message}
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              border: '1px solid #FCA5A5',
              borderRadius: 8,
              background: '#7F1D1D',
              color: '#FFF7ED',
              cursor: 'pointer',
              fontWeight: 700,
              padding: '10px 14px',
            }}
          >
            Reload ShotScribe
          </button>
        </div>
      </div>
    )
  }
}
