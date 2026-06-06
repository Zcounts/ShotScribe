const VALID_SHOT_LETTERS = 'ABCDEFGHJKLMNPQRTUVWXYZ'

export function getShotLetter(index) {
  const n = VALID_SHOT_LETTERS.length
  if (index < n) return VALID_SHOT_LETTERS[index]
  const adjusted = index - n
  const firstIdx = Math.floor(adjusted / n)
  const secondIdx = adjusted % n
  return VALID_SHOT_LETTERS[firstIdx] + VALID_SHOT_LETTERS[secondIdx]
}

export function normalizeShotNumberPrefix(value) {
  return String(value ?? '')
    .trim()
    .replace(/[.\-\s]+$/, '')
}

export function normalizeSceneNumberDisplay(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/^SCENE\s*/i, '').trim()
}

function normalizeScenePrefixCandidate(value) {
  return normalizeShotNumberPrefix(normalizeSceneNumberDisplay(value))
}

export function deriveSceneShotPrefix(scene, fallbackSceneNumber) {
  const explicit = normalizeShotNumberPrefix(scene?.shotNumberPrefix)
  if (explicit) return explicit

  const sceneNumber = normalizeScenePrefixCandidate(scene?.sceneNumber)
  if (sceneNumber) return sceneNumber

  const sceneLabel = normalizeScenePrefixCandidate(scene?.sceneLabel)
  if (sceneLabel) return sceneLabel

  return normalizeScenePrefixCandidate(fallbackSceneNumber)
}

export function formatShotDisplayId(prefix, shotIndexOrSuffix) {
  const cleanPrefix = normalizeShotNumberPrefix(prefix)
  const suffix = typeof shotIndexOrSuffix === 'number'
    ? getShotLetter(shotIndexOrSuffix)
    : String(shotIndexOrSuffix ?? '').trim().replace(/^[.-]+/, '')
  return cleanPrefix ? `${cleanPrefix}.${suffix}` : suffix
}
