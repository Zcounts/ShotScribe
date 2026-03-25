/**
 * scriptParser.js
 * Parses script files (.fountain, .fdx, .txt, .pdf) into a normalized
 * array of ParsedScene objects for import into ShotScribe.
 */

// ── Scene object factory ──────────────────────────────────────────────────────

let _sceneCounter = 0

function makeId() {
  _sceneCounter++
  return `sc_${Date.now()}_${_sceneCounter}`
}

function createParsedScene(overrides = {}) {
  return {
    id: makeId(),
    sceneNumber: null,
    slugline: '',
    intExt: null,
    dayNight: null,
    location: '',
    customHeader: '',
    characters: [],
    actionText: '',
    screenplayText: '',
    screenplayElements: [],
    dialogueCount: 0,
    pageCount: null,
    complexityTags: [],
    estimatedMinutes: null,
    confidence: 'medium',
    linkedShotIds: [],
    notes: '',
    importSource: '',
    color: null,
    ...overrides,
  }
}

function appendScreenplayElement(scene, type, text) {
  const clean = String(text || '').trim()
  if (!clean) return
  scene.screenplayElements.push({ type, text: clean })
  scene.screenplayText += (scene.screenplayText ? '\n' : '') + clean
}

// ── Slugline parser ───────────────────────────────────────────────────────────

const TIME_OF_DAY_KEYWORDS = [
  'CONTINUOUS DAY', 'CONTINUOUS NIGHT', 'CONTINUOUS',
  'LATER', 'DAY', 'NIGHT', 'DAWN', 'DUSK',
  'MORNING', 'AFTERNOON', 'EVENING', 'MAGIC HOUR',
]

// Maps raw time-of-day text to our canonical enum values
const TOD_MAP = {
  'CONTINUOUS DAY': 'CONTINUOUS',
  'CONTINUOUS NIGHT': 'CONTINUOUS',
  'CONTINUOUS': 'CONTINUOUS',
  'LATER': 'LATER',
  'DAY': 'DAY',
  'NIGHT': 'NIGHT',
  'DAWN': 'DAWN',
  'DUSK': 'DUSK',
  'MORNING': 'DAY',
  'AFTERNOON': 'DAY',
  'EVENING': 'DUSK',
  'MAGIC HOUR': 'DUSK',
}

/**
 * parseSlugline('INT. DAISY DINER - HUNTSVILLE AR - DAY')
 * → { intExt: 'INT', location: 'DAISY DINER - HUNTSVILLE AR', dayNight: 'DAY', sceneNumber: null }
 */
