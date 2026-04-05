import React, { useEffect, useMemo, useRef } from 'react'
import useStore from '../../store'
import { paginateScriptDocument } from './scriptPagination'

const BLOCK_VERTICAL_PADDING = 2

function textFromNode(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return ''
  return node.content
    .map((child) => (child?.type === 'text' ? String(child.text || '') : ''))
    .join('')
}

function updateNodeText(scriptDocument, nodeIndex, text) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const nextContent = base.content.map((node, idx) => {
    if (idx !== nodeIndex) return node
    return {
      ...node,
      content: text ? [{ type: 'text', text }] : [],
    }
  })
  return { ...base, content: nextContent }
}

export default function ScriptDocumentPaginationSurface() {
  const scriptDocument = useStore(s => s.scriptDocument)
  const scriptDocumentLive = useStore(s => s.scriptDocumentLive)
  const scriptSettings = useStore(s => s.scriptSettings)
  const updateScriptDocumentLive = useStore(s => s.updateScriptDocumentLive)
  const deriveScriptDocumentNow = useStore(s => s.deriveScriptDocumentNow)

  const documentRef = scriptDocumentLive || scriptDocument
  const activeElementRef = useRef(null)

  const paginated = useMemo(() => paginateScriptDocument({
    scriptDocument: documentRef,
    documentSettings: scriptSettings?.documentSettings,
    scenePaginationMode: scriptSettings?.scenePaginationMode || 'natural',
  }), [documentRef, scriptSettings?.documentSettings, scriptSettings?.scenePaginationMode])

  useEffect(() => {
    return () => {
      deriveScriptDocumentNow({ reason: 'script_document_surface_unmount', persist: false })
    }
  }, [deriveScriptDocumentNow])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0 24px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {paginated.pages.map((page) => (
          <div
            key={page.id}
            className="app-panel-shadow"
            style={{
              width: paginated.settings.page.widthPx,
              minHeight: paginated.settings.page.heightPx,
              background: '#fff',
              border: '1px solid rgba(148,163,184,0.4)',
              position: 'relative',
              boxSizing: 'border-box',
              paddingTop: paginated.settings.page.marginTopPx,
              paddingRight: paginated.settings.page.marginRightPx,
              paddingBottom: paginated.settings.page.marginBottomPx,
              paddingLeft: paginated.settings.page.marginLeftPx,
              overflow: 'hidden',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: paginated.pageContentHeightPx }}>
              {page.blocks.map((block) => (
                <div
                  key={block.id}
                  contentEditable
                  suppressContentEditableWarning
                  data-node-index={block.nodeIndex}
                  onFocus={(event) => {
                    activeElementRef.current = event.currentTarget
                  }}
                  onInput={(event) => {
                    const next = updateNodeText(documentRef, block.nodeIndex, event.currentTarget.textContent || '')
                    updateScriptDocumentLive(next, { reason: 'script_document_surface_typing' })
                  }}
                  onBlur={() => {
                    deriveScriptDocumentNow({ reason: 'script_document_surface_blur', persist: true })
                  }}
                  style={{
                    marginLeft: `${block.style.marginLeftPx}px`,
                    marginRight: `${block.style.marginRightPx}px`,
                    paddingTop: `${BLOCK_VERTICAL_PADDING}px`,
                    paddingBottom: `${BLOCK_VERTICAL_PADDING}px`,
                    minHeight: `${block.style.lineHeightPx}px`,
                    fontFamily: '"Courier Prime", "Courier New", Courier, monospace',
                    fontSize: `${block.style.fontSizePx}px`,
                    lineHeight: `${block.style.lineHeightPx}px`,
                    textAlign: block.style.align || 'left',
                    letterSpacing: `${block.style.letterSpacingPx}px`,
                    whiteSpace: 'pre-wrap',
                    textTransform: ['scene_heading'].includes(block.nodeType) ? 'uppercase' : 'none',
                    outline: 'none',
                    borderRadius: 4,
                    border: '1px solid transparent',
                  }}
                >
                  {textFromNode((documentRef?.content || [])[block.nodeIndex]) || ' '}
                </div>
              ))}
            </div>
            <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#64748b' }}>{page.number}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
