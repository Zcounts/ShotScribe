const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-suppress-entity-open="true"]',
  '[data-no-entity-open="true"]',
  '[data-drag-handle]',
  '[draggable="true"]',
].join(',')

export function isInteractiveElement(target) {
  if (!(target instanceof Element)) return false
  return !!target.closest(INTERACTIVE_SELECTOR)
}

export function shouldSuppressEntityOpen(target) {
  if (!(target instanceof Element)) return true
  return isInteractiveElement(target)
}

export function resolveEntityTarget(target) {
  if (!(target instanceof Element)) return null
  const node = target.closest('[data-entity-type][data-entity-id]')
  if (!node) return null
  const entityType = node.getAttribute('data-entity-type')
  const entityId = node.getAttribute('data-entity-id')
  if (!entityType || !entityId) return null
  return { entityType, entityId }
}