export function parseSlugline(rawText) {
  let text = (rawText || '').trim().toUpperCase()
  let sceneNumber = null

  // Extract embedded scene numbers like #1A# or #5B#
  const sceneNumMatch = text.match(/#([^#]+)#/)
  if (sceneNumMatch) {
    sceneNumber = sceneNumMatch[1].trim()
    text = text.replace(/#[^#]+#/g, '').trim()
  }

  // Determine INT/EXT prefix
  let intExt = null
  if (/^INT\.?\/EXT\.?\s/i.test(text) || /^I\/E\.?\s/i.test(text)) {
    intExt = 'INT/EXT'
    text = text.replace(/^(INT\.?\/EXT\.?|I\/E\.?)\s+/i, '')
  } else if (/^INT\.?\s/i.test(text) || /^INTERIOR\s/i.test(text)) {
    intExt = 'INT'
    text = text.replace(/^(INT\.?|INTERIOR)\s+/i, '')
  } else if (/^EXT\.?\s/i.test(text) || /^EXTERIOR\s/i.test(text)) {
    intExt = 'EXT'
    text = text.replace(/^(EXT\.?|EXTERIOR)\s+/i, '')
  }

  // Parse time of day from the last dash-separated segment
  let dayNight = null
  let location = text

  // Work backwards through ' - ' separators to find a time of day token
  const dashParts = text.split(' - ')
  if (dashParts.length >= 2) {
    const lastPart = dashParts[dashParts.length - 1].trim().toUpperCase()
    // Try multi-word keywords first (longer match wins)
    for (const kw of TIME_OF_DAY_KEYWORDS) {
      if (lastPart === kw || lastPart.startsWith(kw + ' ') || lastPart.startsWith(kw + '/')) {
        dayNight = TOD_MAP[kw] || null
        location = dashParts.slice(0, -1).join(' - ').trim()
        break
      }
    }
  }

  // Also handle time of day appended with slash, e.g. "DAY/NIGHT"
  if (!dayNight) {
    const slashMatch = location.match(/\s-\s(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER)\/(DAY|NIGHT|DAWN|DUSK)$/i)
    if (slashMatch) {
      dayNight = slashMatch[1].toUpperCase()
      location = location.replace(/\s-\s(DAY|NIGHT|DAWN|DUSK|CONTINUOUS|LATER)\/(DAY|NIGHT|DAWN|DUSK)$/i, '').trim()
    }
  }

  return { intExt, location, dayNight, sceneNumber }
}

// ── Apply custom header template ──────────────────────────────────────────────

/**
 * Fills a header template string using tokens:
 * {sceneNumber}, {location}, {intExt}, {dayNight}
 */
export function applyHeaderTemplate(template, scene) {
  if (!template) return scene.slugline
  return template
    .replace(/\{sceneNumber\}/g, scene.sceneNumber || '')
    .replace(/\{location\}/g, scene.location || '')
    .replace(/\{intExt\}/g, scene.intExt || '')
    .replace(/\{dayNight\}/g, scene.dayNight || '')
}

// ── Auto-apply complexity tags ────────────────────────────────────────────────

function autoApplyTags(scene) {
  const tags = [...(scene.complexityTags || [])]
  // Auto-apply night-exterior
  if (scene.intExt === 'EXT' && scene.dayNight === 'NIGHT') {
    if (!tags.includes('night-exterior')) tags.push('night-exterior')
  }
  return tags
}

// ── Fountain parser ───────────────────────────────────────────────────────────

/**
 * Parse .fountain text using fountain-js.
 * Returns ParsedScene[].
 */
async function parseFountain(text, filename) {
  // Dynamic import for ESM compatibility in Vite/Electron
  let FountainCtor
  try {
    const mod = await import('fountain-js')
    FountainCtor = mod.Fountain || mod.default?.Fountain || mod.default
  } catch {
    throw new Error('fountain-js is not installed. Run: npm install fountain-js')
  }

  const fountain = new FountainCtor()
  const result = fountain.parse(text, true)
  const tokens = result.tokens || []

  const scenes = []
  let current = null

  for (const token of tokens) {
    if (token.type === 'scene_heading') {
      // Save previous scene
      if (current) {
        current.complexityTags = autoApplyTags(current)
        scenes.push(current)
      }

      const slugline = token.text || ''
      const { intExt, location, dayNight, sceneNumber } = parseSlugline(slugline)

      // fountain-js may provide scene_number on the token
      const tokenSceneNum = token.scene_number || null

      current = createParsedScene({
        slugline,
        intExt,
        location,
        dayNight,
        sceneNumber: sceneNumber || tokenSceneNum,
        customHeader: slugline,
        importSource: filename,
      })
      appendScreenplayElement(current, 'heading', slugline)
    } else if (current) {
      if (token.type === 'action') {
        current.actionText += (current.actionText ? '\n' : '') + (token.text || '')
        appendScreenplayElement(current, 'action', token.text || '')
      } else if (token.type === 'character') {
        const charName = (token.text || '').replace(/\s*\([^)]*\)\s*$/, '').trim()
        if (charName && !current.characters.includes(charName)) {
          current.characters.push(charName)
        }
        appendScreenplayElement(current, 'character', token.text || '')
      } else if (token.type === 'parenthetical') {
        appendScreenplayElement(current, 'parenthetical', token.text || '')
      } else if (token.type === 'dialogue') {
        current.dialogueCount++
        appendScreenplayElement(current, 'dialogue', token.text || '')
      } else if (token.type === 'transition') {
        appendScreenplayElement(current, 'transition', token.text || '')
      }
    }
  }

  if (current) {
    current.complexityTags = autoApplyTags(current)
    scenes.push(current)
  }

  return assignSceneNumbers(scenes)
}

// ── FDX (Final Draft XML) parser ──────────────────────────────────────────────

/**
 * Parse .fdx XML using DOMParser.
 * Returns ParsedScene[].
 */
function parseFdx(xmlText, filename) {
  let doc
  try {
    doc = new DOMParser().parseFromString(xmlText, 'application/xml')
  } catch {
    throw new Error('Failed to parse FDX file as XML')
  }

  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error('FDX XML parse error: ' + parserError.textContent.slice(0, 200))
  }

  const paragraphs = Array.from(doc.querySelectorAll('Paragraph'))
  const scenes = []
  let current = null

  for (const para of paragraphs) {
    const type = para.getAttribute('Type') || ''
    // Collect all text nodes within the paragraph
    const text = Array.from(para.querySelectorAll('Text'))
      .map(t => t.textContent || '')
      .join('')
      .trim()

    if (type === 'Scene Heading' && text) {
      if (current) {
        current.complexityTags = autoApplyTags(current)
        scenes.push(current)
      }

      const sceneNumAttr = para.getAttribute('Number') || null
      const { intExt, location, dayNight, sceneNumber } = parseSlugline(text)

      current = createParsedScene({
        slugline: text,
        intExt,
        location,
        dayNight,
        sceneNumber: sceneNumber || sceneNumAttr,
        customHeader: text,
        importSource: filename,
      })
      appendScreenplayElement(current, 'heading', text)
    } else if (current && type === 'Action' && text) {
      current.actionText += (current.actionText ? '\n' : '') + text
      appendScreenplayElement(current, 'action', text)
    } else if (current && type === 'Character' && text) {
      const charName = text.replace(/\s*\([^)]*\)\s*$/, '').trim()
      if (charName && !current.characters.includes(charName)) {
        current.characters.push(charName)
      }
      appendScreenplayElement(current, 'character', text)
    } else if (current && type === 'Parenthetical' && text) {
      appendScreenplayElement(current, 'parenthetical', text)
    } else if (current && type === 'Dialogue') {
      current.dialogueCount++
      appendScreenplayElement(current, 'dialogue', text)
    } else if (current && type === 'Transition' && text) {
      appendScreenplayElement(current, 'transition', text)
    }
  }

  if (current) {
    current.complexityTags = autoApplyTags(current)
    scenes.push(current)
  }

  return assignSceneNumbers(scenes)
}

