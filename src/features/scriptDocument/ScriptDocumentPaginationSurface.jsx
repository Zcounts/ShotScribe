import React, { useEffect, useMemo, useRef } from 'react'
import useStore from '../../store'
import { paginateScriptDocument } from './scriptPagination'

const BLOCK_VERTICAL_PADDING = 2
const TAB_CYCLE_TYPES = ['scene_heading', 'action', 'character', 'dialogue', 'parenthetical']

function normalizeNodeType(type) {
  return type === 'heading' ? 'scene_heading' : (type || 'action')
}

function editorTypeToStyleType(nodeType) {
  return nodeType === 'scene_heading' ? 'heading' : (nodeType || 'action')
}

function nextTypeForEnter(nodeType) {
  if (nodeType === 'character' || nodeType === 'parenthetical') return 'dialogue'
  if (nodeType === 'dialogue') return 'action'
  return nodeType || 'action'
}

function textFromNode(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return ''
  return node.content
    .map((child) => (child?.type === 'text' ? String(child.text || '') : ''))
    .join('')
}

function withNodeText(node, text) {
  return {
    ...(node || {}),
    content: text ? [{ type: 'text', text }] : [],
  }
}

export function updateNodeText(scriptDocument, nodeIndex, text) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const nextContent = base.content.map((node, idx) => (
    idx === nodeIndex ? withNodeText(node, text) : node
  ))
  return { ...base, content: nextContent }
}

