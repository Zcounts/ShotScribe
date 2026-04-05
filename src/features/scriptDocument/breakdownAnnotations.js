export const BREAKDOWN_ANNOTATION_KIND = 'breakdown_annotation'
export const SHOT_LINK_ANNOTATION_KIND = 'shot_link_annotation'
export const COMMENT_ANNOTATION_KIND = 'comment_annotation'

export const BREAKDOWN_CATEGORIES = [
  'Cast',
  'Props',
  'Wardrobe',
  'Makeup',
  'Vehicles',
  'Set Dressing',
  'Stunts',
  'SFX',
  'VFX',
  'Extras',
  'Animals',
  'Locations',
  'Cast References',
  'Notes',
]

function makeAnnotationId() {
  return `ba_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function normalizeAnchor({ from, to, quote = '' } = {}) {
  const safeFrom = Number.isFinite(Number(from)) ? Number(from) : null
  const safeTo = Number.isFinite(Number(to)) ? Number(to) : null
  return {
    from: safeFrom,
    to: safeTo,
    quote: String(quote || '').trim(),
  }
}

function normalizeCategory(value) {
  const candidate = String(value || '').trim()
  if (!candidate) return 'Props'
  const match = BREAKDOWN_CATEGORIES.find(category => category.toLowerCase() === candidate.toLowerCase())
  return match || 'Notes'
}

function extractNodeText(node) {
  if (!node || typeof node !== 'object') return ''
  if (!Array.isArray(node.content)) return ''
  return node.content
    .map((child) => {
      if (!child || typeof child !== 'object') return ''
      if (child.type === 'text') return String(child.text || '')
      return extractNodeText(child)
    })
    .join('')
}

function collectNodeRanges(scriptDocument) {
  const doc = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const ranges = []
  let cursor = 0

  doc.content.forEach((node, nodeIndex) => {
    const text = extractNodeText(node)
    const start = cursor
    const end = cursor + text.length
    ranges.push({ nodeIndex, start, end, text, type: node?.type || 'action', nodeId: node?.attrs?.id || null })
    cursor = end + 1 // newline separator between blocks
  })

  return ranges
}

function upsertNodeBreakdownRef(node, annotationId) {
  const refs = Array.isArray(node?.attrs?.breakdownRefIds) ? node.attrs.breakdownRefIds : []
  if (refs.includes(annotationId)) return node
  return {
    ...node,
    attrs: {
      ...(node?.attrs || {}),
      breakdownRefIds: [...refs, annotationId],
    },
  }
}

export function removeBreakdownRefFromDocument(scriptDocument, annotationId) {
  const doc = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }

  return {
    ...doc,
    content: doc.content.map((node) => {
      const refs = Array.isArray(node?.attrs?.breakdownRefIds) ? node.attrs.breakdownRefIds : []
      if (!refs.includes(annotationId)) return node
      return {
        ...node,
        attrs: {
          ...(node?.attrs || {}),
          breakdownRefIds: refs.filter(id => id !== annotationId),
        },
      }
    }),
  }
}

export function applyBreakdownRefToDocument(scriptDocument, { annotationId, from, to } = {}) {
  const doc = (scriptDocument && scriptDocument.type === 'doc' && Array.isArray(scriptDocument.content))
    ? scriptDocument
    : { type: 'doc', content: [] }
  const start = Number(from)
  const end = Number(to)
  if (!annotationId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return doc

  const ranges = collectNodeRanges(doc)
  const touched = new Set(
    ranges
      .filter(range => end > range.start && start < range.end)
      .map(range => range.nodeIndex),
  )

  if (touched.size === 0) return doc

  return {
    ...doc,
    content: doc.content.map((node, idx) => (touched.has(idx) ? upsertNodeBreakdownRef(node, annotationId) : node)),
  }
}

export function createBreakdownAnnotationEntity({
  sceneId = null,
  from,
  to,
  quote = '',
  name = '',
  category = 'Props',
  quantity = 1,
  createdAt = null,
  id = null,
} = {}) {
  const anchor = normalizeAnchor({ from, to, quote })
  return {
    id: id || makeAnnotationId(),
    kind: BREAKDOWN_ANNOTATION_KIND,
    sceneIdAtCreate: sceneId || null,
    category: normalizeCategory(category),
    name: String(name || quote || '').trim(),
    quantity: Math.max(1, Number(quantity) || 1),
    anchor,
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createShotLinkAnnotationEntity({
  shotId,
  sceneId = null,
  from,
  to,
  quote = '',
  color = null,
  label = '',
  createdAt = null,
  id = null,
} = {}) {
  return {
    id: id || `sa_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: SHOT_LINK_ANNOTATION_KIND,
    shotId: shotId ? String(shotId) : null,
    sceneIdAtCreate: sceneId || null,
    color: color || null,
    label: String(label || '').trim(),
    anchor: normalizeAnchor({ from, to, quote }),
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function createCommentAnnotationEntity({
  threadId = null,
  sceneId = null,
  from,
  to,
  quote = '',
  status = 'open',
  createdAt = null,
  id = null,
} = {}) {
  return {
    id: id || `ca_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    kind: COMMENT_ANNOTATION_KIND,
    threadId: threadId ? String(threadId) : null,
    sceneIdAtCreate: sceneId || null,
    status: String(status || 'open'),
    anchor: normalizeAnchor({ from, to, quote }),
    comments: [],
    createdAt: createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function normalizeScriptAnnotations(scriptAnnotations) {
  const byId = (scriptAnnotations && typeof scriptAnnotations.byId === 'object' && scriptAnnotations.byId !== null)
    ? { ...scriptAnnotations.byId }
    : {}
  const order = Array.isArray(scriptAnnotations?.order)
    ? scriptAnnotations.order.filter(id => byId[id])
    : Object.keys(byId)
  return { byId, order }
}

export function upsertShotLinkAnnotation({ scriptAnnotations, annotationInput } = {}) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const entity = createShotLinkAnnotationEntity(annotationInput || {})
  if (!entity.shotId) return { scriptAnnotations: normalized, annotation: null }

  const existingId = normalized.order.find((id) => {
    const current = normalized.byId[id]
    return current?.kind === SHOT_LINK_ANNOTATION_KIND && String(current.shotId || '') === entity.shotId
  })

  const nextEntity = existingId
    ? {
        ...normalized.byId[existingId],
        ...entity,
        id: existingId,
        createdAt: normalized.byId[existingId]?.createdAt || entity.createdAt,
        updatedAt: new Date().toISOString(),
      }
    : entity

  return {
    scriptAnnotations: {
      byId: {
        ...normalized.byId,
        [nextEntity.id]: nextEntity,
      },
      order: existingId ? normalized.order : [...normalized.order, nextEntity.id],
    },
    annotation: nextEntity,
  }
}

export function removeShotLinkAnnotationByShotId({ scriptAnnotations, shotId } = {}) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  if (!shotId) return normalized
  const shotIdValue = String(shotId)
  const removeIds = normalized.order.filter((id) => {
    const entity = normalized.byId[id]
    return entity?.kind === SHOT_LINK_ANNOTATION_KIND && String(entity.shotId || '') === shotIdValue
  })
  if (removeIds.length === 0) return normalized
  const removeSet = new Set(removeIds)
  const byId = {}
  normalized.order.forEach((id) => {
    if (removeSet.has(id)) return
    byId[id] = normalized.byId[id]
  })
  return {
    byId,
    order: normalized.order.filter(id => !removeSet.has(id)),
  }
}

export function migrateLegacyShotLinksToAnnotations({ storyboardScenes = [], scriptAnnotations } = {}) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const byId = { ...normalized.byId }
  const order = [...normalized.order]
  const seenShotIds = new Set(
    normalized.order
      .map((id) => normalized.byId[id])
      .filter(entity => entity?.kind === SHOT_LINK_ANNOTATION_KIND && entity?.shotId)
      .map(entity => String(entity.shotId)),
  )

  const scenes = Array.isArray(storyboardScenes) ? storyboardScenes : []
  scenes.forEach((storyScene, sceneIdx) => {
    ;(storyScene.shots || []).forEach((shot, shotIdx) => {
      if (!shot?.linkedSceneId || seenShotIds.has(String(shot.id || ''))) return
      const start = Number.isFinite(shot.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : null
      const end = Number.isFinite(shot.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : null
      if (start == null || end == null || end <= start) return
      const entity = createShotLinkAnnotationEntity({
        shotId: shot.id,
        sceneId: shot.linkedSceneId,
        from: start,
        to: end,
        quote: '',
        color: shot.color || null,
        label: shot.displayId || `${sceneIdx + 1}${shotIdx + 1}`,
      })
      byId[entity.id] = entity
      order.push(entity.id)
      seenShotIds.add(String(entity.shotId))
    })
  })

  return { byId, order }
}

export function deriveShotLinkIndexFromAnnotations({ scriptAnnotations, storyboardScenes = [] } = {}) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const result = {}
  const linkedShotIds = new Set()

  normalized.order.forEach((id) => {
    const annotation = normalized.byId[id]
    if (!annotation || annotation.kind !== SHOT_LINK_ANNOTATION_KIND) return
    const start = Number(annotation?.anchor?.from)
    const end = Number(annotation?.anchor?.to)
    const sceneId = annotation.sceneIdAtCreate || null
    if (!sceneId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return
    if (!result[sceneId]) result[sceneId] = []
    result[sceneId].push({
      id: annotation.id,
      shotId: annotation.shotId || null,
      start,
      end,
      color: annotation.color || '#E84040',
      label: annotation.label || '',
      type: 'visualize',
    })
    if (annotation.shotId) linkedShotIds.add(String(annotation.shotId))
  })

  // Backward reader for historical payloads that only have legacy shot ranges.
  const scenes = Array.isArray(storyboardScenes) ? storyboardScenes : []
  scenes.forEach((storyScene, sceneIdx) => {
    ;(storyScene.shots || []).forEach((shot, shotIdx) => {
      if (!shot?.linkedSceneId || linkedShotIds.has(String(shot.id || ''))) return
      const start = Number.isFinite(shot.linkedScriptRangeStart) ? shot.linkedScriptRangeStart : null
      const end = Number.isFinite(shot.linkedScriptRangeEnd) ? shot.linkedScriptRangeEnd : null
      if (start == null || end == null || end <= start) return
      if (!result[shot.linkedSceneId]) result[shot.linkedSceneId] = []
      result[shot.linkedSceneId].push({
        id: `shot_link_${shot.id}`,
        shotId: shot.id,
        start,
        end,
        color: shot.color || '#E84040',
        label: shot.displayId || `${sceneIdx + 1}${shotIdx + 1}`,
        type: 'visualize',
      })
    })
  })

  Object.keys(result).forEach((sceneId) => {
    result[sceneId] = result[sceneId].sort((a, b) => a.start - b.start)
  })

  return result
}

export function addBreakdownAnnotation({ scriptDocument, scriptAnnotations, annotationInput }) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const entity = createBreakdownAnnotationEntity(annotationInput || {})
  const withRefDoc = applyBreakdownRefToDocument(scriptDocument, {
    annotationId: entity.id,
    from: entity.anchor.from,
    to: entity.anchor.to,
  })

  return {
    scriptDocument: withRefDoc,
    scriptAnnotations: {
      byId: {
        ...normalized.byId,
        [entity.id]: entity,
      },
      order: normalized.order.includes(entity.id) ? normalized.order : [...normalized.order, entity.id],
    },
    annotation: entity,
  }
}

export function removeBreakdownAnnotation({ scriptDocument, scriptAnnotations, annotationId }) {
  if (!annotationId) return { scriptDocument, scriptAnnotations: normalizeScriptAnnotations(scriptAnnotations) }
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  if (!normalized.byId[annotationId]) {
    return { scriptDocument, scriptAnnotations: normalized }
  }
  const { [annotationId]: _, ...restById } = normalized.byId
  return {
    scriptDocument: removeBreakdownRefFromDocument(scriptDocument, annotationId),
    scriptAnnotations: {
      byId: restById,
      order: normalized.order.filter(id => id !== annotationId),
    },
  }
}

export function migrateLegacyBreakdownTagsToAnnotations({ legacyBreakdownTags = [], scriptAnnotations }) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const tags = Array.isArray(legacyBreakdownTags) ? legacyBreakdownTags : []
  if (tags.length === 0) return normalized

  const byId = { ...normalized.byId }
  const order = [...normalized.order]

  tags.forEach((tag) => {
    const nextId = tag?.id ? `legacy_${String(tag.id)}` : makeAnnotationId()
    if (byId[nextId]) return
    const entity = createBreakdownAnnotationEntity({
      id: nextId,
      sceneId: tag?.sceneId || null,
      from: tag?.start,
      to: tag?.end,
      quote: tag?.text || '',
      name: tag?.name || tag?.text || '',
      category: tag?.category || 'Notes',
      quantity: tag?.quantity || 1,
      createdAt: tag?.createdAt || null,
    })
    byId[nextId] = entity
    order.push(nextId)
  })

  return { byId, order }
}

export function deriveBreakdownListsFromAnnotations({ scriptAnnotations, scriptScenes = [] } = {}) {
  const normalized = normalizeScriptAnnotations(scriptAnnotations)
  const perScene = {}
  const global = {}

  const sceneIds = new Set((Array.isArray(scriptScenes) ? scriptScenes : []).map(scene => scene.id))

  normalized.order.forEach((id) => {
    const annotation = normalized.byId[id]
    if (!annotation || (annotation.kind !== BREAKDOWN_ANNOTATION_KIND && annotation.kind !== 'breakdown')) return
    const sceneId = annotation.sceneIdAtCreate && sceneIds.has(annotation.sceneIdAtCreate)
      ? annotation.sceneIdAtCreate
      : '__unscoped__'
    const category = normalizeCategory(annotation.category)
    const name = String(annotation.name || annotation.anchor?.quote || '').trim() || '(Unnamed)'

    if (!perScene[sceneId]) perScene[sceneId] = {}
    if (!perScene[sceneId][category]) perScene[sceneId][category] = []
    perScene[sceneId][category].push({
      id: annotation.id,
      name,
      quantity: annotation.quantity || 1,
      quote: annotation.anchor?.quote || '',
    })

    if (!global[category]) global[category] = {}
    global[category][name] = (global[category][name] || 0) + (annotation.quantity || 1)
  })

  return {
    perScene,
    global,
  }
}
