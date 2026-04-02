import { toast } from 'sonner'

const DEFAULT_DURATION = 3600

export function notifyInfo(message, options = {}) {
  return toast(message, {
    duration: DEFAULT_DURATION,
    ...options,
  })
}

export function notifySuccess(message, options = {}) {
  return toast.success(message, {
    duration: DEFAULT_DURATION,
    ...options,
  })
}

export function notifyWarning(message, options = {}) {
  return toast.warning(message, {
    duration: DEFAULT_DURATION + 1200,
    ...options,
  })
}

export function notifyError(message, options = {}) {
  return toast.error(message, {
    duration: DEFAULT_DURATION + 1600,
    ...options,
  })
}

export function notifyLocalOnlySyncHint(options = {}) {
  return toast('This project is local-only right now. Turn on cloud backup from Save when you want syncing.', {
    id: 'local-only-sync-hint',
    duration: 5200,
    ...options,
  })
}

export function dismissToast(id) {
  toast.dismiss(id)
}
