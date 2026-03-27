import React, { useCallback, useEffect, useMemo, useState } from 'react'
import useStore from '../store'
import {
  NON_REBINDABLE_SHORTCUT_NOTES,
  SHORTCUT_ACTIONS,
  SHORTCUT_DEFAULTS,
  bindingFromKeyboardEvent,
  formatShortcutLabel,
} from '../shortcuts'

const TAB_LABELS = {
  storyboard: 'Storyboard',
  shotlist: 'Shotlist',
  schedule: 'Schedule',
  callsheet: 'Callsheet',
  script: 'Script',
  scenes: 'Scenes',
  castcrew: 'Cast & Crew',
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
  const shortcutBindings = useStore(s => s.shortcutBindings)
  const setColumnCount = useStore(s => s.setColumnCount)
  const setDefaultFocalLength = useStore(s => s.setDefaultFocalLength)
  const setTheme = useStore(s => s.setTheme)
  const setAutoSave = useStore(s => s.setAutoSave)
  const setUseDropdowns = useStore(s => s.setUseDropdowns)
  const setShortcutBinding = useStore(s => s.setShortcutBinding)
  const resetShortcutBinding = useStore(s => s.resetShortcutBinding)
  const resetAllShortcutBindings = useStore(s => s.resetAllShortcutBindings)
  const scriptSettings = useStore(s => s.scriptSettings)
  const setScriptSettings = useStore(s => s.setScriptSettings)

  const [listeningActionId, setListeningActionId] = useState(null)
  const [shortcutNotice, setShortcutNotice] = useState('')

  const rebindableActions = useMemo(() => {
    const tab = activeTab || 'storyboard'
    return Object.values(SHORTCUT_ACTIONS).filter(action => action.sections.includes(tab))
  }, [activeTab])

  const staticShortcutNotes = useMemo(() => NON_REBINDABLE_SHORTCUT_NOTES[activeTab] || [], [activeTab])
  const tabLabel = TAB_LABELS[activeTab] || activeTab

  const handleShortcutCapture = useCallback((actionId, event) => {
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      setListeningActionId(null)
      setShortcutNotice('Rebinding cancelled.')
      return
    }

    const candidate = bindingFromKeyboardEvent(event)
    if (!candidate) {
      setShortcutNotice('Shortcut must include a non-modifier key and Ctrl/Alt (or Cmd).')
      return
    }

    const result = setShortcutBinding(actionId, candidate)
    if (result.ok) {
      setListeningActionId(null)
      setShortcutNotice(`Updated: ${SHORTCUT_ACTIONS[actionId].label} → ${formatShortcutLabel(candidate)}`)
      return
    }

    if (result.reason === 'conflict') {
      const existingLabel = SHORTCUT_ACTIONS[result.conflictActionId]?.label || result.conflictActionId
      const shouldReplace = window.confirm(
        `${formatShortcutLabel(candidate)} is already assigned to "${existingLabel}". Replace it?`
      )
      if (!shouldReplace) return
      const replaced = setShortcutBinding(actionId, candidate, { replaceActionId: result.conflictActionId })
      if (replaced.ok) {
        setListeningActionId(null)
        setShortcutNotice(`Replaced binding on "${existingLabel}".`)
      }
      return
    }

    setShortcutNotice('That shortcut is not valid.')
  }, [setShortcutBinding])

  useEffect(() => {
    if (!listeningActionId) return undefined
    const handler = (event) => handleShortcutCapture(listeningActionId, event)
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [handleShortcutCapture, listeningActionId])

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
                    ? 'border-cherry text-white'
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
                  ? 'bg-cherry border-cherry text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Dropdowns
            </button>
            <button
              onClick={() => setUseDropdowns(false)}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                !useDropdowns
                  ? 'bg-cherry border-cherry text-white'
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
                  ? 'bg-cherry border-cherry text-white'
                  : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
              }`}
            >
              Light
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={`flex-1 py-1 text-sm rounded border transition-colors ${
                theme === 'dark'
                  ? 'bg-cherry border-cherry text-white'
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
                autoSave ? 'bg-cherry' : 'bg-gray-600'
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

        <div style={{ borderTop: '1px solid #374151', paddingTop: 14, marginTop: 4, marginBottom: 14 }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Script & Estimation
          </p>

          <SettingsRow label="Base Minutes Per Page">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="range"
                min={3}
                max={10}
                step={0.5}
                value={scriptSettings?.baseMinutesPerPage ?? 5}
                onChange={e => setScriptSettings({ baseMinutesPerPage: parseFloat(e.target.value) })}
                style={{ flex: 1, accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: 12, color: '#ddd', fontFamily: 'monospace', width: 28, textAlign: 'right' }}>
                {scriptSettings?.baseMinutesPerPage ?? 5}
              </span>
            </div>
            <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
              1 script page ≈ {scriptSettings?.baseMinutesPerPage ?? 5} min shoot time
            </div>
          </SettingsRow>

          <SettingsRow label="Scene Pagination">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setScriptSettings({ scenePaginationMode: 'natural' })}
                className={`w-full text-left px-3 py-2 text-sm rounded border transition-colors ${
                  (scriptSettings?.scenePaginationMode || 'natural') === 'natural'
                    ? 'bg-blue-600/20 border-blue-400 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
                }`}
              >
                Continue naturally <span className="text-xs text-gray-400">· Standard screenplay flow</span>
              </button>
              <button
                onClick={() => setScriptSettings({ scenePaginationMode: 'newPagePerScene' })}
                className={`w-full text-left px-3 py-2 text-sm rounded border transition-colors ${
                  (scriptSettings?.scenePaginationMode || 'natural') === 'newPagePerScene'
                    ? 'bg-blue-600/20 border-blue-400 text-white'
                    : 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-400'
                }`}
              >
                Start each scene on a new page <span className="text-xs text-gray-400">· Planning view mode</span>
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label="Auto-Suggest Tags">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScriptSettings({ autoSuggestTags: !(scriptSettings?.autoSuggestTags ?? true) })}
                className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${
                  (scriptSettings?.autoSuggestTags ?? true) ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    (scriptSettings?.autoSuggestTags ?? true) ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300">
                {(scriptSettings?.autoSuggestTags ?? true) ? 'On' : 'Off'}
              </span>
            </div>
          </SettingsRow>

          <SettingsRow label="Show Confidence Indicators">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setScriptSettings({ showConfidenceIndicators: !(scriptSettings?.showConfidenceIndicators ?? true) })}
                className={`relative inline-flex w-10 h-5 rounded-full transition-colors ${
                  (scriptSettings?.showConfidenceIndicators ?? true) ? 'bg-blue-500' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                    (scriptSettings?.showConfidenceIndicators ?? true) ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-sm text-gray-300">
                {(scriptSettings?.showConfidenceIndicators ?? true) ? 'Enabled' : 'Hidden'}
              </span>
            </div>
          </SettingsRow>
        </div>

        <div style={{ borderTop: '1px solid #374151', paddingTop: 16, marginTop: 4 }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              Keyboard Shortcuts — {tabLabel}
            </p>
            <button
              onClick={() => {
                resetAllShortcutBindings()
                setShortcutNotice('All shortcuts reset to defaults.')
                setListeningActionId(null)
              }}
              className="text-[11px] text-gray-300 border border-gray-600 rounded px-2 py-1 hover:border-gray-400"
            >
              Reset all
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {rebindableActions.map(action => {
              const activeBinding = shortcutBindings[action.id] || SHORTCUT_DEFAULTS[action.id]
              const isListening = listeningActionId === action.id
              return (
                <div key={action.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#9ca3af', lineHeight: 1.4 }}>{action.label}</span>
                  <button
                    onClick={() => {
                      setShortcutNotice('')
                      setListeningActionId(isListening ? null : action.id)
                    }}
                    className={`text-[11px] font-mono border rounded px-2 py-1 whitespace-nowrap transition-colors ${
                      isListening
                        ? 'bg-blue-600/20 border-blue-400 text-blue-100'
                        : 'bg-gray-700 border-gray-600 text-gray-200 hover:border-gray-400'
                    }`}
                    title={isListening ? 'Press new shortcut, or Esc to cancel' : 'Click to rebind'}
                  >
                    {isListening ? 'Press new shortcut…' : formatShortcutLabel(activeBinding)}
                  </button>
                  <button
                    onClick={() => {
                      resetShortcutBinding(action.id)
                      setShortcutNotice(`Reset "${action.label}" to default.`)
                      setListeningActionId(null)
                    }}
                    className="text-[11px] text-gray-300 border border-gray-600 rounded px-2 py-1 hover:border-gray-400"
                    title="Reset this shortcut"
                  >
                    Reset
                  </button>
                </div>
              )
            })}

            {staticShortcutNotes.map((note, index) => (
              <div key={`${note.desc}-${index}`} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <kbd style={{
                  flexShrink: 0,
                  fontSize: 10,
                  fontFamily: 'monospace',
                  background: '#1f2937',
                  color: '#9ca3af',
                  border: '1px solid #374151',
                  borderRadius: 3,
                  padding: '2px 5px',
                  whiteSpace: 'nowrap',
                }}>
                  {note.keys}
                </kbd>
                <span style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{note.desc}</span>
              </div>
            ))}
          </div>

          {shortcutNotice && (
            <p className="text-xs text-blue-300 mt-3">{shortcutNotice}</p>
          )}
          {listeningActionId && (
            <p className="text-xs text-gray-400 mt-2">Press Esc to cancel rebinding.</p>
          )}
        </div>
      </div>
    </>
  )
}
