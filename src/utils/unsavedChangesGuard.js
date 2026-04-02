const DEFAULT_CONFIRM_MESSAGE = 'You have unsaved changes that are not yet stored locally. Leave this page anyway?'

export function hasBlockingUnsavedChanges(state) {
  return Boolean(state?.hasUnsavedChanges && state?.saveSyncState?.status === 'unsaved_changes')
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