export function splitNodeAtOffset(scriptDocument, nodeIndex, offset) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  if (!base.content[nodeIndex]) return base
  const node = base.content[nodeIndex]
  const text = textFromNode(node)
  const splitAt = Math.max(0, Math.min(text.length, Number(offset) || 0))
  const leftText = text.slice(0, splitAt)
  const rightText = text.slice(splitAt)
  const nextNode = {
    ...node,
    attrs: {
      ...(node?.attrs || {}),
      id: `pm_split_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    },
    content: rightText ? [{ type: 'text', text: rightText }] : [],
  }
  const nextContent = [...base.content]
  nextContent[nodeIndex] = withNodeText(node, leftText)
  nextContent.splice(nodeIndex + 1, 0, nextNode)
  return { ...base, content: nextContent }
}

export function updateNodeType(scriptDocument, nodeIndex, nodeType) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const nextContent = base.content.map((node, idx) => (
    idx === nodeIndex ? { ...node, type: normalizeNodeType(nodeType) } : node
  ))
  return { ...base, content: nextContent }
}

export function cycleNodeType(scriptDocument, nodeIndex, direction = 1) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const node = base.content[nodeIndex]
  if (!node) return base
  const currentType = normalizeNodeType(node.type)
  const currentIdx = Math.max(0, TAB_CYCLE_TYPES.indexOf(currentType))
  const nextIdx = (currentIdx + direction + TAB_CYCLE_TYPES.length) % TAB_CYCLE_TYPES.length
  return updateNodeType(base, nodeIndex, TAB_CYCLE_TYPES[nextIdx])
}

export function mergeWithPreviousNode(scriptDocument, nodeIndex) {
  const base = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  if (nodeIndex <= 0 || nodeIndex >= base.content.length) return base
  const previous = base.content[nodeIndex - 1]
  const current = base.content[nodeIndex]
  const merged = `${textFromNode(previous)}${textFromNode(current)}`
  const nextContent = [...base.content]
  nextContent[nodeIndex - 1] = withNodeText(previous, merged)
  nextContent.splice(nodeIndex, 1)
  return { ...base, content: nextContent }
}

function isCaretOnFirstVisualLine(element) {
  if (!element || typeof window === 'undefined') return true
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  const caretRect = range.getBoundingClientRect()
  if (!caretRect || !caretRect.height) return true
  const elRect = element.getBoundingClientRect()
  return caretRect.top < elRect.top + caretRect.height
}

function isCaretOnLastVisualLine(element) {
  if (!element || typeof window === 'undefined') return true
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  const caretRect = range.getBoundingClientRect()
  if (!caretRect || !caretRect.height) return true
  const elRect = element.getBoundingClientRect()
  return caretRect.bottom > elRect.bottom - caretRect.height
}

function placeCaretInElementAtX(element, x, atBottom) {
  if (!element || typeof document === 'undefined' || typeof window === 'undefined') return
  element.focus()
  const elRect = element.getBoundingClientRect()
  const targetY = atBottom ? elRect.bottom - (BLOCK_VERTICAL_PADDING + 4) : elRect.top + (BLOCK_VERTICAL_PADDING + 4)
  let placed = false
  const caretX = (typeof x === 'number' && x > 0) ? x : elRect.left + 4
  if (typeof document.caretRangeFromPoint === 'function') {
    const r = document.caretRangeFromPoint(caretX, targetY)
    if (r && element.contains(r.startContainer)) {
      const sel = window.getSelection()
      if (sel) { sel.removeAllRanges(); sel.addRange(r); placed = true }
    }
  } else if (typeof document.caretPositionFromPoint === 'function') {
    const pos = document.caretPositionFromPoint(caretX, targetY)
    if (pos && element.contains(pos.offsetNode)) {
      const r = document.createRange()
      r.setStart(pos.offsetNode, pos.offset)
      r.collapse(true)
      const sel = window.getSelection()
      if (sel) { sel.removeAllRanges(); sel.addRange(r); placed = true }
    }
  }
  if (!placed) {
    setCaretOffset(element, atBottom ? (element.textContent || '').length : 0)
  }
}

function getCaretOffsetWithinElement(element) {
  if (!element || typeof window === 'undefined') return null
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  if (!element.contains(range.startContainer) || !range.collapsed) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(element)
  pre.setEnd(range.startContainer, range.startOffset)
  return pre.toString().length
}

function setCaretOffset(element, offset) {
  if (!element || typeof document === 'undefined' || typeof window === 'undefined') return
  const selection = window.getSelection()
  if (!selection) return
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = Math.max(0, Number(offset) || 0)
  let targetNode = null
  let targetOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode
    const len = node.textContent?.length || 0
    if (remaining <= len) {
      targetNode = node
      targetOffset = remaining
      break
    }
    remaining -= len
  }

  if (!targetNode) {
    const fallback = document.createTextNode('')
    element.appendChild(fallback)
    targetNode = fallback
    targetOffset = 0
  }

  const range = document.createRange()
  range.setStart(targetNode, targetOffset)
  range.collapse(true)
  selection.removeAllRanges()
  selection.addRange(range)
}

export default function ScriptDocumentPaginationSurface({
  readOnly = false,
  writeOptions = null,
  onActiveBlockTypeChange,
  onActiveNodeChange,
} = {}) {
  const scriptDocument = useStore(s => s.scriptDocument)
  const scriptDocumentLive = useStore(s => s.scriptDocumentLive)
  const scriptSettings = useStore(s => s.scriptSettings)
  const updateScriptDocumentLive = useStore(s => s.updateScriptDocumentLive)
  const deriveScriptDocumentNow = useStore(s => s.deriveScriptDocumentNow)

  const documentRef = scriptDocumentLive || scriptDocument
  const activeNodeIndexRef = useRef(null)
  const nodeElementByIndexRef = useRef({})
  const pendingCaretRef = useRef(null)

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

  useEffect(() => {
    paginated.blocks.forEach((block) => {
      const element = nodeElementByIndexRef.current[block.nodeIndex]
      if (!element) return
      if (activeNodeIndexRef.current === block.nodeIndex) return
      const nextText = textFromNode((documentRef?.content || [])[block.nodeIndex])
      if (element.textContent !== nextText) {
        element.textContent = nextText
      }
    })
  }, [documentRef, paginated.blocks])

  useEffect(() => {
    const pending = pendingCaretRef.current
    if (!pending) return
    const element = nodeElementByIndexRef.current[pending.nodeIndex]
    if (!element) return
    pendingCaretRef.current = null
    element.focus()
    setCaretOffset(element, pending.offset)
  }, [paginated.blocks])

  useEffect(() => {
    const activeIndex = activeNodeIndexRef.current
    if (!Number.isInteger(activeIndex)) return
    const node = (documentRef?.content || [])[activeIndex]
    const activeType = editorTypeToStyleType(node?.type || 'action')
    onActiveBlockTypeChange?.(activeType)
    onActiveNodeChange?.({ nodeIndex: activeIndex, blockType: activeType })
  }, [documentRef, onActiveBlockTypeChange, onActiveNodeChange])

  return (
    <div
      dir="ltr"
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '12px 0 24px',
        display: 'flex',
        justifyContent: 'center',
        direction: 'ltr',
        unicodeBidi: 'normal',
        writingMode: 'horizontal-tb',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {paginated.pages.map((page) => (
          <div
            key={page.id}
            className="app-panel-shadow"
            dir="ltr"
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
              direction: 'ltr',
              unicodeBidi: 'normal',
              writingMode: 'horizontal-tb',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', minHeight: paginated.pageContentHeightPx }}>
              {page.blocks.map((block) => (
                <div
                  key={block.id}
                  ref={(element) => {
                    if (!element) {
                      delete nodeElementByIndexRef.current[block.nodeIndex]
                      return
                    }
                    nodeElementByIndexRef.current[block.nodeIndex] = element
                    if (activeNodeIndexRef.current !== block.nodeIndex) {
                      const nextText = textFromNode((documentRef?.content || [])[block.nodeIndex])
                      if (element.textContent !== nextText) element.textContent = nextText
                    }
                  }}
                  contentEditable={!readOnly}
                  aria-readonly={readOnly}
                  suppressContentEditableWarning
                  dir="ltr"
                  data-node-index={block.nodeIndex}
                  onFocus={() => {
                    activeNodeIndexRef.current = block.nodeIndex
                    const activeType = editorTypeToStyleType(block.nodeType)
                    onActiveBlockTypeChange?.(activeType)
                    onActiveNodeChange?.({ nodeIndex: block.nodeIndex, blockType: activeType })
                  }}
                  onInput={(event) => {
                    const next = updateNodeText(documentRef, block.nodeIndex, event.currentTarget.textContent || '')
                    updateScriptDocumentLive(next, { reason: 'script_document_surface_typing' })
                  }}
                  onKeyDown={(event) => {
                    const nodeIndex = block.nodeIndex
                    const caretOffset = getCaretOffsetWithinElement(event.currentTarget)
                    if (readOnly) return
                    if (event.key === 'ArrowUp') {
                      if (nodeIndex > 0 && isCaretOnFirstVisualLine(event.currentTarget)) {
                        const prevElement = nodeElementByIndexRef.current[nodeIndex - 1]
                        if (prevElement) {
                          event.preventDefault()
                          const sel = window.getSelection()
                          const x = (sel && sel.rangeCount > 0)
                            ? sel.getRangeAt(0).getBoundingClientRect().left
                            : event.currentTarget.getBoundingClientRect().left
                          placeCaretInElementAtX(prevElement, x, true)
                        }
                      }
                      return
                    }
                    if (event.key === 'ArrowDown') {
                      const totalNodes = (documentRef?.content || []).length
                      if (nodeIndex < totalNodes - 1 && isCaretOnLastVisualLine(event.currentTarget)) {
                        const nextElement = nodeElementByIndexRef.current[nodeIndex + 1]
                        if (nextElement) {
                          event.preventDefault()
                          const sel = window.getSelection()
                          const x = (sel && sel.rangeCount > 0)
                            ? sel.getRangeAt(0).getBoundingClientRect().left
                            : event.currentTarget.getBoundingClientRect().left
                          placeCaretInElementAtX(nextElement, x, false)
                        }
                      }
                      return
                    }
                    if (event.key === 'Tab') {
                      event.preventDefault()
                      const direction = event.shiftKey ? -1 : 1
                      const nextDocument = cycleNodeType(documentRef, nodeIndex, direction)
                      updateScriptDocumentLive(nextDocument, { reason: 'script_document_surface_tab_cycle_type' })
                      const updatedNode = (nextDocument?.content || [])[nodeIndex]
                      const activeType = editorTypeToStyleType(updatedNode?.type || 'action')
                      onActiveBlockTypeChange?.(activeType)
                      onActiveNodeChange?.({ nodeIndex, blockType: activeType })
                      deriveScriptDocumentNow({ reason: 'script_document_surface_tab_cycle_type', persist: true })
                      return
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      const nextDocument = splitNodeAtOffset(documentRef, nodeIndex, caretOffset)
                      const currentNodeType = normalizeNodeType(((documentRef?.content || [])[nodeIndex] || {}).type)
                      const enterType = nextTypeForEnter(currentNodeType)
                      const withType = updateNodeType(nextDocument, nodeIndex + 1, enterType)
                      pendingCaretRef.current = { nodeIndex: nodeIndex + 1, offset: 0 }
                      updateScriptDocumentLive(withType, { reason: 'script_document_surface_enter_split' })
                      onActiveBlockTypeChange?.(editorTypeToStyleType(enterType))
                      onActiveNodeChange?.({ nodeIndex: nodeIndex + 1, blockType: editorTypeToStyleType(enterType) })
                      deriveScriptDocumentNow({ reason: 'script_document_surface_enter_split', persist: true })
                      return
                    }
                    if (event.key === 'Backspace' && caretOffset === 0) {
                      event.preventDefault()
                      const previousTextLength = textFromNode((documentRef?.content || [])[nodeIndex - 1]).length
                      const nextDocument = mergeWithPreviousNode(documentRef, nodeIndex)
                      pendingCaretRef.current = { nodeIndex: Math.max(0, nodeIndex - 1), offset: previousTextLength }
                      updateScriptDocumentLive(nextDocument, { reason: 'script_document_surface_backspace_merge' })
                      deriveScriptDocumentNow({ reason: 'script_document_surface_backspace_merge', persist: true })
                    }
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
                    fontWeight: ((writeOptions?.boldSlugline && block.nodeType === 'scene_heading')
                      || (writeOptions?.boldCharacter && block.nodeType === 'character'))
                      ? 700
                      : 400,
                    whiteSpace: 'pre-wrap',
                    textTransform: ['scene_heading', 'character', 'transition'].includes(block.nodeType) ? 'uppercase' : 'none',
                    outline: 'none',
                    borderRadius: 4,
                    border: '1px solid transparent',
                    background: activeNodeIndexRef.current === block.nodeIndex ? 'rgba(37,99,235,0.04)' : 'transparent',
                    direction: 'ltr',
                    unicodeBidi: 'plaintext',
                    writingMode: 'horizontal-tb',
                  }}
                />
              ))}
            </div>
            <div style={{ position: 'absolute', right: 12, top: 10, fontSize: 11, color: '#64748b' }}>{page.number}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
