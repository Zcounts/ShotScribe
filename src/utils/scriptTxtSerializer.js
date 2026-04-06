/**
 * Serializes a ProseMirror-style screenplay document to plain text.
 *
 * Indentation follows standard US screenplay conventions:
 *   - Scene heading: ALL CAPS, flush left, blank line above (except first), blank line below
 *   - Action: flush left, blank line above
 *   - Character: ALL CAPS, ~22-space indent, blank line above
 *   - Parenthetical: ~16-space indent, wrapped in parens
 *   - Dialogue: ~10-space indent
 *   - Transition: ALL CAPS, flush left, blank line above/below
 *   - Centered: centered within a 60-char column
 */

function textFromNode(node) {
  if (!node || typeof node !== 'object' || !Array.isArray(node.content)) return ''
  return node.content
    .map((child) => (child?.type === 'text' ? String(child.text || '') : ''))
    .join('')
}

const IND_CHARACTER = ' '.repeat(22)
const IND_DIALOGUE = ' '.repeat(10)
const IND_PARENTHETICAL = ' '.repeat(16)
const LINE_WIDTH = 60

export function serializeScriptToTxt(scriptDocument) {
  if (!scriptDocument || !Array.isArray(scriptDocument.content) || scriptDocument.content.length === 0) {
    return ''
  }

  const nodes = scriptDocument.content
  const lines = []

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const text = textFromNode(node)
    const type = node.type
    const prevType = i > 0 ? nodes[i - 1].type : null

    if (type === 'scene_heading') {
      if (i > 0) lines.push('')
      lines.push(text.toUpperCase())
      lines.push('')
    } else if (type === 'action') {
      if (prevType !== 'scene_heading' && i > 0) lines.push('')
      lines.push(text)
    } else if (type === 'character') {
      lines.push('')
      lines.push(IND_CHARACTER + text.toUpperCase())
    } else if (type === 'dialogue') {
      lines.push(IND_DIALOGUE + text)
    } else if (type === 'parenthetical') {
      const raw = text.trim()
      const withParens = (raw.startsWith('(') && raw.endsWith(')')) ? raw : `(${raw})`
      lines.push(IND_PARENTHETICAL + withParens)
    } else if (type === 'transition') {
      if (i > 0) lines.push('')
      lines.push(text.toUpperCase())
      lines.push('')
    } else if (type === 'centered') {
      if (i > 0) lines.push('')
      const trimmed = text.trim()
      const padding = Math.max(0, Math.floor((LINE_WIDTH - trimmed.length) / 2))
      lines.push(' '.repeat(padding) + trimmed)
    } else {
      // Fallback for production_note, shot_note, or unknown future types
      if (i > 0) lines.push('')
      lines.push(text)
    }
  }

  // Trim leading/trailing blank lines
  while (lines.length && lines[0] === '') lines.shift()
  while (lines.length && lines[lines.length - 1] === '') lines.pop()

  return lines.join('\n')
}

export function downloadScriptAsTxt(scriptDocument, projectName) {
  const text = serializeScriptToTxt(scriptDocument)
  const safeName = (projectName || 'script').replace(/[^a-z0-9]/gi, '_')
  const filename = `${safeName}_script.txt`
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