// ── Heuristic text parser ─────────────────────────────────────────────────────

const SCENE_HEADING_REGEX = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.|INTERIOR|EXTERIOR)\s+.+/im

/**
 * Parse plain text using heuristic scene-heading detection.
 * Works for .txt and fallback for poorly-formatted files.
 * Returns ParsedScene[].
 */
function parseTxt(text, filename) {
  const lines = text.split(/\r?\n/)
  const scenes = []
  let current = null

  const isTransitionLine = (line) => {
    const trimmed = line.trim()
    return (
      /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT TO|WIPE TO|BACK TO)\b/i.test(trimmed) ||
      (trimmed.endsWith('TO:') && trimmed === trimmed.toUpperCase())
    )
  }

  const isParentheticalLine = (line) => /^\([^()]{1,60}\)$/.test(line.trim())

  const nextNonEmptyLine = (index) => {
    for (let j = index + 1; j < lines.length; j++) {
      const t = lines[j].trim()
      if (t) return t
    }
    return ''
  }

  // A character line is all-caps (with optional parenthetical), ≤ 42 chars, and followed by likely dialogue
  const isCharacterLine = (line, lineIndex) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.length > 42) return false
    // Strip parenthetical
    const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim()
    if (!(stripped === stripped.toUpperCase() && /^[A-Z][A-Z0-9\s'.-]+$/.test(stripped) && stripped.length >= 2)) return false
    if (SCENE_HEADING_REGEX.test(trimmed) || isTransitionLine(trimmed)) return false
    const next = nextNonEmptyLine(lineIndex)
    return !!next && !SCENE_HEADING_REGEX.test(next) && !isCharacterLineShallow(next) && !isTransitionLine(next)
  }

  const isCharacterLineShallow = (line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 42) return false
    const stripped = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim()
    return stripped === stripped.toUpperCase() && /^[A-Z][A-Z0-9\s'.-]+$/.test(stripped)
  }

  let dialogueMode = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Check if this is a scene heading
    if (SCENE_HEADING_REGEX.test(trimmed)) {
      if (current) {
        current.complexityTags = autoApplyTags(current)
        scenes.push(current)
      }

      const { intExt, location, dayNight, sceneNumber } = parseSlugline(trimmed)
      current = createParsedScene({
        slugline: trimmed.toUpperCase(),
        intExt,
        location,
        dayNight,
        sceneNumber,
        customHeader: trimmed.toUpperCase(),
        importSource: filename,
      })
      appendScreenplayElement(current, 'heading', trimmed.toUpperCase())
      dialogueMode = false
      continue
    }

    if (!current) {
      continue
    }

    if (!trimmed) {
      dialogueMode = false
      appendScreenplayElement(current, 'blank', '')
      continue
    }

    if (isTransitionLine(trimmed)) {
      appendScreenplayElement(current, 'transition', trimmed.toUpperCase())
      dialogueMode = false
      continue
    }

    if (isCharacterLineShallow(trimmed) && isCharacterLine(trimmed, i)) {
      const charName = trimmed.replace(/\s*\([^)]*\)\s*$/, '').trim()
      if (!current.characters.includes(charName)) {
        current.characters.push(charName)
      }
      appendScreenplayElement(current, 'character', charName)
      dialogueMode = true
      continue
    }

    if (dialogueMode && isParentheticalLine(trimmed)) {
      appendScreenplayElement(current, 'parenthetical', trimmed)
      continue
    }

    if (dialogueMode) {
      current.dialogueCount++
      appendScreenplayElement(current, 'dialogue', trimmed)
      continue
    }

    if (/^[A-Z][A-Z0-9 '.-]+$/.test(trimmed) && trimmed.length <= 60 && i + 1 < lines.length && isParentheticalLine(lines[i + 1])) {
      appendScreenplayElement(current, 'character', trimmed)
      if (!current.characters.includes(trimmed)) current.characters.push(trimmed)
      dialogueMode = true
    } else {
      current.actionText += (current.actionText ? '\n' : '') + trimmed
      appendScreenplayElement(current, 'action', trimmed)
      dialogueMode = false
    }
  }

  if (current) {
    current.complexityTags = autoApplyTags(current)
    scenes.push(current)
  }

  return assignSceneNumbers(scenes)
}

