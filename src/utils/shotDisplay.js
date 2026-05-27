const VALID_SHOT_LETTERS = 'ABCDEFGHJKLMNPQRTUVWXYZ'

function getShotLetter(index) {
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
    .replace(/-+\s*$/, '')
}

export function deriveSceneShotPrefix(scene, fallbackSceneNumber) {
  const explicit = normalizeShotNumberPrefix(scene?.shotNumberPrefix)
  if (explicit) return explicit
  return normalizeShotNumberPrefix(fallbackSceneNumber)
}

export function formatShotDisplayId(prefix, shotIndex) {
  const cleanPrefix = normalizeShotNumberPrefix(prefix)
  const suffix = getShotLetter(shotIndex)
  return cleanPrefix ? `${cleanPrefix}-${suffix}` : suffix
}

export function normalizeSceneNumberDisplay(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  return raw.replace(/^SCENE\s*/i, '').trim()
}
