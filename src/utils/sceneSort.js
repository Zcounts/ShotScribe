export function naturalSortSceneNumber(a, b) {
  return String(a?.sceneNumber || '').localeCompare(String(b?.sceneNumber || ''), undefined, {
    numeric: true,
    sensitivity: 'base',
  })
}
