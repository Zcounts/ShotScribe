import React, { useMemo, useState } from 'react'
import useStore from '../store'
import ImportScriptModal from './ImportScriptModal'
import { createScreenplayElement } from '../utils/screenplay'
import { runtimeConfig } from '../config/runtimeConfig'
import ScriptDocumentPaginationSurface from '../features/scriptDocument/ScriptDocumentPaginationSurface'
import ScriptTabLegacy from './ScriptTabLegacy'

function buildManualScene() {
  const now = Date.now()
  return {
    id: `sc_manual_${now}`,
    sceneNumber: '1',
    slugline: 'INT. WRITER ROOM - DAY',
    intExt: 'INT',
    dayNight: 'DAY',
    location: 'WRITER ROOM',
    customHeader: 'INT. WRITER ROOM - DAY',
    characters: [],
    actionText: '',
    screenplayText: 'INT. WRITER ROOM - DAY',
    screenplayElements: [
      createScreenplayElement('heading', 'INT. WRITER ROOM - DAY'),
      createScreenplayElement('action', ''),
    ],
    dialogueCount: 0,
    pageCount: null,
    confidence: 'medium',
    linkedShotIds: [],
    notes: '',
    importSource: 'Manual',
  }
}

export default function ScriptTab() {
  const scriptScenes = useStore(s => s.scriptScenes)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const [showImportModal, setShowImportModal] = useState(false)

  const shouldUseLegacyFallback = runtimeConfig.scriptDocument?.legacyFallbackEnabled === true

  const hasScriptContent = useMemo(() => {
    if (!Array.isArray(scriptScenes)) return false
    return scriptScenes.some(scene => Array.isArray(scene?.screenplayElements) && scene.screenplayElements.length > 0)
  }, [scriptScenes])

  if (shouldUseLegacyFallback) {
    return <ScriptTabLegacy />
  }

  const createManualScript = () => {
    const now = Date.now()
    importScriptScenes([buildManualScene()], {
      id: `manual_${now}`,
      filename: 'Manual Script',
    }, 'merge')
  }

  if (!hasScriptContent) {
    return (
      <>
        <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
          <div className="app-surface-card" style={{ width: 'min(420px, calc(100vw - 28px))', padding: 20, textAlign: 'center' }}>
            <h2 style={{ marginTop: 0, fontSize: 22 }}>Start your script</h2>
            <p style={{ color: '#475569', marginBottom: 16 }}>The Script tab now uses the unified script document editor.</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
              <button className="toolbar-btn" onClick={() => setShowImportModal(true)}>Upload Script</button>
              <button className="toolbar-btn" onClick={createManualScript}>Write Script</button>
            </div>
          </div>
        </div>
        {showImportModal && <ImportScriptModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} />}
      </>
    )
  }

  return <ScriptDocumentPaginationSurface />
}
