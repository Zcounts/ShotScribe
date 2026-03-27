export const SHORTCUT_STORAGE_KEY = 'shotScribe.shortcutBindings'

export const SHORTCUT_ACTIONS = {
  undo: {
    id: 'undo',
    label: 'Undo last edit',
    defaultBinding: 'Ctrl+Z',
    sections: ['storyboard', 'shotlist', 'script', 'scenes', 'schedule', 'callsheet', 'castcrew'],
  },
  redo: {
    id: 'redo',
    label: 'Redo last undone edit',
    defaultBinding: 'Ctrl+Shift+Z',
    sections: ['storyboard', 'shotlist', 'script', 'scenes', 'schedule', 'callsheet', 'castcrew'],
  },
  saveProject: {
    id: 'saveProject',
    label: 'Save project',
    defaultBinding: 'Ctrl+S',
    sections: ['storyboard', 'shotlist', 'script', 'scenes', 'schedule', 'callsheet', 'castcrew'],
  },
  saveProjectAs: {
    id: 'saveProjectAs',
    label: 'Save project as…',
    defaultBinding: 'Ctrl+Shift+S',
    sections: ['storyboard', 'shotlist', 'script', 'scenes', 'schedule', 'callsheet', 'castcrew'],
  },
}

export const SHORTCUT_DEFAULTS = Object.fromEntries(
  Object.values(SHORTCUT_ACTIONS).map(action => [action.id, action.defaultBinding])
)

export const NON_REBINDABLE_SHORTCUT_NOTES = {
  storyboard: [{ keys: 'Drag card', desc: 'Reorder shot within a scene' }],
  shotlist: [
    { keys: 'Click row header', desc: 'Select / deselect shot' },
    { keys: 'Drag row', desc: 'Reorder shots' },
    { keys: 'Resize column', desc: 'Drag column edge to resize' },
  ],
  schedule: [
    { keys: 'Drag day header', desc: 'Reorder shooting days' },
    { keys: 'Drag shot block', desc: 'Move shot between days or reorder' },
    { keys: 'Click day header', desc: 'Collapse / expand day' },
    { keys: 'Click block header', desc: 'Collapse / expand shot block' },
    { keys: 'Ctrl + Click collapse', desc: 'Collapse or expand all shots simultaneously' },
  ],
  callsheet: [{ keys: 'Drag section', desc: 'Reorder callsheet sections' }],
}

const MODIFIER_LABELS = {
  ctrl: 'Ctrl',
  shift: 'Shift',
  alt: 'Alt',
  meta: 'Meta',
}

function normalizeKeyToken(token) {
  const key = String(token || '').trim()
  if (!key) return ''
  if (key.length === 1) return key.toUpperCase()
  const lowered = key.toLowerCase()
  if (lowered === 'space' || lowered === 'spacebar') return 'Space'
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
}

export function normalizeShortcutBinding(binding) {
  if (!binding) return null
  const parts = String(binding)
    .split('+')
    .map(part => part.trim())
    .filter(Boolean)

  if (!parts.length) return null

  let ctrl = false
  let shift = false
  let alt = false
  let meta = false
  let key = ''

  parts.forEach(part => {
    const lowered = part.toLowerCase()
    if (lowered === 'ctrl' || lowered === 'control' || lowered === 'cmd' || lowered === 'command' || lowered === 'meta') {
      ctrl = true
      return
    }
    if (lowered === 'shift') {
      shift = true
      return
    }
    if (lowered === 'alt' || lowered === 'option') {
      alt = true
      return
    }
    key = normalizeKeyToken(part)
  })

  if (!key) return null
  if (!ctrl && !alt && !meta) return null

  const chunks = []
  if (ctrl) chunks.push(MODIFIER_LABELS.ctrl)
  if (shift) chunks.push(MODIFIER_LABELS.shift)
  if (alt) chunks.push(MODIFIER_LABELS.alt)
  if (meta) chunks.push(MODIFIER_LABELS.meta)
  chunks.push(key)
  return chunks.join('+')
}

function normalizeKeyboardEventKey(key) {
  if (!key) return ''
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()
  return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase()
}

export function bindingFromKeyboardEvent(event) {
  if (!event) return null
  const key = normalizeKeyboardEventKey(event.key)
  if (!key) return null
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(key)) return null

  const chunks = []
  const hasCtrlLike = Boolean(event.ctrlKey || event.metaKey)
  if (hasCtrlLike) chunks.push(MODIFIER_LABELS.ctrl)
  if (event.shiftKey) chunks.push(MODIFIER_LABELS.shift)
  if (event.altKey) chunks.push(MODIFIER_LABELS.alt)
  chunks.push(key)
  return normalizeShortcutBinding(chunks.join('+'))
}

export function formatShortcutLabel(binding) {
  const normalized = normalizeShortcutBinding(binding)
  if (!normalized) return 'Unassigned'
  return normalized.replace(/\+/g, ' + ')
}

export function isShortcutMatch(binding, event) {
  const normalized = normalizeShortcutBinding(binding)
  if (!normalized || !event) return false

  const eventBinding = bindingFromKeyboardEvent(event)
  if (!eventBinding) return false
  return eventBinding === normalized
}

export function getActiveBindings(bindings = {}) {
  const normalized = {}
  Object.entries(SHORTCUT_DEFAULTS).forEach(([actionId, defaultBinding]) => {
    normalized[actionId] = normalizeShortcutBinding(bindings[actionId]) || normalizeShortcutBinding(defaultBinding)
  })
  return normalized
}

export function findShortcutConflict(bindings, actionId, candidate) {
  const normalizedCandidate = normalizeShortcutBinding(candidate)
  if (!normalizedCandidate) return null

  return Object.entries(bindings).find(([otherActionId, binding]) => (
    otherActionId !== actionId && normalizeShortcutBinding(binding) === normalizedCandidate
  )) || null
}

export function loadShortcutBindings() {
  try {
    const raw = localStorage.getItem(SHORTCUT_STORAGE_KEY)
    if (!raw) return { ...SHORTCUT_DEFAULTS }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ...SHORTCUT_DEFAULTS }
    return getActiveBindings(parsed)
  } catch {
    return { ...SHORTCUT_DEFAULTS }
  }
}

export function saveShortcutBindings(bindings) {
  try {
    localStorage.setItem(SHORTCUT_STORAGE_KEY, JSON.stringify(getActiveBindings(bindings)))
  } catch {
    // Storage can fail in constrained environments; ignore.
  }
}

export function resetShortcutBindings() {
  saveShortcutBindings(SHORTCUT_DEFAULTS)
  return { ...SHORTCUT_DEFAULTS }
}
