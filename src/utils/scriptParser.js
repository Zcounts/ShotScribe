/**
 * scriptParser.js
 * Parses script files (.fountain, .fdx, .txt, .pdf, .docx, .md) into a normalized
 * array of ParsedScene objects for import into ShotScribe.
 */

import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

export const SUPPORTED_SCRIPT_EXTENSIONS = ['fountain', 'fdx', 'txt', 'pdf', 'docx', 'md']

export const SCRIPT_FORMAT_LABELS = {
  fountain: 'Fountain (.fountain)',
  fdx: 'Final Draft (.fdx)',
  txt: 'Plain Text (.txt)',
  pdf: 'PDF (.pdf)',
  docx: 'Word Document (.docx)',
  md: 'Markdown (.md)',
}

const SUPPORTED_EXTENSIONS_LIST = SUPPORTED_SCRIPT_EXTENSIONS.map(ext => `.${ext}`).join(', ')

export function getScriptFileExtension(filename = '') {
  const parts = String(filename).toLowerCase().trim().split('.')
  return parts.length > 1 ? parts.pop() : ''
}

export function isSupportedScriptExtension(ext = '') {
  return SUPPORTED_SCRIPT_EXTENSIONS.includes(String(ext).toLowerCase())
}

function normalizeImportedText(text, { stripBom = false } = {}) {
  const raw = String(text || '')
  const withoutBom = stripBom ? raw.replace(/^\uFEFF/, '') : raw
  return withoutBom.replace(/\r\n?/g, '\n')
}

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

  // Parse time of day from dash-separated segments, preferring the last
  // matching token. This supports headings such as:
  //   INT. GAS STATION - NIGHT - (MARJORIE'S STORY)
  // where NIGHT appears before a trailing parenthetical annotation.
  let dayNight = null
  let location = text

  const normalizeSlugSegment = (segment) => (
    String(segment || '')
      .trim()
      .toUpperCase()
      .replace(/^[([{]+/, '')
      .replace(/[)\]}.,:;!?]+$/g, '')
      .trim()
  )
  const dashParts = text.split(' - ').map(part => part.trim()).filter(Boolean)
  if (dashParts.length >= 2) {
    for (let idx = dashParts.length - 1; idx >= 0; idx -= 1) {
      const normalizedPart = normalizeSlugSegment(dashParts[idx])
      let matchedKeyword = null
      for (const kw of TIME_OF_DAY_KEYWORDS) {
        if (normalizedPart === kw || normalizedPart.startsWith(`${kw} `) || normalizedPart.startsWith(`${kw}/`)) {
          matchedKeyword = kw
          break
        }
      }
      if (!matchedKeyword) continue
      dayNight = TOD_MAP[matchedKeyword] || null
      const nextParts = dashParts.filter((_, partIdx) => partIdx !== idx)
      location = nextParts.join(' - ').trim()
      break
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
const TRANSITION_REGEX = /^(FADE IN|FADE OUT|CUT TO|DISSOLVE TO|SMASH CUT TO|MATCH CUT(?: FORWARD)? TO|WIPE TO|BACK TO|JUMP CUT TO|INTERCUT)\b/i

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
      TRANSITION_REGEX.test(trimmed) ||
      ((trimmed.endsWith('TO:') || trimmed.endsWith(' TO')) && trimmed === trimmed.toUpperCase())
    )
  }

  const isParentheticalLine = (line) => /^\([^()]{1,60}\)$/.test(line.trim())
  const isUppercaseHeavy = (value) => {
    const letters = value.match(/[A-Za-z]/g) || []
    if (!letters.length) return false
    const uppercaseLetters = value.match(/[A-Z]/g) || []
    return uppercaseLetters.length / letters.length >= 0.85
  }
  const isSectionMarkerLine = (line) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (/^[-=_*#~]{3,}$/.test(trimmed)) return true
    if (trimmed.length > 50 || !isUppercaseHeavy(trimmed)) return false
    return /^(ACT|SEQUENCE|PART|EPISODE|PROLOGUE|EPILOGUE|MONTAGE|END MONTAGE)\b/.test(trimmed)
  }

  const nextNonEmptyLine = (index) => {
    for (let j = index + 1; j < lines.length; j++) {
      const t = lines[j].trim()
      if (t) return t
    }
    return ''
  }

  const prevNonEmptyType = () => {
    if (!current) return null
    for (let idx = current.screenplayElements.length - 1; idx >= 0; idx -= 1) {
      const type = current.screenplayElements[idx]?.type
      if (type && type !== 'blank') return type
    }
    return null
  }

  // A character line is mostly uppercase (with optional trailing colon), ≤ 42 chars,
  // not a heading/transition/section marker, and followed by likely dialogue.
  const isCharacterLine = (line, lineIndex) => {
    const trimmed = line.trim()
    if (!trimmed) return false
    if (trimmed.length > 42) return false
    const stripped = trimmed
      .replace(/:\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
    if (!stripped || stripped.length < 2) return false
    if (!/^[A-Z][A-Z0-9\s'.-]+$/.test(stripped) || !isUppercaseHeavy(stripped)) return false
    if (SCENE_HEADING_REGEX.test(trimmed) || isTransitionLine(trimmed) || isSectionMarkerLine(trimmed)) return false
    const next = nextNonEmptyLine(lineIndex)
    if (!next || SCENE_HEADING_REGEX.test(next) || isTransitionLine(next)) return false
    if (trimmed.endsWith(':') || isParentheticalLine(next) || /[a-z]/.test(next) || /[.?!…]$/.test(next)) return true
    const prevType = prevNonEmptyType()
    return prevType === 'dialogue' || prevType === 'parenthetical' || prevType === 'character'
  }

  const isCharacterLineShallow = (line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.length > 42) return false
    const stripped = trimmed
      .replace(/:\s*$/, '')
      .replace(/\s*\([^)]*\)\s*$/, '')
      .trim()
    return isUppercaseHeavy(stripped) && /^[A-Z][A-Z0-9\s'.-]+$/.test(stripped)
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

    if (isSectionMarkerLine(trimmed)) {
      appendScreenplayElement(current, 'section', trimmed.toUpperCase())
      dialogueMode = false
      continue
    }

    if (isCharacterLineShallow(trimmed) && isCharacterLine(trimmed, i)) {
      const charName = trimmed
        .replace(/:\s*$/, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .trim()
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

    if (/^[A-Z][A-Z0-9 '.:-]+$/.test(trimmed) && trimmed.length <= 60 && i + 1 < lines.length && isParentheticalLine(lines[i + 1])) {
      const charName = trimmed.replace(/:\s*$/, '')
      appendScreenplayElement(current, 'character', charName)
      if (!current.characters.includes(charName)) current.characters.push(charName)
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
 * Extract text from PDF using pdfjs-dist, then run heuristic parser.
 * Returns ParsedScene[].
 * NOTE: Only works for text-based PDFs. Scanned PDFs are not supported.
 */
async function parsePdf(arrayBuffer, filename) {
  let pdfjsLib
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs')
  } catch {
    throw new Error('PDF parser dependency failed to load.')
  }

  let pdfDoc
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    pdfDoc = await loadingTask.promise
  } catch (err) {
    throw new Error(`PDF parse error: ${err?.message || 'Unable to read PDF'}`)
  }

  const lines = []

  for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber++) {
    const page = await pdfDoc.getPage(pageNumber)
    const content = await page.getTextContent()
    const groupedByY = new Map()

    for (const item of content.items || []) {
      if (!item || typeof item.str !== 'string') continue
      const y = Math.round((item.transform?.[5] || 0) * 10) / 10
      const bucket = groupedByY.get(y) || []
      bucket.push({
        x: item.transform?.[4] || 0,
        text: item.str,
      })
      groupedByY.set(y, bucket)
    }

    const pageLines = Array.from(groupedByY.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items
        .sort((a, b) => a.x - b.x)
        .map(i => i.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim())
      .filter(Boolean)

    lines.push(...pageLines, '')
  }

  return parseTxt(lines.join('\n'), filename)
}

async function parseDocx(arrayBuffer, filename) {
  let mammoth
  try {
    mammoth = await import('mammoth')
  } catch {
    throw new Error('DOCX parser dependency failed to load.')
  }

  try {
    const { value } = await mammoth.extractRawText({ arrayBuffer })
    return parseTxt(normalizeImportedText(value), filename)
  } catch (err) {
    throw new Error(`DOCX parse error: ${err?.message || 'Unable to read DOCX'}`)
  }
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
  const ext = getScriptFileExtension(name)
  const warnings = []
  let scenes = []
  let format = 'unknown'

  try {
    if (!isSupportedScriptExtension(ext)) {
      throw new Error(`Unsupported file type ".${ext || 'unknown'}". Supported types: ${SUPPORTED_EXTENSIONS_LIST}.`)
    }

    if (ext === 'fountain') {
      format = SCRIPT_FORMAT_LABELS.fountain
      const text = typeof file.text === 'string' ? file.text : await file.text()
      const normalizedText = normalizeImportedText(text, { stripBom: true })
      scenes = await parseFountain(normalizedText, name)
    } else if (ext === 'fdx') {
      format = SCRIPT_FORMAT_LABELS.fdx
      const text = typeof file.text === 'string' ? file.text : await file.text()
      const normalizedText = normalizeImportedText(text, { stripBom: true })
      scenes = parseFdx(normalizedText, name)
    } else if (ext === 'txt') {
      format = SCRIPT_FORMAT_LABELS.txt
      const text = typeof file.text === 'string' ? file.text : await file.text()
      const normalizedText = normalizeImportedText(text, { stripBom: true })
      scenes = parseTxt(normalizedText, name)
      warnings.push('Plain text parsing uses heuristics. Review all imported scenes carefully.')
    } else if (ext === 'md') {
      format = SCRIPT_FORMAT_LABELS.md
      const text = typeof file.text === 'string' ? file.text : await file.text()
      const normalizedText = normalizeImportedText(text, { stripBom: true })
      scenes = parseTxt(normalizedText, name)
      warnings.push('Markdown import uses plain-text heuristics. Review all imported scenes carefully.')
    } else if (ext === 'pdf') {
      format = SCRIPT_FORMAT_LABELS.pdf
      warnings.push(
        'PDF import accuracy depends on how the PDF was generated. ' +
        'Scanned PDFs are not supported. Review all imported scenes carefully.'
      )
      const buffer = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : file.arrayBuffer
      scenes = await parsePdf(buffer, name)
    } else if (ext === 'docx') {
      format = SCRIPT_FORMAT_LABELS.docx
      warnings.push('DOCX import converts content to plain text before parsing. Review all imported scenes carefully.')
      const buffer = typeof file.arrayBuffer === 'function'
        ? await file.arrayBuffer()
        : file.arrayBuffer
      scenes = await parseDocx(buffer, name)
    } else {
      throw new Error(`Unsupported file type ".${ext}". Supported types: ${SUPPORTED_EXTENSIONS_LIST}.`)
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
