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
  '[role="option"]',
  '[role="switch"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-suppress-entity-open="true"]',
  '[data-suppress-entity-actions="true"]',
  '[data-no-entity-open="true"]',
  '[data-drag-handle]',
  '[draggable="true"]',
].join(',')

export function resolveEntityTarget(target) {
  if (!(target instanceof Element)) return null
  const node = target.closest('[data-entity-type][data-entity-id]')
  if (!node) return null
  const entityType = node.getAttribute('data-entity-type')
  const entityId = node.getAttribute('data-entity-id')
  if (!entityType || !entityId) return null
  return { entityType, entityId, node }
}

export function isInteractiveElement(target, entityNode = null) {
  if (!(target instanceof Element)) return false
  const interactiveNode = target.closest(INTERACTIVE_SELECTOR)
  if (!interactiveNode) return false
  if (entityNode && interactiveNode === entityNode) return false
  return true
}

export function shouldSuppressEntityActions(target, entityNode = null) {
  if (!(target instanceof Element)) return true
  return isInteractiveElement(target, entityNode)
}

export function shouldSuppressEntityOpen(target, entityNode = null) {
  return shouldSuppressEntityActions(target, entityNode)
}