// ── PDF parser ────────────────────────────────────────────────────────────────

/**
 * Extract text from PDF using pdfreader, then run heuristic parser.
 * Returns ParsedScene[].
 * NOTE: Only works for text-based PDFs. Scanned PDFs are not supported.
 */
async function parsePdf(arrayBuffer, filename) {
  let PdfReader
  try {
    const mod = await import('pdfreader')
    PdfReader = mod.PdfReader
  } catch {
    throw new Error('pdfreader is not installed. Run: npm install pdfreader')
  }

  return new Promise((resolve, reject) => {
    const reader = new PdfReader()
    const textLines = []
    let currentLine = ''
    let lastY = null

    reader.parseBuffer(Buffer.from(arrayBuffer), (err, item) => {
      if (err) {
        reject(new Error('PDF parse error: ' + err.message))
        return
      }

      if (!item) {
        // End of document
        if (currentLine.trim()) textLines.push(currentLine.trim())
        const fullText = textLines.join('\n')
        try {
          const scenes = parseTxt(fullText, filename)
          resolve(scenes)
        } catch (e) {
          reject(e)
        }
        return
      }

      if (item.text !== undefined) {
        // Group text items by Y position to reconstruct lines
        if (lastY !== null && Math.abs(item.y - lastY) > 0.5) {
          if (currentLine.trim()) textLines.push(currentLine.trim())
          currentLine = item.text
        } else {
          currentLine += (currentLine && item.x > 0 ? ' ' : '') + item.text
        }
        lastY = item.y
      }
    })
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Assign sequential scene numbers to scenes that don't already have one.
 * Preserves existing scene numbers where present.
 */
function assignSceneNumbers(scenes) {
  let counter = 1
  return scenes.map(scene => {
    if (!scene.sceneNumber) {
      scene.sceneNumber = String(counter)
    }
    counter++
    return scene
  })
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Detect format and parse a script file.
 *
 * @param {File | { name: string, text?: string, arrayBuffer?: ArrayBuffer }} file
 * @returns {{ scenes: ParsedScene[], format: string, warnings: string[] }}
 */
export async function parseScriptFile(file) {
  const name = file.name || ''
  const ext = name.split('.').pop().toLowerCase()
  const warnings = []
  let scenes = []
  let format = 'unknown'

  try {
    if (ext === 'fountain') {
      format = 'Fountain (.fountain)'
      const text = typeof file.text === 'string' ? file.text : await file.text()
      scenes = await parseFountain(text, name)
    } else if (ext === 'fdx') {
      format = 'Final Draft (.fdx)'
      const text = typeof file.text === 'string' ? file.text : await file.text()
      scenes = parseFdx(text, name)
    } else if (ext === 'txt') {
      format = 'Plain Text (.txt)'
      const text = typeof file.text === 'string' ? file.text : await file.text()
      scenes = parseTxt(text, name)
      warnings.push('Plain text parsing uses heuristics. Review all imported scenes carefully.')
    } else if (ext === 'pdf') {
      format = 'PDF (.pdf)'
      warnings.push(
        'PDF import accuracy depends on how the PDF was generated. ' +
        'Scanned PDFs are not supported. Review all imported scenes carefully.'
      )
      const buffer = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : file.arrayBuffer
      scenes = await parsePdf(buffer, name)
    } else {
      // Unknown extension — try heuristic text parse
      format = 'Unknown (heuristic)'
      warnings.push('Unknown file type — attempting heuristic text parsing. Review all scenes carefully.')
      const text = typeof file.text === 'function' ? await file.text() : (file.text || '')
      scenes = parseTxt(text, name)
    }
  } catch (err) {
    throw new Error(`Failed to parse "${name}": ${err.message}`)
  }

  return { scenes, format, warnings }
}

// ── Complexity tag definitions (exported for use in components) ───────────────

export const COMPLEXITY_TAGS = [
  { tag: 'dialogue-heavy', label: 'Dialogue Heavy', emoji: '💬', type: 'percent', value: 0.25 },
  { tag: 'stunt',          label: 'Stunt',           emoji: '⚡', type: 'percent', value: 0.50 },
  { tag: 'vfx',            label: 'VFX',             emoji: '✨', type: 'percent', value: 0.35 },
  { tag: 'makeup-reset',   label: 'Makeup Reset',    emoji: '💄', type: 'fixed',   value: 15   },
  { tag: 'company-move',   label: 'Company Move',    emoji: '🚛', type: 'fixed',   value: 20   },
  { tag: 'special-prop',   label: 'Special Prop',    emoji: '🎭', type: 'percent', value: 0.10 },
  { tag: 'child-minor',    label: 'Child/Minor',     emoji: '👦', type: 'percent', value: 0.20 },
  { tag: 'wardrobe-reset', label: 'Wardrobe Reset',  emoji: '👔', type: 'fixed',   value: 10   },
  { tag: 'night-exterior', label: 'Night Ext',       emoji: '🌙', type: 'percent', value: 0.20 },
  { tag: 'crowd',          label: 'Crowd',           emoji: '👥', type: 'percent', value: 0.30 },
]

/**
 * Compute estimated shoot time in minutes for a scene.
 * baseMinutesPerPage: user-configurable (default 5)
 */
export function computeEstimate(scene, baseMinutesPerPage = 5) {
  const pageCount = scene.pageCount != null ? scene.pageCount : 1
  const baseMinutes = pageCount * baseMinutesPerPage

  const activeTags = scene.complexityTags || []
  let totalMultiplier = 0
  let fixedAdditions = 0

  for (const tagDef of COMPLEXITY_TAGS) {
    if (activeTags.includes(tagDef.tag)) {
      if (tagDef.type === 'percent') {
        totalMultiplier += tagDef.value
      } else {
        fixedAdditions += tagDef.value
      }
    }
  }

  const adjustedMinutes = baseMinutes * (1 + totalMultiplier)
  const rawFinal = adjustedMinutes + fixedAdditions
  const rounded = Math.round(rawFinal / 5) * 5
  return Math.min(Math.max(rounded, 5), 240)
}

/**
 * Compute confidence level for a scene based on linked shots and tags.
 * linkedShotCount: number of shots with linkedSceneId === scene.id
 */
export function computeConfidence(scene, linkedShotCount = 0) {
  const activeTags = scene.complexityTags || []
  const hasStuntOrVfx = activeTags.includes('stunt') || activeTags.includes('vfx')
  const hasRealPageCount = scene.pageCount != null
  const tagCount = activeTags.length

  if (linkedShotCount === 0 || hasStuntOrVfx || tagCount >= 5) return 'low'
  if (linkedShotCount > 0 && hasRealPageCount && tagCount <= 2) return 'high'
  return 'medium'
}

/**
 * Get suggested complexity tags for a scene (not auto-applied, just suggested).
 * Returns array of tag strings that should be shown as "suggested".
 */
export function getSuggestedTags(scene) {
  const suggestions = []
  if (scene.dialogueCount > 8 && !scene.complexityTags.includes('dialogue-heavy')) {
    suggestions.push('dialogue-heavy')
  }
  return suggestions
}
