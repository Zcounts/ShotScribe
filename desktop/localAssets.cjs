const fs = require('fs/promises')
const path = require('path')
let electronShell = null
try {
  electronShell = require('electron').shell
} catch {
  electronShell = null
}

const DATA_URL_PATTERN = /^data:([^;,]+)?(;base64)?,(.*)$/s

function getProjectAssetFolder(projectFilePath) {
  if (!projectFilePath || typeof projectFilePath !== 'string') {
    throw new Error('A saved .shotlist project path is required for local assets.')
  }
  const parsed = path.parse(projectFilePath)
  if (!parsed.dir || !parsed.name) {
    throw new Error('Invalid project file path for local assets.')
  }
  return path.join(parsed.dir, `${parsed.name}.assets`)
}

function sanitizeFileName(fileName, fallback = 'asset.webp') {
  const base = path.basename(String(fileName || fallback)).replace(/[^a-z0-9_.-]+/gi, '-')
  return base && base !== '.' && base !== '..' ? base : fallback
}

function assertSafeRelativePath(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error('Invalid local asset relative path.')
  }
  return normalized
}

function decodeAssetData(arrayBufferOrBase64) {
  if (Buffer.isBuffer(arrayBufferOrBase64)) return arrayBufferOrBase64
  if (arrayBufferOrBase64 instanceof ArrayBuffer) return Buffer.from(arrayBufferOrBase64)
  if (ArrayBuffer.isView(arrayBufferOrBase64)) {
    return Buffer.from(arrayBufferOrBase64.buffer, arrayBufferOrBase64.byteOffset, arrayBufferOrBase64.byteLength)
  }
  if (typeof arrayBufferOrBase64 !== 'string') {
    throw new Error('Unsupported local asset data payload.')
  }
  const match = arrayBufferOrBase64.match(DATA_URL_PATTERN)
  if (match) {
    const encoded = match[3] || ''
    return match[2] ? Buffer.from(encoded, 'base64') : Buffer.from(decodeURIComponent(encoded), 'utf8')
  }
  return Buffer.from(arrayBufferOrBase64, 'base64')
}

function mimeFromFileName(fileName) {
  const ext = path.extname(String(fileName || '')).toLowerCase()
  if (ext === '.webp') return 'image/webp'
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  return 'application/octet-stream'
}

function fileNameFromDownload(url, suggestedFileName) {
  const cleanSuggested = sanitizeFileName(suggestedFileName || '')
  if (cleanSuggested) return cleanSuggested
  try {
    const parsed = new URL(url)
    return sanitizeFileName(path.basename(parsed.pathname), 'downloaded-image')
  } catch {
    return 'downloaded-image'
  }
}

async function ensureProjectAssetFolder(projectFilePath) {
  const assetFolder = getProjectAssetFolder(projectFilePath)
  await fs.mkdir(assetFolder, { recursive: true })
  return { success: true, assetFolder }
}

async function writeLocalAsset(projectFilePath, fileName, arrayBufferOrBase64) {
  const { assetFolder } = await ensureProjectAssetFolder(projectFilePath)
  const safeFileName = sanitizeFileName(fileName)
  const buffer = decodeAssetData(arrayBufferOrBase64)
  if (!buffer.length) throw new Error('Local asset payload is empty.')
  const absolutePath = path.join(assetFolder, safeFileName)
  await fs.writeFile(absolutePath, buffer)
  return {
    success: true,
    fileName: safeFileName,
    relativePath: safeFileName,
    absolutePath,
    bytes: buffer.length,
    mime: mimeFromFileName(safeFileName),
  }
}

async function readLocalAsset(projectFilePath, relativePath) {
  const assetFolder = getProjectAssetFolder(projectFilePath)
  const safeRelativePath = assertSafeRelativePath(relativePath)
  const absolutePath = path.join(assetFolder, safeRelativePath)
  const resolvedFolder = path.resolve(assetFolder)
  const resolvedFile = path.resolve(absolutePath)
  if (!resolvedFile.startsWith(resolvedFolder + path.sep) && resolvedFile !== resolvedFolder) {
    throw new Error('Local asset path escapes the project asset folder.')
  }
  const buffer = await fs.readFile(resolvedFile)
  const mime = mimeFromFileName(safeRelativePath)
  return {
    success: true,
    relativePath: safeRelativePath,
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    bytes: buffer.length,
    mime,
  }
}

async function downloadUrlToLocalAsset(projectFilePath, url, suggestedFileName) {
  if (!/^https?:\/\//i.test(String(url || ''))) {
    throw new Error('Only http(s) image URLs can be migrated to local assets.')
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Image download failed (${response.status})`)
  const arrayBuffer = await response.arrayBuffer()
  const fileName = fileNameFromDownload(url, suggestedFileName)
  const writeResult = await writeLocalAsset(projectFilePath, fileName, Buffer.from(arrayBuffer))
  return {
    ...writeResult,
    mime: response.headers.get('content-type') || writeResult.mime,
    sourceUrl: url,
  }
}

async function revealProjectAssetsFolder(projectFilePath) {
  const { assetFolder } = await ensureProjectAssetFolder(projectFilePath)
  if (!electronShell?.openPath) throw new Error('Electron shell is unavailable.')
  await electronShell.openPath(assetFolder)
  return { success: true, assetFolder }
}

module.exports = {
  ensureProjectAssetFolder,
  writeLocalAsset,
  readLocalAsset,
  downloadUrlToLocalAsset,
  revealProjectAssetsFolder,
  getProjectAssetFolder,
}
