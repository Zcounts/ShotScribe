import React, { useMemo } from 'react'
import useStore from '../store'

// ── Keyboard shortcuts per tab ────────────────────────────────────────────────

const SHORTCUTS = {
  storyboard: [
    { keys: 'Ctrl + S',         desc: 'Save project' },
    { keys: 'Ctrl + Shift + S', desc: 'Save project as…' },
    { keys: 'Drag card',        desc: 'Reorder shot within a scene' },
  ],
  shotlist: [
    { keys: 'Ctrl + S',         desc: 'Save project' },
    { keys: 'Ctrl + Shift + S', desc: 'Save project as…' },
    { keys: 'Click row header', desc: 'Select / deselect shot' },
    { keys: 'Drag row',         desc: 'Reorder shots' },
    { keys: 'Resize column',    desc: 'Drag column edge to resize' },
  ],
  schedule: [
    { keys: 'Ctrl + S',         desc: 'Save project' },
    { keys: 'Ctrl + Shift + S', desc: 'Save project as…' },
    { keys: 'Drag day header',  desc: 'Reorder shooting days' },
    { keys: 'Drag shot block',  desc: 'Move shot between days or reorder' },
    { keys: 'Click day header', desc: 'Collapse / expand day' },
    { keys: 'Click block header', desc: 'Collapse / expand shot block' },
  ],
  callsheet: [
    { keys: 'Ctrl + S',         desc: 'Save project' },
    { keys: 'Ctrl + Shift + S', desc: 'Save project as…' },
    { keys: 'Drag section',     desc: 'Reorder callsheet sections' },
  ],
}

function SettingsRow({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

function SettingsInput({ value, onChange, placeholder, type = 'text' }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full bg-gray-700 text-white border border-gray-600 rounded px-2 py-1 text-sm outline-none focus:border-blue-400"
    />
  )
}

export default function SettingsPanel() {
  const settingsOpen = useStore(s => s.settingsOpen)
  const closeSettings = useStore(s => s.closeSettings)
  const columnCount = useStore(s => s.columnCount)
  const defaultFocalLength = useStore(s => s.defaultFocalLength)
  const theme = useStore(s => s.theme)
  const autoSave = useStore(s => s.autoSave)
  const useDropdowns = useStore(s => s.useDropdowns)
  const activeTab = useStore(s => s.activeTab)
  const setColumnCount = useStore(s => s.setColumnCount)
  const setDefaultFocalLength = useStore(s => s.setDefaultFocalLength)
  const setTheme = useStore(s => s.setTheme)
  const setAutoSave = useStore(s => s.setAutoSave)
  const setUseDropdowns = useStore(s => s.setUseDropdowns)

  const shortcuts = useMemo(() => SHORTCUTS[activeTab] || SHORTCUTS.storyboard, [activeTab])
  const tabLabel = { storyboard: 'Storyboard', shotlist: 'Shotlist', schedule: 'Schedule', callsheet: 'Callsheet' }[activeTab] || activeTab

  return (
    <>
      {settingsOpen && (
        <div className="settings-overlay" onClick={closeSettings} />
      )}
      <div className={`settings-panel ${settingsOpen ? 'open' : ''}`}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Scene details (name, location, camera) are edited directly in each page header.
        </p>

        <SettingsRow label="Default Focal Length">
          <SettingsInput value={defaultFocalLength} onChange={setDefaultFocalLength} placeholder="85mm" />
        </SettingsRow>

        <SettingsRow label="Grid Columns">
          <div className="flex gap-2">
            {[2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setColumnCount(n)}
                className={`flex-1 py-1 text-sm rounded border transition-colors ${
                  columnCount === n
                    ? 'bg-blue-500 border-blue-400 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </SettingsRow>

        <SettingsRow label="Spec Input Type">
          <div className="flex gap-2">
            <button
              onClick={() => setUseDropdowns(true)}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                useDropdowns
                  ? 'bg-blue-500 border-blue-400 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Dropdowns
            </button>
            <button
              onClick={() => setUseDropdowns(false)}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                !useDropdowns
                  ? 'bg-blue-500 border-blue-400 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Free Text
            </button>
          </div>
        </SettingsRow>

        <SettingsRow label="Theme">
          <div className="flex gap-2">
            <button
              onClick={() => setTheme('light')}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                theme === 'light'
                  ? 'bg-blue-500 border-blue-400 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                theme === 'dark'
                  ? 'bg-blue-500 border-blue-400 text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Dark
            </button>
          </div>
        </SettingsRow>

        <SettingsRow label="Auto-Save">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoSave(!autoSave)}
              className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${
                autoSave ? 'bg-blue-500' : 'bg-gray-600'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                  autoSave ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
            <span className="text-sm text-gray-300">
              {autoSave ? 'Enabled (every 60s)' : 'Disabled'}
            </span>
          </div>
        </SettingsRow>

        {/* Keyboard Shortcuts — context-aware: shows shortcuts for active tab */}
        <div style={{ borderTop: '1px solid #374151', paddingTop: 16, marginTop: 4 }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Keyboard Shortcuts — {tabLabel}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shortcuts.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <kbd style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  background: '#374151',
                  color: '#d1d5db',
                  border: '1px solid #4b5563',
                  borderRadius: 3,
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                }}>
                  {s.keys}
                </kbd>
                <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{s.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
