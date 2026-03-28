const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a',
  'label',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="textbox"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-suppress-entity-open="true"]',
  '[data-suppress-entity-context-menu="true"]',
  '[data-no-entity-open="true"]',
  '[data-no-entity-context-menu="true"]',
  '[data-upload-control]',
  '[data-dropdown-trigger]',
  '[data-drag-handle]',
  '[data-resize-handle]',
  '[data-add-scene-control]',
  '[data-add-shot-control]',
  '[data-expand-toggle]',
  '[draggable="true"]',
].join(',')

export function isInteractiveElement(target) {
  if (!(target instanceof Element)) return false
  return !!target.closest(INTERACTIVE_SELECTOR)
}

function getNearestInteractiveElement(target) {
  if (!(target instanceof Element)) return null
  return target.closest(INTERACTIVE_SELECTOR)
}

export function shouldSuppressEntityOpen(target, entityNode = null) {
  if (!(target instanceof Element)) return true
  const interactiveNode = getNearestInteractiveElement(target)
  if (!interactiveNode) return false
  if (entityNode && interactiveNode === entityNode) return false
  return true
}

export function shouldSuppressEntityContextMenu(target, entityNode = null) {
  if (!(target instanceof Element)) return true
  const interactiveNode = getNearestInteractiveElement(target)
  if (!interactiveNode) return false
  if (entityNode && interactiveNode === entityNode) return false
  return true
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

export function resolvePersonEntityTarget(target) {
  if (!(target instanceof Element)) return null
  const node = target.closest('[data-person-type][data-person-id]')
  if (!node) return null
  const personType = node.getAttribute('data-person-type')
  const personId = node.getAttribute('data-person-id')
  if (!personType || !personId) return null
  if (personType !== 'cast' && personType !== 'crew') return null
  return { personType, personId }
}
