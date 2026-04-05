const DEFAULT_CONFIRM_MESSAGE = 'You have unsaved changes that are not yet stored locally. Leave this page anyway?'

export function hasBlockingUnsavedChanges(state) {
  if (!state) return false
  const status = state.saveSyncState?.status
  // Block when changes are in-flight and not yet persisted anywhere.
  if (state.hasUnsavedChanges && status === 'unsaved_changes') return true
  // For cloud projects, also block when local autosave completed but cloud
  // sync hasn't finished yet (the ~2.5 s → 8 s debounce window).  Leaving in
  // this state would leave the cloud copy stale with no local warning.
  if (
    state.projectRef?.type === 'cloud' &&
    state.saveSyncState?.mode !== 'cloud_blocked' &&
    status === 'saved_locally'
  ) return true
  return false
}

export function confirmDiscardUnsavedChanges(message = DEFAULT_CONFIRM_MESSAGE) {
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return true
  return window.confirm(message)
}

export function navigateWithUnsavedChangesGuard({
  path,
  currentPath = null,
  hasUnsavedChanges = false,
  confirmLeave = confirmDiscardUnsavedChanges,
} = {}) {
  if (typeof window === 'undefined' || !path) return false
  const fromPath = currentPath || window.location.pathname
  if (fromPath === path) return false
  if (hasUnsavedChanges && !confirmLeave()) return false
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
  return true
}

export function getBeforeUnloadWarningMessage() {
  return 'You have unsaved changes.'
}
