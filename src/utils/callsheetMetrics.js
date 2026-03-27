export function resolveLinkedScriptSceneId(shot = null, storyboardScene = null) {
  if (!shot) return null
  return shot.linkedSceneId || storyboardScene?.linkedScriptSceneId || null
}

export function computeCastSceneMetrics({
  castCharacterKeys,
  scriptScenes,
  allowedSceneIds = null,
  normalizeCharacterKey = value => String(value || '').trim().toLowerCase(),
}) {
  if (!castCharacterKeys || castCharacterKeys.size === 0) {
    return { sceneCount: 0, pageCount: 0, sceneIds: [] }
  }

  const matchingScenes = (scriptScenes || []).filter(scene => {
    if (allowedSceneIds && !allowedSceneIds.has(scene.id)) return false
    return (scene.characters || []).some(char => castCharacterKeys.has(normalizeCharacterKey(char)))
  })

  return {
    sceneCount: matchingScenes.length,
    pageCount: matchingScenes.reduce((sum, scene) => sum + Number(scene.pageCount || 0), 0),
    sceneIds: matchingScenes.map(scene => scene.id),
  }
}
