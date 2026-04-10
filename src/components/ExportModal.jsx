import React, { useEffect, useState } from 'react'
import { downloadScriptAsTxt } from '../utils/scriptTxtSerializer'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import useStore, { CALLSHEET_COLUMN_DEFINITIONS, getShotLetter } from '../store'
import { normalizeStoryboardDisplayConfig } from '../storyboardDisplayConfig'
import { buildDayScheduleRows, deriveDayCastRows, deriveDayCrewRows } from '../utils/callsheetSelectors'
import { platformService } from '../services/platformService'

let mobileExportServicePromise = null
let reactPdfRendererPromise = null

async function getMobileExportService() {
  if (!mobileExportServicePromise) {
    mobileExportServicePromise = import('../services/mobile/mobileExportService.js')
  }
  return mobileExportServicePromise
}

async function getReactPdfRenderer() {
  if (!reactPdfRendererPromise) {
    reactPdfRendererPromise = import('@react-pdf/renderer')
  }
  return reactPdfRendererPromise
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Column metadata mirroring ShotlistTab's BUILTIN_COLUMNS (labels + relative widths).
// Used by buildShotlistPrintHtml to render the correct columns in the correct order.
const PRINT_BUILTIN_COLUMNS = [
  { key: 'checked',        label: 'X',                 width: 36  },
  { key: 'displayId',      label: 'SHOT#',             width: 54  },
  { key: '__int__',        label: 'I/E',               width: 68  },
  { key: '__dn__',         label: 'D/N',               width: 62  },
  { key: 'cast',           label: 'CAST',              width: 130 },
  { key: 'specs.type',     label: 'ANGLE',             width: 96  },
  { key: 'focalLength',    label: 'LENS',              width: 64  },
  { key: 'specs.equip',    label: 'EQUIPMENT',         width: 100 },
  { key: 'specs.move',     label: 'MOVEMENT',          width: 96  },
  { key: 'specs.size',     label: 'COVERAGE',          width: 110 },
  { key: 'notes',          label: 'NOTES',             width: 160 },
  { key: 'scriptTime',     label: 'SCRIPT TIME',       width: 84  },
  { key: 'setupTime',      label: 'SETUP TIME',        width: 84  },
  { key: 'predictedTakes', label: 'PREDIC# OF TAKES',  width: 104 },
  { key: 'shootTime',      label: 'SHOOT TIME',        width: 84  },
  { key: 'takeNumber',     label: 'TAKE #',            width: 60  },
]

function getCellValue(colKey, shot, scene) {
  if (colKey === 'checked')    return shot.checked ? '\u2713' : ''
  if (colKey === 'displayId')  return shot.displayId || ''
  if (colKey === '__int__')    return shot.intOrExt ?? ''
  if (colKey === '__dn__')     return shot.dayNight ?? ''
  if (colKey.startsWith('specs.')) return shot.specs?.[colKey.split('.')[1]] ?? ''
  return shot[colKey] ?? ''
}

// ── Image pre-fetch utilities (cross-origin canvas-taint fix) ─────────────────
//
// html2canvas taints the canvas when it encounters cross-origin <img> elements
// (e.g. Convex signed HTTPS URLs). Converting those URLs to base64 data URLs
// before export removes the cross-origin constraint entirely.

/**
 * Fetch a remote URL and return it as a base64 data URL.
 * URLs that are already data: or blob: are returned unchanged.
 */
async function toBase64DataURL(url) {
  if (!url || url.startsWith('data:') || url.startsWith('blob:')) return url
  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch (err) {
    console.warn('[PDF Export] Could not pre-fetch image, falling back to original URL:', url, err.message)
    return url
  }
}

/**
 * Collect all remote image URLs from store shots and pre-fetch them as base64.
 * Returns a plain object mapping { originalUrl → base64DataUrl }.
 */
async function preloadShotImages() {
  const { getStoryboardScenes } = useStore.getState()
  const scenes = getStoryboardScenes()
  const urls = new Set()
  scenes.forEach(scene => {
    scene.shots.forEach(shot => {
      if (shot.image && !shot.image.startsWith('data:') && !shot.image.startsWith('blob:')) {
        urls.add(shot.image)
      }
    })
  })
  if (urls.size === 0) return {}
  console.log(`[PDF Export] Pre-fetching ${urls.size} image(s) to base64 (Electron path)…`)
  const entries = await Promise.all(
    [...urls].map(async url => [url, await toBase64DataURL(url)])
  )
  return Object.fromEntries(entries)
}

/**
 * Collect all remote image URLs from a set of DOM elements and pre-fetch them
 * as base64. Returns a plain object mapping { originalUrl → base64DataUrl }.
 */
async function preloadDomImages(elements) {
  const urls = new Set()
  elements.forEach(el => {
    el.querySelectorAll('img[src]').forEach(img => {
      const src = img.getAttribute('src')
      if (src && !src.startsWith('data:') && !src.startsWith('blob:')) {
        urls.add(src)
      }
    })
  })
  if (urls.size === 0) return {}
  console.log(`[PDF Export] Pre-fetching ${urls.size} image(s) to base64 (browser path)…`)
  const entries = await Promise.all(
    [...urls].map(async url => [url, await toBase64DataURL(url)])
  )
  return Object.fromEntries(entries)
}

// ── Storyboard print HTML: built from store data ──────────────────────────────
//
// Generates a self-contained HTML document with one .page-doc div per logical
// storyboard page (each scene paginates its shots into groups of columnCount×2).
// Always uses a hardcoded light theme — white background, black text.
// No reference to the live app DOM.

function buildStoryboardPrintHtml(imageMap = {}) {
  const { getStoryboardScenes, columnCount, projectName, storyboardDisplayConfig } = useStore.getState()
  const scenes = getStoryboardScenes()
  const cols = Math.max(2, Math.min(4, columnCount || 4))
  const cardsPerPage = cols * 2  // two rows of cards per page
  const config = normalizeStoryboardDisplayConfig(storyboardDisplayConfig)
  const useDisplayConfig = !!config.useVisibilitySettingsInPdf
  const visibleInfo = config.visibleInfo || {}
  const cardAspectRatio = config.aspectRatio === '2.39:1'
    ? '2.39 / 1'
    : String(config.aspectRatio || '16:9').replace(':', ' / ')

  const pageDivs = []

  scenes.forEach((scene, sceneIdx) => {
    const sceneNum = sceneIdx + 1
    const shots = scene.shots.map((shot, idx) => ({
      ...shot,
      displayId: `${sceneNum}${getShotLetter(idx)}`,
    }))

    // Group shots into pages; always produce at least one (possibly empty) page.
    const groups = shots.length > 0
      ? Array.from(
          { length: Math.ceil(shots.length / cardsPerPage) },
          (_, i) => shots.slice(i * cardsPerPage, (i + 1) * cardsPerPage)
        )
      : [[]]

    const cameras = scene.cameras || [{ name: 'Camera 1', body: 'fx30' }]
    const cameraHtml = cameras.map(c => {
      const swatchColor = escapeHtml(c.color || '#4ade80')
      return `<span class="hdr-cam-row"><span class="cam-swatch" style="background:${swatchColor};"></span>${escapeHtml(c.name)} = ${escapeHtml(c.body || '')}</span>`
    }).join('\n')
    const notesHtml = scene.pageNotes
      ? `<div class="pg-notes">${escapeHtml(scene.pageNotes)}</div>`
      : ''

    groups.forEach((pageShots, pageIdx) => {
      const isContinuation = pageIdx > 0
      const continuationHtml = isContinuation
        ? `<span class="continuation">(CONTINUED &mdash; PAGE ${pageIdx + 1})</span>`
        : ''

      // Build card HTML for each shot in this page
      const cardHtmlItems = pageShots.map(shot => {
        const imgHtml = shot.image
          ? `<img src="${imageMap[shot.image] || shot.image}" alt="${escapeHtml(shot.displayId)}">`
          : `<div class="no-img">No image</div>`

        const specColumns = ['size', 'type', 'move', 'equip'].filter(key => !useDisplayConfig || visibleInfo[key] !== false)
        const specHeaderHtml = specColumns.map(key => `<th>${escapeHtml(key.toUpperCase())}</th>`).join('')
        const specValueHtml = specColumns.map(key => `<td>${escapeHtml(shot.specs?.[key] || '')}</td>`).join('')
        const showCamera = !useDisplayConfig || visibleInfo.camera !== false
        const showLens = !useDisplayConfig || visibleInfo.lens !== false
        const showNotes = !useDisplayConfig || visibleInfo.notes !== false
        const showSetup = !useDisplayConfig || visibleInfo.setupTime !== false
        const showShotTime = !useDisplayConfig || visibleInfo.shotTime !== false

        return `<div class="shot-card" style="border-color:${escapeHtml(shot.color || '#4ade80')};">
  <div class="card-hdr">
    <span class="sid">${escapeHtml(shot.displayId)}${showCamera ? ` &mdash; ${escapeHtml(shot.cameraName || '')}` : ''}</span>
    ${showLens ? `<span class="fl">${escapeHtml(shot.focalLength || '')}</span>` : ''}
  </div>
  <div class="card-img" style="border-color:${escapeHtml(shot.color || '#4ade80')};${useDisplayConfig ? `aspect-ratio:${escapeHtml(cardAspectRatio)};` : ''}">${imgHtml}</div>
  ${specColumns.length ? `<table class="specs-tbl">
    <thead><tr>${specHeaderHtml}</tr></thead>
    <tbody><tr>
      ${specValueHtml}
    </tr></tbody>
  </table>` : ''}
  ${showNotes ? `<div class="card-notes">${escapeHtml(shot.notes || '')}</div>` : ''}
  ${(showSetup || showShotTime) ? `<div class="card-time-row">${showSetup ? `<span>SETUP ${escapeHtml(shot.setupTime || '')}</span>` : ''}${showShotTime ? `<span>SHOT ${escapeHtml(shot.shootTime || '')}</span>` : ''}</div>` : ''}
</div>`
      })

      // Pad to a complete row if needed (empty card placeholders)
      while (cardHtmlItems.length % cols !== 0) {
        cardHtmlItems.push('<div class="shot-card-empty"></div>')
      }

      pageDivs.push(`<div class="page-doc">
  <div class="page-hdr">
    <div class="hdr-left">
      <span class="hdr-title">${escapeHtml(scene.sceneLabel)} | ${escapeHtml(scene.location)} | ${escapeHtml(scene.intOrExt)} &middot; ${escapeHtml(scene.dayNight || 'DAY')}</span>
      ${continuationHtml}
    </div>
    <div class="hdr-center">
      ${notesHtml}
    </div>
    <div class="hdr-right">
      <div class="hdr-cam">${cameraHtml}</div>
    </div>
  </div>
  <div class="card-grid cols-${cols}">
    ${cardHtmlItems.join('\n    ')}
  </div>
</div>`)
    })
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Storyboard — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page {
  size: A4 landscape;
  margin: 8mm 10mm 14mm;
  @bottom-left { content: "${escapeHtml(projectName || 'Untitled')}"; font-family: monospace; font-size: 6pt; color: #888; }
  @bottom-right { content: counter(page); font-family: monospace; font-size: 6pt; color: #888; font-weight: 700; }
}
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #fff;
  color: #111;
  font-family: system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
}
.page-doc {
  width: 100%;
  height: 188mm;
  display: flex;
  flex-direction: column;
  break-after: page;
  page-break-after: always;
  overflow: hidden;
}
.page-doc:last-child {
  break-after: avoid;
  page-break-after: avoid;
}
.page-hdr {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 4px 0 5px;
  border-bottom: 2.5px solid #111;
  margin-bottom: 5px;
  flex-shrink: 0;
  gap: 12px;
}
.hdr-left { min-width: 0; }
.hdr-title {
  font-size: 13pt;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.continuation {
  display: block;
  font-size: 8pt;
  font-weight: 400;
  color: #777;
  margin-top: 2px;
}
.hdr-center { text-align: left; }
.hdr-right { text-align: right; }
.hdr-cam {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.hdr-cam-row {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 9pt;
  font-weight: 600;
  font-family: monospace;
  color: #555;
}
.cam-swatch {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
  border: 0.5px solid rgba(0,0,0,0.2);
}
.pg-notes {
  font-size: 8pt;
  color: #666;
  white-space: pre-line;
  text-align: left;
}
.card-grid {
  display: grid;
  flex: 1;
  gap: 5px;
  min-height: 0;
  grid-template-rows: 1fr 1fr;
  align-content: stretch;
}
.cols-4 { grid-template-columns: repeat(4, 1fr); }
.cols-3 { grid-template-columns: repeat(3, 1fr); }
.cols-2 { grid-template-columns: repeat(2, 1fr); }
.shot-card {
  display: flex;
  flex-direction: column;
  border: 2px solid #4ade80;
  border-radius: 2px;
  overflow: hidden;
  background: #fff;
  min-height: 0;
}
.shot-card-empty {
  border: 1px dashed #e8e4db;
  border-radius: 2px;
}
.card-hdr {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 5px;
  background: #f0ede4;
  flex-shrink: 0;
}
.sid { font-size: 9pt; font-weight: 700; font-family: monospace; }
.fl  { font-size: 9pt; font-weight: 400; font-family: monospace; color: #666; }
.card-img {
  flex: 0 0 52%;
  border-top: 2px solid #4ade80;
  border-bottom: 1px solid #e0dbd0;
  overflow: hidden;
  line-height: 0;
}
.card-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.no-img {
  width: 100%;
  height: 100%;
  background: #e8e4db;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 8pt;
  color: #999;
  font-family: monospace;
}
.specs-tbl {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  flex-shrink: 0;
}
.specs-tbl th {
  background: #f8f7f3;
  color: #888;
  font-size: 7pt;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.08em;
  text-align: center;
  padding: 2px 3px;
  border-bottom: 1px solid #e0dbd0;
  border-right: 1px solid #e0dbd0;
}
.specs-tbl th:last-child { border-right: none; }
.specs-tbl td {
  font-size: 8pt;
  font-family: monospace;
  text-align: center;
  padding: 2px 3px;
  border-right: 1px solid #e0dbd0;
  white-space: normal;
  word-break: break-word;
  vertical-align: top;
}
.specs-tbl td:last-child { border-right: none; }
.card-notes {
  flex: 1 1 0;
  padding: 3px 5px;
  font-size: 8.5pt;
  white-space: pre-wrap;
  word-break: break-word;
  color: #333;
  overflow: hidden;
  min-height: 0;
}
.card-time-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border-top: 1px solid #ddd;
  padding: 4px 6px 3px;
  font-size: 6.8pt;
  font-weight: 700;
  color: #5f6368;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}
</style>
</head>
<body>
${pageDivs.join('\n')}
</body>
</html>`
}

// ── Schedule print HTML: built from store data ────────────────────────────────
//
// Generates a self-contained HTML document for the shooting schedule.
// Each shooting day is a section with shot blocks, projected timeline (if start
// time is set), and totals at the bottom. Uses A4 portrait orientation.
// Clearly labels all projected times as estimates.

function parseScheduleMinutes(str) {
  const s = String(str || '').trim()
  if (!s) return 0
  return Math.max(0, parseFloat(s) || 0)
}

function scheduleFormatMins(totalMins) {
  if (!totalMins || totalMins <= 0) return '—'
  const h = Math.floor(totalMins / 60)
  const m = Math.round(totalMins % 60)
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

function scheduleParseStartTime(timeStr) {
  if (!timeStr || !timeStr.includes(':')) return null
  const [h, m] = timeStr.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return null
  return h * 60 + m
}

function scheduleFormatTimeOfDay(totalMins) {
  const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h24 = Math.floor(safeTotal / 60)
  const m = safeTotal % 60
  const h12 = h24 % 12 || 12
  const ampm = h24 < 12 ? 'AM' : 'PM'
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
}

function scheduleFormatDate(isoDate) {
  if (!isoDate) return ''
  try {
    const d = new Date(isoDate + 'T12:00:00')
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  } catch {
    return isoDate
  }
}

function buildSchedulePrintHtml(dayIdxFilter = null) {
  const { schedule, scenes, projectName } = useStore.getState()

  // Build a fast shot lookup: shotId → { shot, scene, displayId }
  const shotMap = new Map()
  scenes.forEach((scene, sceneIdx) => {
    scene.shots.forEach((shot, shotIdx) => {
      shotMap.set(shot.id, {
        shot,
        scene,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
      })
    })
  })

  const dayDivs = []

  schedule.forEach((day, dayIdx) => {
    if (dayIdxFilter !== null && !dayIdxFilter.includes(dayIdx)) return
    const formattedDate = scheduleFormatDate(day.date)
    const startMins = scheduleParseStartTime(day.startTime)
    const hasTimeline = startMins !== null

    let cumulativeMins = 0
    let totalShootMins = 0
    let totalSetupMins = 0
    let totalBreakMins = 0

    const blockRows = (day.blocks || day.shotBlocks || []).map(block => {
      const projectedTime = hasTimeline ? startMins + cumulativeMins : null

      // ── Break / special block ───────────────────────────────────────
      if (block.type === 'break' || block.type === 'move' || block.type === 'meal' || block.type === 'travel') {
        const blockMins = parseScheduleMinutes(block.duration ?? block.breakDuration ?? block.blockDuration ?? 0)
        totalBreakMins += blockMins
        cumulativeMins += blockMins

        const timelineCell = hasTimeline
          ? (projectedTime !== null
              ? `<td class="tl-cell"><span class="est-badge">~ ${escapeHtml(scheduleFormatTimeOfDay(projectedTime))}</span><br><span class="est-label">EST.</span></td>`
              : `<td class="tl-cell">—</td>`)
          : ''

        const blockIcon = block.type === 'break' ? '⏸' : block.type === 'move' ? '↗' : block.type === 'meal' ? '☕' : '●'
        const blockLabel = block.label || block.breakName || block.blockName || (block.type === 'break' ? 'Break' : block.type)

        return `<tr class="break-row">
          ${timelineCell}
          <td colspan="6" class="break-name-cell">
            <span class="break-icon">${blockIcon}</span>
            <strong>${escapeHtml(blockLabel)}</strong>
            ${blockMins > 0 ? `<span class="break-dur">${blockMins}m</span>` : ''}
          </td>
        </tr>`
      }

      // ── Shot block ───────────────────────────────────────────────────
      const found = shotMap.get(block.shotId)

      // Read times from shot data (single source of truth on the shot object)
      const shootMins = found ? parseScheduleMinutes(found.shot.shootTime) : 0
      const setupMins = found ? parseScheduleMinutes(found.shot.setupTime) : 0
      totalShootMins += shootMins
      totalSetupMins += setupMins
      cumulativeMins += shootMins + setupMins

      let timelineCell = ''
      if (hasTimeline) {
        timelineCell = projectedTime !== null
          ? `<td class="tl-cell"><span class="est-badge">~ ${escapeHtml(scheduleFormatTimeOfDay(projectedTime))}</span><br><span class="est-label">EST.</span></td>`
          : `<td class="tl-cell">—</td>`
      }

      if (!found) {
        return `<tr class="block-row deleted-row">
          ${hasTimeline ? '<td class="tl-cell"></td>' : ''}
          <td colspan="6"><em style="color:#888">Shot deleted — remove this entry</em></td>
        </tr>`
      }

      const { shot, scene, displayId } = found
      const intOrExt = shot.intOrExt || scene.intOrExt || ''
      const dayNight = shot.dayNight || scene.dayNight || ''
      const castStr = shot.cast || '—'

      return `<tr class="block-row">
        ${timelineCell}
        <td class="shot-id">${escapeHtml(displayId)}</td>
        <td class="subject-cell">
          ${shot.notes ? `<span class="notes-txt">${escapeHtml(shot.notes)}</span><br>` : ''}
          <span class="scene-loc">${escapeHtml(scene.sceneLabel)}${scene.location ? ` · ${escapeHtml(scene.location)}` : ''}</span>
        </td>
        <td class="badge-cell">${intOrExt ? `<span class="bdg">${escapeHtml(intOrExt)}</span>` : ''}${dayNight ? ` <span class="bdg">${escapeHtml(dayNight)}</span>` : ''}</td>
        <td class="time-cell">${shootMins > 0 ? escapeHtml(String(shootMins)) + 'm' : '—'}</td>
        <td class="time-cell">${setupMins > 0 ? escapeHtml(String(setupMins)) + 'm' : '—'}</td>
        <td class="cast-cell">${escapeHtml(castStr)}</td>
      </tr>`
    })

    const totalMins = totalShootMins + totalSetupMins + totalBreakMins
    const hasTotals = totalMins > 0

    const headerCols = hasTimeline
      ? `<th class="tl-th">PROJECTED TIME<br><span style="font-weight:400;font-size:7pt;color:#666">ESTIMATE ONLY</span></th><th>SHOT</th><th>NOTES / SCENE</th><th>I/E · D/N</th><th>SHOOT</th><th>SETUP</th><th>CAST</th>`
      : `<th>SHOT</th><th>NOTES / SCENE</th><th>I/E · D/N</th><th>SHOOT</th><th>SETUP</th><th>CAST</th>`

    // Columns (no timeline): shot | subject | badge | shoot | setup | cast  = 6
    // Columns (timeline):    tl  | shot | subject | badge | shoot | setup | cast = 7
    // Totals row spans: [tl?] + [shot+subject+badge=3 cols] + shoot + setup + cast
    const totalsRow = hasTotals ? `
      <tr class="totals-row">
        ${hasTimeline ? '<td></td>' : ''}
        <td colspan="3" style="text-align:right;padding-right:6px">
          <strong>DAY TOTALS</strong>
        </td>
        <td class="time-cell total-val">${totalShootMins > 0 ? scheduleFormatMins(totalShootMins) : '—'}</td>
        <td class="time-cell total-val">${totalSetupMins > 0 ? scheduleFormatMins(totalSetupMins) : '—'}</td>
        <td><strong>${scheduleFormatMins(totalMins)}</strong> combined${totalBreakMins > 0 ? ` <span style="font-weight:400;color:#666;font-size:7.5pt">(incl. ${scheduleFormatMins(totalBreakMins)} breaks)</span>` : ''}</td>
      </tr>` : ''

    const callTimeStr = day.startTime
      ? `<span class="call-time">Call: ${escapeHtml(day.startTime)}</span>`
      : ''

    const basecampStr = day.basecamp
      ? `<span class="day-basecamp">BASECAMP: ${escapeHtml(day.basecamp)}</span>`
      : ''

    const dayBlocks = day.blocks || day.shotBlocks || []
    const shotCount = dayBlocks.filter(b => b.shotId).length
    const breakCount = dayBlocks.filter(b => b.type === 'break' || b.type === 'move' || b.type === 'meal' || b.type === 'travel').length
    const countStr = `${shotCount} SHOT${shotCount !== 1 ? 'S' : ''}${breakCount > 0 ? ` · ${breakCount} BREAK${breakCount !== 1 ? 'S' : ''}` : ''}`

    dayDivs.push(`
<div class="day-section">
  <div class="day-header">
    <div class="day-title">
      <span class="day-num">Day ${dayIdx + 1}</span>
      ${formattedDate ? `<span class="day-date">${escapeHtml(formattedDate)}</span>` : '<span class="day-date no-date">No date set</span>'}
      ${callTimeStr}
      ${basecampStr}
    </div>
    <span class="shot-count">${countStr}</span>
  </div>
  ${dayBlocks.length === 0
    ? '<p class="no-shots">No shots scheduled for this day.</p>'
    : `<table>
    <colgroup>
      ${hasTimeline ? '<col style="width:80px">' : ''}
      <col style="width:36px">
      <col style="width:auto">
      <col style="width:70px">
      <col style="width:44px">
      <col style="width:44px">
      <col style="width:110px">
    </colgroup>
    <thead><tr>${headerCols}</tr></thead>
    <tbody>
      ${blockRows.join('\n      ')}
      ${totalsRow}
    </tbody>
  </table>`}
</div>`)
  })

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Shooting Schedule — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page { size: A4; margin: 10mm 10mm 12mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #fff;
  color: #111;
  font-family: 'Courier New', Courier, monospace;
  font-size: 8pt;
}
.doc-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 5px;
  border-bottom: 2px solid #111;
  margin-bottom: 10px;
}
.doc-title-main {
  font-size: 13pt;
  font-weight: 900;
  letter-spacing: -0.01em;
}
.doc-title-sub {
  font-size: 7.5pt;
  color: #444;
}
.day-section {
  margin-bottom: 12px;
}
.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f5f3ee;
  color: #111;
  padding: 4px 8px;
  border: 1px solid #bbb;
  border-radius: 2px 2px 0 0;
  margin-bottom: 0;
}
.day-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.day-num {
  font-size: 10pt;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.day-date {
  font-size: 8pt;
  font-weight: 400;
  color: #444;
}
.no-date { color: #999; font-style: italic; }
.call-time {
  font-size: 8pt;
  font-weight: 700;
  background: rgba(0,0,0,0.07);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.04em;
  color: #111;
}
.shot-count {
  font-size: 7.5pt;
  color: #555;
  letter-spacing: 0.06em;
}
.no-shots {
  padding: 7px 8px;
  font-style: italic;
  color: #666;
  border: 1px solid #e5e5e5;
  border-top: none;
}
table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  border: 1px solid #ddd;
  border-top: none;
}
thead th {
  background: #eceae4;
  color: #444;
  font-size: 6.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-align: left;
  padding: 3px 5px;
  border-bottom: 1.5px solid #aaa;
  border-right: 1px solid #ccc;
  white-space: nowrap;
  overflow: hidden;
}
thead th:last-child { border-right: none; }
.tl-th { text-align: center; }
tbody td {
  padding: 2px 5px;
  border-bottom: 1px solid #e8e5e0;
  border-right: 1px solid #ebe8e2;
  vertical-align: middle;
  line-height: 1.3;
}
tbody td:last-child { border-right: none; }
tr.block-row:nth-child(even) td { background: #faf8f5; }
tr.block-row:nth-child(odd) td { background: #fff; }
tr.deleted-row td { background: #fff5f5; color: #ddd; }
.tl-cell {
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
}
.est-badge {
  display: inline-block;
  font-size: 8pt;
  font-weight: 700;
  color: #1d4ed8;
  letter-spacing: 0.02em;
}
.est-label {
  font-size: 5.5pt;
  color: #777;
  letter-spacing: 0.1em;
  font-weight: 400;
}
.shot-id {
  font-size: 9pt;
  font-weight: 900;
  vertical-align: middle;
  white-space: nowrap;
}
.subject-cell { font-size: 7.5pt; vertical-align: middle; }
.notes-txt { color: #444; font-style: italic; font-size: 7pt; display: block; }
.scene-loc { color: #666; font-size: 6.5pt; display: block; }
.badge-cell { white-space: nowrap; vertical-align: middle; }
.bdg {
  display: inline-block;
  padding: 0 3px;
  font-size: 6.5pt;
  font-weight: 700;
  border: 1px solid #ccc;
  border-radius: 2px;
  background: #f0ede8;
}
.time-cell {
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
  font-weight: 700;
  font-size: 8pt;
}
.cast-cell { font-size: 7.5pt; vertical-align: middle; }
.totals-row td {
  background: #ede9df !important;
  border-top: 1.5px solid #aaa;
  padding: 4px 5px;
  font-size: 8pt;
}
.total-val { font-weight: 700; color: #1a1a1a; }
.day-basecamp {
  font-size: 7.5pt;
  font-weight: 600;
  background: rgba(0,0,0,0.07);
  padding: 1px 5px;
  border-radius: 3px;
  letter-spacing: 0.02em;
  color: #111;
}
tr.break-row td {
  background: #fef9c3 !important;
  border-bottom: 1px solid #fde68a;
  border-right: 1px solid #fde68a;
}
.break-name-cell {
  padding: 2px 5px;
  font-size: 8pt;
}
.break-icon {
  margin-right: 4px;
}
.break-dur {
  display: inline-block;
  margin-left: 8px;
  font-size: 7.5pt;
  color: #555;
  background: #fde68a;
  padding: 0 4px;
  border-radius: 3px;
  font-weight: 600;
}
.footer {
  margin-top: 12px;
  border-top: 1px solid #ddd;
  padding-top: 5px;
  font-size: 7pt;
  color: #aaa;
  display: flex;
  justify-content: space-between;
}
@page {
  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
    font-family: 'Courier New', Courier, monospace;
    font-size: 7pt;
    color: #aaa;
  }
}
</style>
</head>
<body>
<div class="doc-title">
  <div>
    <div class="doc-title-main">SHOOTING SCHEDULE</div>
    <div class="doc-title-sub">${escapeHtml(projectName || 'Untitled Project')}</div>
  </div>
  <div class="doc-title-sub">${schedule.length} day${schedule.length !== 1 ? 's' : ''} · ${schedule.reduce((n, d) => n + (d.blocks || d.shotBlocks || []).filter(b => !!b.shotId).length, 0)} shots scheduled</div>
</div>

${dayDivs.join('\n')}

<div class="footer">
  <span>Generated by ShotScribe · ${escapeHtml(today)}</span>
  <span class="footer-page">Page <span class="page-num"></span></span>
</div>
</body>
</html>`
}

// ── Expanded Schedule print HTML ─────────────────────────────────────────────
//
// Enhanced day-by-day schedule: day header includes call time + projected wrap,
// shot rows show ID / scene / location / cast / shoot time / notes, and all
// non-shot blocks (break/move/meal/travel) are clearly labeled.
// Portrait A4, one section per shooting day.

function buildExpandedSchedulePrintHtml() {
  const { schedule, scenes, projectName } = useStore.getState()

  const shotMap = new Map()
  scenes.forEach((scene, sceneIdx) => {
    scene.shots.forEach((shot, shotIdx) => {
      shotMap.set(shot.id, {
        shot, scene,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
      })
    })
  })

  const dayDivs = []

  schedule.forEach((day, dayIdx) => {
    const startMins = scheduleParseStartTime(day.startTime)
    const dayBlocks = day.blocks || day.shotBlocks || []
    let cumulativeMins = 0
    let totalShootMins = 0
    let totalSetupMins = 0
    let totalBreakMins = 0

    // Pre-compute projected times
    const projections = dayBlocks.map(block => {
      const proj = startMins !== null ? startMins + cumulativeMins : null
      if (block.type === 'break' || block.type === 'move' || block.type === 'meal' || block.type === 'travel') {
        const mins = parseScheduleMinutes(block.duration ?? block.breakDuration ?? block.blockDuration ?? 0)
        totalBreakMins += mins
        cumulativeMins += mins
      } else {
        const found = shotMap.get(block.shotId)
        const shoot = found ? parseScheduleMinutes(found.shot.shootTime) : 0
        const setup = found ? parseScheduleMinutes(found.shot.setupTime) : 0
        totalShootMins += shoot
        totalSetupMins += setup
        cumulativeMins += shoot + setup
      }
      return proj
    })

    const wrapMins = startMins !== null ? startMins + cumulativeMins : null
    const totalMins = totalShootMins + totalSetupMins + totalBreakMins

    const blockRows = dayBlocks.map((block, i) => {
      const proj = projections[i]
      const projCell = startMins !== null
        ? `<td class="tl-cell">${proj !== null ? `<span class="est-badge">~${escapeHtml(scheduleFormatTimeOfDay(proj))}</span><br><span class="est-label">EST.</span>` : '—'}</td>`
        : ''

      if (block.type === 'break' || block.type === 'move' || block.type === 'meal' || block.type === 'travel') {
        const mins = parseScheduleMinutes(block.duration ?? block.breakDuration ?? block.blockDuration ?? 0)
        const icons = { break: '⏸', move: '↗', meal: '☕', travel: '✈' }
        const icon = icons[block.type] || '●'
        const lbl = block.label || block.breakName || block.blockName || block.type
        return `<tr class="special-row special-${escapeHtml(block.type)}">
          ${projCell}
          <td colspan="6" class="special-cell">
            <span class="special-icon">${icon}</span>
            <strong>${escapeHtml(lbl)}</strong>
            ${mins > 0 ? `<span class="special-dur">${mins}m</span>` : ''}
          </td>
        </tr>`
      }

      const found = shotMap.get(block.shotId)
      if (!found) {
        return `<tr class="block-row deleted-row">
          ${startMins !== null ? '<td class="tl-cell"></td>' : ''}
          <td colspan="6"><em style="color:#888">Shot deleted — remove this entry</em></td>
        </tr>`
      }

      const { shot, scene, displayId } = found
      const intOrExt = shot.intOrExt || scene.intOrExt || ''
      const dayNight = shot.dayNight || scene.dayNight || ''
      const shootMins = parseScheduleMinutes(shot.shootTime)

      return `<tr class="block-row">
        ${projCell}
        <td class="shot-id">${escapeHtml(displayId)}</td>
        <td class="subject-cell">
          ${shot.notes ? `<span class="notes-txt">${escapeHtml(shot.notes)}</span><br>` : ''}
          <span class="scene-loc">${escapeHtml(scene.sceneLabel)}${scene.location ? ` · ${escapeHtml(scene.location)}` : ''}</span>
        </td>
        <td class="badge-cell">${intOrExt ? `<span class="bdg">${escapeHtml(intOrExt)}</span>` : ''}${dayNight ? ` <span class="bdg">${escapeHtml(dayNight)}</span>` : ''}</td>
        <td class="time-cell">${shootMins > 0 ? `${shootMins}m` : '—'}</td>
        <td class="cast-cell">${escapeHtml(shot.cast || '—')}</td>
      </tr>`
    })

    const hasTimeline = startMins !== null
    const headerCols = hasTimeline
      ? `<th class="tl-th">TIME<br><span style="font-weight:400;font-size:6.5pt;color:#666">ESTIMATE</span></th><th>SHOT</th><th>NOTES / SCENE</th><th>I/E · D/N</th><th>SHOOT</th><th>CAST</th>`
      : `<th>SHOT</th><th>NOTES / SCENE</th><th>I/E · D/N</th><th>SHOOT</th><th>CAST</th>`

    const totalsRow = totalMins > 0 ? `<tr class="totals-row">
      ${hasTimeline ? '<td></td>' : ''}
      <td colspan="2" style="text-align:right;padding-right:6px"><strong>DAY TOTALS</strong></td>
      <td></td>
      <td class="time-cell total-val">${totalShootMins > 0 ? scheduleFormatMins(totalShootMins) : '—'}</td>
      <td><strong>${scheduleFormatMins(totalMins)}</strong>${totalBreakMins > 0 ? ` <span style="font-weight:400;color:#666;font-size:7.5pt">(incl. ${scheduleFormatMins(totalBreakMins)} breaks)</span>` : ''}</td>
    </tr>` : ''

    const callTimeStr = day.startTime ? `CALL: <strong>${escapeHtml(day.startTime)}</strong>` : ''
    const wrapStr = wrapMins !== null ? ` &nbsp;·&nbsp; EST. WRAP: <strong>~${escapeHtml(scheduleFormatTimeOfDay(wrapMins))}</strong>` : ''
    const basecampStr = day.basecamp ? ` &nbsp;·&nbsp; BASECAMP: ${escapeHtml(day.basecamp)}` : ''
    const shotCountStr = `${dayBlocks.filter(b => !!b.shotId).length} SHOTS`
    const formattedDate = scheduleFormatDate(day.date)

    dayDivs.push(`
<div class="day-section">
  <div class="day-header">
    <div class="day-title">
      <span class="day-num">Day ${dayIdx + 1}</span>
      ${formattedDate ? `<span class="day-date">${escapeHtml(formattedDate)}</span>` : '<span class="day-date no-date">No date set</span>'}
      ${callTimeStr ? `<span class="call-time">${callTimeStr}${wrapStr}</span>` : ''}
      ${basecampStr ? `<span class="day-basecamp">${basecampStr}</span>` : ''}
    </div>
    <span class="shot-count">${shotCountStr}</span>
  </div>
  ${dayBlocks.length === 0
    ? '<p class="no-shots">No shots scheduled for this day.</p>'
    : `<table>
    <colgroup>
      ${hasTimeline ? '<col style="width:72px">' : ''}
      <col style="width:36px">
      <col style="width:auto">
      <col style="width:60px">
      <col style="width:44px">
      <col style="width:110px">
    </colgroup>
    <thead><tr>${headerCols}</tr></thead>
    <tbody>
      ${blockRows.join('\n      ')}
      ${totalsRow}
    </tbody>
  </table>`}
</div>`)
  })

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Expanded Schedule — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page { size: A4; margin: 10mm 10mm 12mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background:#fff; color:#111; font-family:'Courier New',Courier,monospace; font-size:8pt; }
.doc-title { display:flex; justify-content:space-between; align-items:baseline; padding-bottom:5px; border-bottom:2px solid #111; margin-bottom:10px; }
.doc-title-main { font-size:13pt; font-weight:900; letter-spacing:-0.01em; }
.doc-title-sub { font-size:7.5pt; color:#444; }
.day-section { margin-bottom:12px; }
.day-header { display:flex; justify-content:space-between; align-items:center; background:#f5f3ee; padding:5px 8px; border:1px solid #bbb; border-radius:2px 2px 0 0; }
.day-title { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
.day-num { font-size:10pt; font-weight:900; letter-spacing:0.04em; }
.day-date { font-size:8pt; font-weight:400; color:#444; }
.no-date { color:#999; font-style:italic; }
.call-time { font-size:8pt; font-weight:700; background:rgba(0,0,0,0.07); padding:1px 5px; border-radius:3px; letter-spacing:0.04em; }
.day-basecamp { font-size:7.5pt; color:#555; }
.shot-count { font-size:7.5pt; color:#555; letter-spacing:0.06em; }
.no-shots { padding:7px 8px; font-style:italic; color:#666; border:1px solid #e5e5e5; border-top:none; }
table { width:100%; table-layout:fixed; border-collapse:collapse; border:1px solid #ddd; border-top:none; }
thead th { background:#eceae4; color:#444; font-size:6.5pt; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; text-align:left; padding:3px 5px; border-bottom:1.5px solid #aaa; border-right:1px solid #ccc; white-space:nowrap; }
thead th:last-child { border-right:none; }
.tl-th { text-align:center; }
tbody td { padding:3px 5px; border-bottom:1px solid #e8e5e0; border-right:1px solid #ebe8e2; vertical-align:middle; line-height:1.3; }
tbody td:last-child { border-right:none; }
tr.block-row:nth-child(even) td { background:#faf8f5; }
tr.block-row:nth-child(odd) td { background:#fff; }
tr.deleted-row td { background:#fff5f5; color:#ddd; }
.tl-cell { text-align:center; white-space:nowrap; }
.est-badge { font-size:8pt; font-weight:700; color:#1d4ed8; }
.est-label { font-size:5.5pt; color:#777; letter-spacing:0.1em; }
.shot-id { font-size:9pt; font-weight:900; white-space:nowrap; }
.subject-cell { font-size:7.5pt; }
.notes-txt { color:#444; font-style:italic; font-size:7pt; display:block; }
.scene-loc { color:#666; font-size:6.5pt; display:block; }
.badge-cell { white-space:nowrap; }
.bdg { display:inline-block; padding:0 3px; font-size:6.5pt; font-weight:700; border:1px solid #ccc; border-radius:2px; background:#f0ede8; }
.time-cell { text-align:center; white-space:nowrap; font-weight:700; font-size:8pt; }
.cast-cell { font-size:7.5pt; }
.totals-row td { background:#ede9df !important; border-top:1.5px solid #aaa; padding:4px 5px; font-size:8pt; }
.total-val { font-weight:700; }
tr.special-row td { border-bottom:1px solid; border-right:1px solid; }
tr.special-break td { background:#fef9c3 !important; border-color:#fde68a; }
tr.special-move td { background:#f3e8ff !important; border-color:#d8b4fe; }
tr.special-meal td { background:#fefce8 !important; border-color:#fde68a; }
tr.special-travel td { background:#f0f9ff !important; border-color:#bae6fd; }
.special-cell { padding:3px 5px; font-size:8pt; }
.special-icon { margin-right:4px; }
.special-dur { display:inline-block; margin-left:8px; font-size:7.5pt; background:rgba(0,0,0,0.07); padding:0 4px; border-radius:3px; font-weight:600; }
.footer { margin-top:12px; border-top:1px solid #ddd; padding-top:5px; font-size:7pt; color:#aaa; display:flex; justify-content:space-between; }
@page { @bottom-center { content:"Page " counter(page) " of " counter(pages); font-family:'Courier New',Courier,monospace; font-size:7pt; color:#aaa; } }
</style>
</head>
<body>
<div class="doc-title">
  <div>
    <div class="doc-title-main">EXPANDED SCHEDULE</div>
    <div class="doc-title-sub">${escapeHtml(projectName || 'Untitled Project')}</div>
  </div>
  <div class="doc-title-sub">${schedule.length} day${schedule.length !== 1 ? 's' : ''} · ${schedule.reduce((n, d) => n + (d.blocks || d.shotBlocks || []).filter(b => !!b.shotId).length, 0)} shots</div>
</div>
${dayDivs.join('\n')}
<div class="footer">
  <span>Generated by ShotScribe · ${escapeHtml(today)}</span>
</div>
</body>
</html>`
}

// ── Stripboard print HTML ─────────────────────────────────────────────────────
//
// Landscape A4, each column = one shoot day, dense strip rows with color swatches.
// Groups days into pages of DAYS_PER_PAGE, paginating horizontally.

const DAYS_PER_PAGE = 5

function buildStripboardPrintHtml() {
  const { schedule, scenes, projectName } = useStore.getState()

  const shotMap = new Map()
  scenes.forEach((scene, sceneIdx) => {
    scene.shots.forEach((shot, shotIdx) => {
      shotMap.set(shot.id, {
        shot, scene,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
        color: shot.color || '#4ade80',
      })
    })
  })

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Split schedule into pages of DAYS_PER_PAGE columns
  const pages = []
  for (let i = 0; i < schedule.length; i += DAYS_PER_PAGE) {
    pages.push(schedule.slice(i, i + DAYS_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])

  const pageDivs = pages.map((pageDays, pageIdx) => {
    // Find max strips across days on this page for row count
    const maxStrips = pageDays.reduce((m, d) => Math.max(m, (d.blocks || d.shotBlocks || []).length), 0)

    const colHeaders = pageDays.map((day, i) => {
      const startMins = scheduleParseStartTime(day.startTime)
      const callStr = startMins !== null ? scheduleFormatTimeOfDay(startMins) : ''
      const globalIdx = pageIdx * DAYS_PER_PAGE + i
      const formattedDate = day.date ? (() => {
        try { const d = new Date(day.date + 'T12:00:00'); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) } catch { return day.date }
      })() : ''
      return `<th class="col-header">
        <div class="col-day-num">Day ${globalIdx + 1}</div>
        ${formattedDate ? `<div class="col-date">${escapeHtml(formattedDate)}</div>` : ''}
        ${callStr ? `<div class="col-call">Call: ${escapeHtml(callStr)}</div>` : ''}
      </th>`
    }).join('')

    // Build strip rows: for each row index, render each day's block at that position
    const stripRows = Array.from({ length: maxStrips }, (_, rowIdx) => {
      const cells = pageDays.map(day => {
        const dayBlocks = day.blocks || day.shotBlocks || []
        const block = dayBlocks[rowIdx]
        if (!block) return `<td class="strip-cell strip-empty"></td>`

        if (block.type === 'break' || block.type === 'move' || block.type === 'meal' || block.type === 'travel') {
          const icons = { break: '⏸', move: '↗', meal: '☕', travel: '✈' }
          const bgColors = { break: '#fef9c3', move: '#f3e8ff', meal: '#fefce8', travel: '#f0f9ff' }
          const lbl = block.label || block.breakName || block.blockName || block.type
          const mins = parseScheduleMinutes(block.duration ?? block.breakDuration ?? block.blockDuration ?? 0)
          return `<td class="strip-cell" style="background:${bgColors[block.type] || '#f5f5f5'}">
            <div class="strip-special">
              <span class="strip-special-icon">${icons[block.type] || '●'}</span>
              <span class="strip-special-label">${escapeHtml(lbl)}${mins > 0 ? ` (${mins}m)` : ''}</span>
            </div>
          </td>`
        }

        const found = shotMap.get(block.shotId)
        if (!found) {
          return `<td class="strip-cell strip-deleted"><em>Deleted</em></td>`
        }

        const { shot, scene, displayId, color } = found
        const intOrExt = shot.intOrExt || scene.intOrExt || ''
        const dayNight = shot.dayNight || scene.dayNight || ''
        const shootMins = parseScheduleMinutes(shot.shootTime)

        return `<td class="strip-cell">
          <div class="strip-row">
            <div class="strip-swatch" style="background:${escapeHtml(color)}"></div>
            <div class="strip-content">
              <span class="strip-id">${escapeHtml(displayId)}</span>
              <span class="strip-scene">${escapeHtml(scene.sceneLabel)}${scene.location ? ` · ${escapeHtml(scene.location)}` : ''}</span>
              <span class="strip-meta">${intOrExt}${dayNight ? ` ${dayNight}` : ''}${shootMins > 0 ? ` · ${shootMins}m` : ''}</span>
            </div>
          </div>
        </td>`
      }).join('')
      return `<tr>${cells}</tr>`
    }).join('\n')

    return `<div class="page-doc">
  <table class="stripboard">
    <colgroup>
      ${pageDays.map(() => `<col style="width:${Math.floor(100 / pageDays.length)}%">`).join('')}
    </colgroup>
    <thead>
      <tr>${colHeaders}</tr>
    </thead>
    <tbody>
      ${stripRows || '<tr>' + pageDays.map(() => '<td class="strip-cell strip-empty" style="height:20mm">').join('') + '</tr>'}
    </tbody>
  </table>
</div>`
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Stripboard — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page { size: A4 landscape; margin: 8mm 10mm 10mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background:#fff; color:#111; font-family:'Courier New',Courier,monospace; font-size:7.5pt; }
.page-doc { break-after:page; page-break-after:always; }
.page-doc:last-child { break-after:avoid; page-break-after:avoid; }
.page-header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2px solid #111; margin-bottom:4px; padding-bottom:3px; }
.page-title { font-size:10pt; font-weight:900; letter-spacing:0.05em; }
table.stripboard { width:100%; table-layout:fixed; border-collapse:collapse; }
.col-header { background:#1a1a1a; color:#fff; padding:4px 6px; font-family:'Courier New',Courier,monospace; border-right:1px solid #333; text-align:left; vertical-align:top; }
.col-header:last-child { border-right:none; }
.col-day-num { font-size:9pt; font-weight:900; letter-spacing:0.06em; }
.col-date { font-size:7pt; color:rgba(255,255,255,0.7); margin-top:1px; }
.col-call { font-size:7pt; color:rgba(255,255,255,0.6); margin-top:1px; }
.strip-cell { padding:0; border:1px solid #e0dbd0; vertical-align:top; overflow:hidden; }
.strip-cell.strip-empty { background:#f9f9f9; border-color:#f0ede4; }
.strip-cell.strip-deleted { background:#fff5f5; color:#ccc; font-style:italic; font-size:7pt; padding:3px; }
.strip-row { display:flex; align-items:stretch; min-height:20px; }
.strip-swatch { width:5px; flex-shrink:0; }
.strip-content { flex:1; padding:2px 4px; min-width:0; }
.strip-id { display:block; font-weight:900; font-size:8pt; white-space:nowrap; overflow:hidden; }
.strip-scene { display:block; font-size:6.5pt; color:#555; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.strip-meta { display:block; font-size:6pt; color:#888; white-space:nowrap; }
.strip-special { padding:3px 6px; display:flex; align-items:center; gap:4px; font-size:7pt; }
.strip-special-icon { font-size:8pt; }
.strip-special-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.footer { margin-top:6px; font-size:6.5pt; color:#aaa; display:flex; justify-content:space-between; }
</style>
</head>
<body>
<div class="page-header" style="display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #111;margin-bottom:5px;padding-bottom:3px;">
  <span style="font-size:11pt;font-weight:900;letter-spacing:0.05em">STRIPBOARD</span>
  <span style="font-size:8pt;color:#666">${escapeHtml(projectName || 'Untitled')} · ${schedule.length} day${schedule.length !== 1 ? 's' : ''}</span>
</div>
${pageDivs.join('\n')}
<div class="footer">
  <span>Generated by ShotScribe · ${escapeHtml(today)}</span>
</div>
</body>
</html>`
}

// ── Calendar print HTML ───────────────────────────────────────────────────────
//
// One page per month, standard calendar grid, shoot days marked with cards.
// Portrait A4.

function buildCalendarPrintHtml() {
  const { schedule, projectName } = useStore.getState()

  // Group shoot days by year-month
  const monthMap = new Map()
  schedule.forEach((day, dayIdx) => {
    if (!day.date) return
    const [y, m] = day.date.split('-')
    const key = `${y}-${m}`
    if (!monthMap.has(key)) monthMap.set(key, { year: parseInt(y), month: parseInt(m) - 1, days: [] })
    monthMap.get(key).days.push({ day, dayIdx })
  })

  // If no dated days, fall back to a single placeholder
  if (monthMap.size === 0) {
    const now = new Date()
    monthMap.set(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, {
      year: now.getFullYear(), month: now.getMonth(), days: []
    })
  }

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

  const pageDivs = []

  monthMap.forEach(({ year, month, days }) => {
    // Build a map: date-string → shoot day info
    const shootDayMap = new Map()
    days.forEach(({ day, dayIdx }) => {
      shootDayMap.set(day.date, { day, dayIdx })
    })

    // First day of month
    const firstDay = new Date(year, month, 1)
    const startDow = firstDay.getDay() // 0=Sun
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // Build cells array (nulls for padding)
    const cells = []
    for (let i = 0; i < startDow; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)
    // Pad to complete last row
    while (cells.length % 7 !== 0) cells.push(null)

    const weeks = []
    for (let i = 0; i < cells.length; i += 7) {
      weeks.push(cells.slice(i, i + 7))
    }

    const headerRow = DAY_NAMES.map(d => `<th class="cal-th">${d}</th>`).join('')
    const bodyRows = weeks.map(week => {
      const tds = week.map(dayNum => {
        if (dayNum === null) return `<td class="cal-cell cal-empty"></td>`

        const isoDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`
        const shootInfo = shootDayMap.get(isoDate)

        if (!shootInfo) {
          return `<td class="cal-cell">
            <div class="cal-day-num">${dayNum}</div>
          </td>`
        }

        const { day: sDay, dayIdx } = shootInfo
        const startMins = scheduleParseStartTime(sDay.startTime)
        const callStr = startMins !== null ? scheduleFormatTimeOfDay(startMins) : ''
        const dayBlocks = sDay.blocks || sDay.shotBlocks || []
        const shotCount = dayBlocks.filter(b => !!b.shotId).length

        return `<td class="cal-cell cal-shoot">
          <div class="cal-day-num cal-shoot-num">${dayNum}</div>
          <div class="cal-shoot-card">
            <div class="cal-shoot-day">Day ${dayIdx + 1}</div>
            <div class="cal-shoot-shots">${shotCount} shot${shotCount !== 1 ? 's' : ''}</div>
            ${callStr ? `<div class="cal-shoot-call">☎ ${escapeHtml(callStr)}</div>` : ''}
          </div>
        </td>`
      }).join('')
      return `<tr>${tds}</tr>`
    }).join('\n')

    pageDivs.push(`<div class="cal-page">
  <div class="cal-header">
    <span class="cal-month">${MONTH_NAMES[month]} ${year}</span>
    <span class="cal-project">${escapeHtml(projectName || 'Untitled')}</span>
  </div>
  <table class="cal-table">
    <thead><tr>${headerRow}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`)
  })

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Calendar — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page { size: A4; margin: 10mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background:#fff; color:#111; font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif; }
.cal-page { break-after:page; page-break-after:always; display:flex; flex-direction:column; height:267mm; }
.cal-page:last-child { break-after:avoid; page-break-after:avoid; }
.cal-header { display:flex; justify-content:space-between; align-items:baseline; border-bottom:2.5px solid #111; padding-bottom:5px; margin-bottom:6px; flex-shrink:0; }
.cal-month { font-size:20pt; font-weight:900; letter-spacing:-0.02em; }
.cal-project { font-size:8pt; color:#888; font-family:'Courier New',Courier,monospace; }
.cal-table { width:100%; table-layout:fixed; border-collapse:collapse; flex:1; }
.cal-th { text-align:center; font-size:7pt; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#888; padding:4px 2px; border-bottom:1px solid #ddd; }
.cal-cell { border:1px solid #e5e5e5; vertical-align:top; padding:3px; height:35mm; width:14.28%; }
.cal-empty { background:#fafafa; }
.cal-shoot { background:#f0f9f0; border-color:#4ade80; }
.cal-day-num { font-size:9pt; font-weight:700; color:#333; margin-bottom:3px; }
.cal-shoot-num { color:#15803d; }
.cal-shoot-card { background:#dcfce7; border:1px solid #86efac; border-radius:3px; padding:3px 4px; }
.cal-shoot-day { font-size:8pt; font-weight:900; color:#15803d; font-family:'Courier New',Courier,monospace; letter-spacing:0.04em; }
.cal-shoot-shots { font-size:7pt; color:#166534; margin-top:1px; }
.cal-shoot-call { font-size:7pt; color:#15803d; margin-top:1px; font-weight:600; }
.footer { margin-top:6px; font-size:7pt; color:#aaa; }
</style>
</head>
<body>
${pageDivs.join('\n')}
<div class="footer">Generated by ShotScribe · ${escapeHtml(today)}</div>
</body>
</html>`
}

// ── Callsheet print HTML: built from store data ───────────────────────────────
//
// Generates a professional production callsheet for all shooting days.
// Each day starts on a new page.  Call time and basecamp come from the
// schedule; all other fields come from the callsheets store map.

function buildCallsheetPrintHtml(dayIdxFilter = null) {
  const { schedule, callsheets, projectName, castRoster, crewRoster, scriptScenes, getScheduleWithShots, callsheetColumnConfig } = useStore.getState()

  if (schedule.length === 0) {
    return `<!DOCTYPE html><html><body style="font-family:monospace;padding:40px"><p>No shooting days scheduled.</p></body></html>`
  }

  function fmt12(t) {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return t
    const ap = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
  }

  function fmtDate(d) {
    if (!d) return ''
    const [y, mo, da] = d.split('-')
    return `${mo}/${da}/${y}`
  }

  function formatMinuteOfDay(totalMins) {
    if (typeof totalMins !== 'number') return '—'
    const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
    const h24 = Math.floor(safeTotal / 60)
    const m = safeTotal % 60
    const h12 = h24 % 12 || 12
    const ampm = h24 < 12 ? 'AM' : 'PM'
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  }

  function formatDayNightDisplay(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const upper = raw.toUpperCase()
    if (upper === 'NIGHT') return 'NITE'
    return upper.slice(0, 4)
  }

  function hasMeaningfulText(value) {
    if (value === null || value === undefined) return false
    const normalized = String(value).trim()
    if (!normalized) return false
    const lower = normalized.toLowerCase()
    return lower !== 'none' && lower !== 'n/a' && lower !== 'na'
  }

  const scheduleWithShots = getScheduleWithShots()
  const primaryBySection = {
    advancedSchedule: 'sluglineScene',
    castList: 'actor',
    crewList: 'name',
  }
  const isColumnVisible = (sectionKey, columnKey) => {
    if (columnKey === primaryBySection[sectionKey]) return true
    const rows = Array.isArray(callsheetColumnConfig?.[sectionKey]) ? callsheetColumnConfig[sectionKey] : []
    const match = rows.find(row => row.key === columnKey)
    return match ? !!match.visible : true
  }

  const dayPages = schedule
    .map((day, dayIdx) => ({ day, dayIdx }))
    .filter(({ dayIdx }) => dayIdxFilter === null || dayIdxFilter.includes(dayIdx))
    .map(({ day, dayIdx }) => {
    const cs = callsheets[day.id] || {}
    const productionTitle = cs.productionTitle !== undefined ? cs.productionTitle : (projectName || 'Untitled Project')

    // ── General Info rows
    const preferredShootLocation = hasMeaningfulText(day.primaryLocation) ? day.primaryLocation : cs.shootLocation
    const genRows = [
      ['PRODUCTION', hasMeaningfulText(productionTitle) ? escapeHtml(productionTitle) : ''],
      ['BASECAMP / UNIT BASE', hasMeaningfulText(day.basecamp) ? escapeHtml(day.basecamp) : ''],
      ['SHOOT LOCATION', hasMeaningfulText(preferredShootLocation) ? escapeHtml(preferredShootLocation) : ''],
      ['WEATHER', hasMeaningfulText(cs.weather) ? escapeHtml(cs.weather) : ''],
      ['NEAREST HOSPITAL', hasMeaningfulText(cs.nearestHospital) ? escapeHtml(cs.nearestHospital) : ''],
      ['EMERGENCY CONTACTS', hasMeaningfulText(cs.emergencyContacts) ? escapeHtml(cs.emergencyContacts).replace(/\n/g, '<br>') : ''],
    ].filter(([, v]) => v !== '').map(([label, value]) =>
      `<tr><td class="info-label">${label}</td><td class="info-value">${value}</td></tr>`
    ).join('\n')

    const derivedScheduleRows = buildDayScheduleRows(day, scheduleWithShots, scriptScenes)
    const castListRows = deriveDayCastRows({
      dayId: day.id,
      callsheet: cs,
      castRoster,
      scriptScenes,
      scheduledSceneIds: derivedScheduleRows.scheduledSceneIds,
    })
    const crewListRows = deriveDayCrewRows({ callsheet: cs, crewRoster, day })

    const scheduleColumns = CALLSHEET_COLUMN_DEFINITIONS.advancedSchedule.filter(column => isColumnVisible('advancedSchedule', column.key))
    const castColumns = CALLSHEET_COLUMN_DEFINITIONS.castList.filter(column => isColumnVisible('castList', column.key))
    const crewColumns = CALLSHEET_COLUMN_DEFINITIONS.crewList.filter(column => isColumnVisible('crewList', column.key))

    const scheduleHeader = scheduleColumns.map(column => `<th>${escapeHtml(column.label.toUpperCase())}</th>`).join('')
    const castHeader = castColumns.map(column => `<th>${escapeHtml(column.label.toUpperCase())}</th>`).join('')
    const crewHeader = crewColumns.map(column => `<th>${escapeHtml(column.label.toUpperCase())}</th>`).join('')

    const scheduleRowsSource = derivedScheduleRows.scenes
      .map(scene => {
        const valuesByColumn = {}
        scheduleColumns.forEach(column => {
          if (column.key === 'sceneNumber') valuesByColumn.sceneNumber = scene.sceneNumber || ''
          else if (column.key === 'sluglineScene') valuesByColumn.sluglineScene = scene.slugline || ''
          else if (column.key === 'location') valuesByColumn.location = scene.location || ''
          else if (column.key === 'intExt') valuesByColumn.intExt = scene.intExt || ''
          else if (column.key === 'dayNight') valuesByColumn.dayNight = formatDayNightDisplay(scene.dayNight)
          else if (column.key === 'start') valuesByColumn.start = formatMinuteOfDay(scene.start)
          else if (column.key === 'end') valuesByColumn.end = formatMinuteOfDay(scene.end)
          else if (column.key === 'pages') valuesByColumn.pages = Number(scene.pageCount || 0).toFixed(2)
          else if (column.key === 'shots') valuesByColumn.shots = String(scene.shotCount ?? '')
          else if (column.key === 'notes') valuesByColumn.notes = scene.notes || ''
        })
        return valuesByColumn
      })
      .filter(row =>
        Object.values(row).some(value => hasMeaningfulText(value))
      )

    const scheduleBodyRows = scheduleRowsSource.map((scene, i) => {
          const cells = scheduleColumns.map(column => {
            if (column.key === 'sceneNumber') return `<td>${escapeHtml(scene.sceneNumber || '')}</td>`
            if (column.key === 'sluglineScene') return `<td>${escapeHtml(scene.sluglineScene || '')}</td>`
            if (column.key === 'location') return `<td>${escapeHtml(scene.location || '')}</td>`
            if (column.key === 'intExt') return `<td>${escapeHtml(scene.intExt || '')}</td>`
            if (column.key === 'dayNight') return `<td>${escapeHtml(scene.dayNight || '')}</td>`
            if (column.key === 'start') return `<td>${escapeHtml(scene.start || '')}</td>`
            if (column.key === 'end') return `<td>${escapeHtml(scene.end || '')}</td>`
            if (column.key === 'pages') return `<td>${escapeHtml(scene.pages || '')}</td>`
            if (column.key === 'shots') return `<td>${escapeHtml(scene.shots || '')}</td>`
            if (column.key === 'notes') return `<td>${escapeHtml(scene.notes || '')}</td>`
            return '<td></td>'
          }).join('')
          return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">${cells}</tr>`
        }).join('\n')

    // Filter cast rows where all variable fields are empty
    const castListRowsFiltered = castListRows.filter(row =>
      (row.sceneCount != null && row.sceneCount > 0) ||
      (row.pageCount != null && row.pageCount > 0) ||
      row.character || row.pickupTime || row.makeupCall || row.setCall || row.contact
    )
    const castRowsSource = castListRowsFiltered.length > 0 ? castListRowsFiltered : castListRows
    const castRows = castRowsSource.map((row, i) => {
          const cells = castColumns.map(column => {
            if (column.key === 'actor') return `<td>${escapeHtml(row.name || '')}</td>`
            if (column.key === 'character') return `<td>${escapeHtml(row.character || '')}</td>`
            if (column.key === 'sceneCount') return `<td>${row.sceneCount ? escapeHtml(String(row.sceneCount)) : ''}</td>`
            if (column.key === 'pageCount') return `<td>${row.pageCount ? escapeHtml(Number(row.pageCount).toFixed(2)) : ''}</td>`
            if (column.key === 'callTime') return `<td>${escapeHtml(row.callTime || '')}</td>`
            if (column.key === 'pickupTime') return `<td>${escapeHtml(row.pickupTime || '')}</td>`
            if (column.key === 'makeupCall') return `<td>${escapeHtml(row.makeupCall || '')}</td>`
            if (column.key === 'setCall') return `<td>${escapeHtml(row.setCall || '')}</td>`
            if (column.key === 'contact') return `<td>${escapeHtml(row.contact || '')}</td>`
            return '<td></td>'
          }).join('')
          return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">${cells}</tr>`
        }).join('\n')

    const crewRows = crewListRows.map((row, i) => {
          const cells = crewColumns.map(column => {
            if (column.key === 'name') return `<td>${escapeHtml(row.name || '')}</td>`
            if (column.key === 'role') return `<td>${escapeHtml(row.role || row.department || '')}</td>`
            if (column.key === 'callTime') return `<td>${escapeHtml(row.callTime || '')}</td>`
            if (column.key === 'notes') return `<td>${escapeHtml(row.notes || '')}</td>`
            if (column.key === 'contact') return `<td>${escapeHtml(row.contact || '')}</td>`
            return '<td></td>'
          }).join('')
          return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}">${cells}</tr>`
        }).join('\n')

    // ── Location Details
    const locLines = []
    if (cs.locationAddress) locLines.push(`<div class="loc-row"><span class="loc-label">Address</span><span>${escapeHtml(cs.locationAddress)}</span></div>`)
    if (cs.parkingNotes)    locLines.push(`<div class="loc-row"><span class="loc-label">Parking</span><span>${escapeHtml(cs.parkingNotes).replace(/\n/g, '<br>')}</span></div>`)
    if (cs.directions)      locLines.push(`<div class="loc-row"><span class="loc-label">Directions</span><span>${escapeHtml(cs.directions).replace(/\n/g, '<br>')}</span></div>`)
    if (cs.mapsLink)        locLines.push(`<div class="loc-row"><span class="loc-label">Maps</span><span>${escapeHtml(cs.mapsLink)}</span></div>`)

    const showAdvNotes = hasMeaningfulText(cs.additionalNotes)
    const advNotes = showAdvNotes
      ? `<div class="adv-notes">${escapeHtml(cs.additionalNotes).replace(/\n/g, '<br>')}</div>`
      : ''
    const generatedStamp = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const footerLeftMeta = [
      `Day ${dayIdx + 1}`,
      day.date ? fmtDate(day.date) : '',
      day.startTime ? `General Call ${fmt12(day.startTime)}` : '',
    ].filter(Boolean).join(' • ')

    const showGeneralInfo = genRows.length > 0
    const showAdvancedSchedule = scheduleBodyRows.length > 0
    const showCastList = castRows.length > 0
    const showCrewList = crewRows.length > 0

    return `<div class="day-page">
  <!-- HEADER -->
  <div class="cs-header">
    <div class="cs-header-left">
      <div class="cs-title">${escapeHtml(productionTitle || 'Untitled Project')}</div>
      <div class="cs-subtitle">CALLSHEET</div>
    </div>
    <div class="cs-header-right">
      <div class="cs-day">Day ${dayIdx + 1}</div>
    </div>
  </div>

  <!-- GENERAL INFO -->
  ${showGeneralInfo ? `<div class="section">
    <div class="section-title">GENERAL INFO</div>
    <table class="info-table">
      <colgroup><col style="width:130px"><col style="width:auto"></colgroup>
      <tbody>${genRows}</tbody>
    </table>
  </div>` : ''}

  <!-- ADVANCED SCHEDULE -->
  ${showAdvancedSchedule ? `<div class="section">
    <div class="section-title">ADVANCED SCHEDULE</div>
    <table>
      <thead><tr>${scheduleHeader}</tr></thead>
      <tbody>${scheduleBodyRows}</tbody>
    </table>
  </div>` : ''}

  <!-- CAST LIST -->
  ${showCastList ? `<div class="section">
    <div class="section-title">CAST LIST</div>
    <table>
      <thead><tr>${castHeader}</tr></thead>
      <tbody>${castRows}</tbody>
    </table>
  </div>` : ''}

  <!-- CREW LIST -->
  ${showCrewList ? `<div class="section">
    <div class="section-title">CREW LIST</div>
    <table>
      <thead><tr>${crewHeader}</tr></thead>
      <tbody>${crewRows}</tbody>
    </table>
  </div>` : ''}

  <!-- LOCATION DETAILS -->
  ${locLines.length > 0 ? `
  <div class="section">
    <div class="section-title">LOCATION DETAILS</div>
    ${locLines.join('\n    ')}
  </div>` : ''}

  <!-- ADDITIONAL NOTES -->
  ${showAdvNotes ? `
  <div class="section">
    <div class="section-title">ADDITIONAL NOTES / SPECIAL INSTRUCTIONS</div>
    ${advNotes}
  </div>` : ''}

  <div class="cs-footer">
    <div class="cs-footer-left">
      <div class="cs-footer-meta">${escapeHtml(footerLeftMeta)}</div>
      <div>Generated by ShotScribe — ${escapeHtml(generatedStamp)}</div>
    </div>
    <span class="cs-footer-right">CONFIDENTIAL — FOR PRODUCTION USE ONLY</span>
  </div>
</div>`
  })

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Callsheet — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
/* Suppress browser-generated print headers and footers (URL, date, page number).
   Margin box declarations inside @page (CSS Paged Media spec) clear browser UI
   in supporting browsers. For Chrome/Edge, the user may still need to uncheck
   "Headers and footers" in the print dialog if the browser ignores these rules. */
@page {
  size: letter;
  margin: 0.75in;
  @top-left   { content: none; }
  @top-center { content: none; }
  @top-right  { content: none; }
  @bottom-left   { content: none; }
  @bottom-center { content: none; }
  @bottom-right  { content: none; }
}
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #fff;
  color: #111111;
  font-family: Inter, 'Segoe UI', Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.35;
}
.day-page {
  break-after: page;
  page-break-after: always;
  padding-bottom: 4px;
}
.day-page:last-child {
  break-after: avoid;
  page-break-after: avoid;
}

/* Header */
.cs-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0b1220;
  color: #fff;
  padding: 14px 16px;
  margin-bottom: 14px;
  border-radius: 8px 8px 0 0;
  border-bottom: 3px solid #1f2937;
}
.cs-title {
  font-size: 18pt;
  font-weight: 800;
  letter-spacing: 0.01em;
  line-height: 1.1;
  color: #fff;
}
.cs-subtitle {
  font-size: 8pt;
  font-weight: 700;
  color: #dbeafe;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-top: 5px;
}
.cs-header-right {
  text-align: right;
}
.cs-day {
  font-size: 12pt;
  font-weight: 700;
  color: #f8fafc;
}

/* Sections */
.section {
  margin-bottom: 12px;
}
.section-title {
  background: #111827;
  color: #ffffff;
  padding: 6px 10px;
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  border: 1px solid #111827;
  border-bottom: none;
}

/* General Info table */
.info-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #111827;
  table-layout: fixed;
}
.info-label {
  padding: 6px 10px;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #111827;
  border-bottom: 1px solid #d1d5db;
  border-right: 1px solid #d1d5db;
  background: #eef2ff;
  white-space: nowrap;
  vertical-align: top;
}
.info-value {
  padding: 6px 10px;
  font-size: 9.5pt;
  color: #111111;
  border-bottom: 1px solid #d1d5db;
  vertical-align: top;
  overflow-wrap: anywhere;
}

/* Standard tables */
table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #111827;
  table-layout: fixed;
}
thead th {
  background: #111827;
  color: #ffffff;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  text-align: left;
  padding: 6px 8px;
  border-right: 1px solid #1f2937;
  white-space: nowrap;
  overflow: hidden;
}
thead th:last-child { border-right: none; }
tbody td {
  padding: 6px 8px;
  border-bottom: 1px solid #d1d5db;
  border-right: 1px solid #d1d5db;
  font-size: 9pt;
  color: #111111;
  vertical-align: top;
  overflow-wrap: anywhere;
}
tbody td:last-child { border-right: none; }
tr.row-even td { background: #ffffff; }
tr.row-odd td  { background: #f9fafb; }

/* Location details */
.loc-row {
  display: flex;
  gap: 10px;
  padding: 6px 10px;
  border: 1px solid #111827;
  border-top: none;
  font-size: 9pt;
  color: #111111;
  overflow-wrap: anywhere;
}
.loc-row:first-child { border-top: 1px solid #111827; }
.loc-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #111827;
  width: 70px;
  flex-shrink: 0;
  padding-top: 1px;
}

/* Additional Notes */
.adv-notes {
  padding: 8px 10px;
  border: 1px solid #111827;
  font-size: 9pt;
  color: #111111;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* Footer */
.cs-footer {
  margin-top: 14px;
  padding-top: 8px;
  border-top: 1.5px solid #111827;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  font-size: 8pt;
  color: #111827;
  gap: 10px;
}
.cs-footer-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.cs-footer-meta {
  font-weight: 700;
}
.cs-footer-right {
  text-align: right;
  font-weight: 700;
  letter-spacing: 0.08em;
}
</style>
</head>
<body>
${dayPages.join('\n')}
</body>
</html>`
}

// ── Shotlist print HTML: built from store data ────────────────────────────────
//
// Generates a self-contained HTML table using the user's current column config.
// Column widths are percentage-based so the table always fills the full page width.
// Font size is 9pt so all columns fit comfortably in landscape A4/Letter.
// Always uses a hardcoded light theme.

function buildShotlistPrintHtml(dayIdxFilter = null) {
  const { scenes, schedule, shotlistColumnConfig, customColumns, projectName } = useStore.getState()

  // Build a unified column map (built-in + custom)
  const allColumnsMap = {}
  PRINT_BUILTIN_COLUMNS.forEach(col => { allColumnsMap[col.key] = col })
  ;(customColumns || []).forEach(c => {
    allColumnsMap[c.key] = { key: c.key, label: c.label, width: 100 }
  })

  // Resolve visible columns in user-configured order
  const visibleColumns = (shotlistColumnConfig || [])
    .filter(c => c.visible)
    .map(c => allColumnsMap[c.key])
    .filter(Boolean)

  if (visibleColumns.length === 0) {
    return '<!DOCTYPE html><html><body><p>No columns configured.</p></body></html>'
  }

  // Percentage widths — proportional to the pixel widths, sum to 100%
  const totalPx = visibleColumns.reduce((sum, col) => sum + (col.width || 80), 0)
  const colgroupHtml = visibleColumns
    .map(col => `<col style="width:${((col.width || 80) / totalPx * 100).toFixed(2)}%">`)
    .join('\n    ')

  const headerCells = visibleColumns
    .map(col => {
      const cls = col.key === 'checked' ? ' class="col-c"' : ''
      return `<th${cls}>${escapeHtml(col.label)}</th>`
    })
    .join('')

  const nCols = visibleColumns.length

  // Build global shotId→{shot, scene, displayId} map once
  const shotMap = new Map()
  scenes.forEach((scene, sceneIdx) => {
    scene.shots.forEach((shot, shotIdx) => {
      shotMap.set(shot.id, {
        shot,
        scene,
        displayId: `${sceneIdx + 1}${getShotLetter(shotIdx)}`,
      })
    })
  })

  function fmtDate(iso) {
    if (!iso) return ''
    const [y, m, d] = iso.split('-')
    return `${m}/${d}/${y}`
  }

  // Helper: render scene groups for a given set of shotIds, preserving scene order
  function renderDayRows(dayShotIds) {
    const rows = []
    // Group shotIds by scene, preserving scene order
    const sceneOrder = []
    const shotsByScene = new Map()
    scenes.forEach(scene => {
      const shots = scene.shots
        .map((shot, idx) => ({ ...shot, displayId: `${scenes.indexOf(scene) + 1}${getShotLetter(idx)}` }))
        .filter(shot => dayShotIds.has(shot.id))
      if (shots.length > 0) {
        sceneOrder.push(scene)
        shotsByScene.set(scene.id, shots)
      }
    })

    sceneOrder.forEach(scene => {
      const shots = shotsByScene.get(scene.id)
      const sceneInfo = [scene.sceneLabel, scene.location, scene.intOrExt, scene.dayNight || 'DAY'].join(' | ')
      const shotCount = `${shots.length} SHOT${shots.length !== 1 ? 'S' : ''}`

      rows.push(
        `<tr class="scene-hdr"><td colspan="${nCols}">` +
        `<div class="scene-hdr-inner">` +
        `<span>${escapeHtml(sceneInfo)}</span>` +
        `<span class="shot-count">${escapeHtml(shotCount)}</span>` +
        `</div></td></tr>`
      )

      shots.forEach((shot, idx) => {
        const rowCls = [
          idx % 2 === 0 ? 'row-even' : 'row-odd',
          shot.checked ? 'row-chk' : '',
        ].filter(Boolean).join(' ')

        const cells = visibleColumns.map(col => {
          const val = getCellValue(col.key, shot, scene)
          const isNotes = col.key === 'notes'
          const clsParts = []
          if (col.key === 'checked') clsParts.push('col-c')
          if (!isNotes) clsParts.push('no-wrap')
          const cls = clsParts.length ? ` class="${clsParts.join(' ')}"` : ''
          return `<td${cls}>${escapeHtml(String(val))}</td>`
        }).join('')

        rows.push(`<tr class="${rowCls}">${cells}</tr>`)
      })
    })

    return rows
  }

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  // Build body: if schedule has days, group by day; otherwise flat list of all shots
  let bodyHtml = ''
  if (schedule && schedule.length > 0) {
    schedule.forEach((day, dayIdx) => {
      if (dayIdxFilter !== null && !dayIdxFilter.includes(dayIdx)) return

      const dayShotIds = new Set(
        (day.blocks || day.shotBlocks || [])
          .filter(b => b.type !== 'break' && b.shotId)
          .map(b => b.shotId)
      )
      if (dayShotIds.size === 0) return

      const dayLabel = `DAY ${dayIdx + 1}${day.date ? ` — ${fmtDate(day.date)}` : ''}`
      const startTimeStr = day.startTime ? ` · Call: ${day.startTime}` : ''

      const rows = renderDayRows(dayShotIds)
      if (rows.length === 0) return

      bodyHtml += `
<tr class="day-hdr"><td colspan="${nCols}">
  <div class="day-hdr-inner">
    <span>${escapeHtml(dayLabel)}${escapeHtml(startTimeStr)}</span>
    <span class="shot-count">${dayShotIds.size} SHOT${dayShotIds.size !== 1 ? 'S' : ''}</span>
  </div>
</td></tr>
${rows.join('\n')}
`
    })
    if (!bodyHtml) {
      bodyHtml = `<tr><td colspan="${nCols}" style="padding:10px;font-style:italic;color:#aaa;text-align:center;">No shots scheduled.</td></tr>`
    }
  } else {
    // Fallback: no schedule — show all scenes/shots flat
    const allShotIds = new Set([...shotMap.keys()])
    const rows = renderDayRows(allShotIds)
    bodyHtml = rows.join('\n') || `<tr><td colspan="${nCols}" style="padding:10px;font-style:italic;color:#aaa;text-align:center;">No shots.</td></tr>`
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Shotlist — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
@page { size: A4 landscape; margin: 12mm 10mm 14mm; }
@page {
  @bottom-center {
    content: "Page " counter(page) " of " counter(pages);
    font-family: 'Courier New', Courier, monospace;
    font-size: 7pt;
    color: #aaa;
  }
}
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #fff;
  color: #111;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9pt;
}
.doc-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 6px;
  border-bottom: 2px solid #111;
  margin-bottom: 10px;
}
.doc-title-main {
  font-size: 14pt;
  font-weight: 900;
  letter-spacing: -0.01em;
}
.doc-title-sub {
  font-size: 8pt;
  color: #444;
}
table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
}
thead { display: table-header-group; }
thead th {
  background: #f0ede4;
  color: #444;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  text-align: left;
  padding: 4px 5px;
  border-bottom: 2px solid #999;
  border-right: 1px solid #ccc;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
thead th:last-child { border-right: none; }
thead th.col-c { text-align: center; }
tbody tr { break-inside: avoid; page-break-inside: avoid; }
tbody td {
  padding: 3px 5px;
  border-bottom: 1px solid #e0dbd0;
  border-right: 1px solid #e0dbd0;
  vertical-align: top;
  white-space: pre-wrap;
  word-break: break-word;
  overflow: visible;
}
tbody td.no-wrap {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
tbody td:last-child { border-right: none; }
tbody td.col-c { text-align: center; vertical-align: middle; }
tr.day-hdr td {
  background: #111;
  color: #fff;
  border: none;
  padding: 0;
  break-before: auto;
}
tr.day-hdr + tr { break-before: avoid; }
.day-hdr-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  font-weight: 900;
  font-size: 11pt;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
tr.scene-hdr td {
  background: #2a2a2a;
  color: #fff;
  border: none;
  padding: 0;
}
.scene-hdr-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 10px;
  font-weight: 700;
  font-size: 10pt;
  letter-spacing: 0.05em;
}
.shot-count {
  font-weight: 400;
  font-size: 8pt;
  opacity: 0.65;
  letter-spacing: 0.05em;
}
tr.row-even td { background: #fff; }
tr.row-odd  td { background: #faf8f5; }
tr.row-chk  td { opacity: 0.45; text-decoration: line-through; }
</style>
</head>
<body>
<div class="doc-header">
  <div>
    <div class="doc-title-main">SHOTLIST</div>
    <div class="doc-title-sub">${escapeHtml(projectName || 'Untitled Project')}</div>
  </div>
  <div class="doc-title-sub">${escapeHtml(today)}</div>
</div>
<table>
  <colgroup>
    ${colgroupHtml}
  </colgroup>
  <thead><tr>${headerCells}</tr></thead>
  <tbody>
${bodyHtml}
  </tbody>
</table>
</body>
</html>`
}

// ── Electron path: webContents.printToPDF() ───────────────────────────────────

async function exportViaPrint(htmlContent, projectName, suffix = '', explicitFileName = '') {
  console.log(`[PDF Export] Starting printToPDF — ${(htmlContent.length / 1024).toFixed(0)}KB`)

  let result
  try {
    result = await platformService.printToPDF(htmlContent)
  } catch (ipcErr) {
    throw new Error(`IPC error during printToPDF: ${ipcErr.message || ipcErr}`)
  }

  if (!result.success) {
    throw new Error(result.error || 'printToPDF returned failure')
  }

  console.log(`[PDF Export] PDF buffer received — ${(result.pdfData.length / 1024).toFixed(0)}KB`)

  const buffer = new Uint8Array(result.pdfData)
  const base = projectName
    ? projectName.replace(/[^a-z0-9]/gi, '_')
    : 'export'
  const fileName = explicitFileName || (suffix ? `${base}_${suffix}.pdf` : `${base}.pdf`)

  const saveResult = await platformService.savePDF(fileName, buffer.buffer)
  if (!saveResult?.success) {
    if (saveResult?.error) throw new Error(saveResult.error)
    console.log('[PDF Export] Save cancelled.')
    return saveResult
  }
  console.log('[PDF Export] Saved successfully.')
  return saveResult
}

function hasMeaningfulCallsheetValue(value) {
  if (value === null || value === undefined) return false
  const normalized = String(value).trim()
  if (!normalized) return false
  const lower = normalized.toLowerCase()
  return lower !== 'none' && lower !== 'n/a' && lower !== 'na'
}

function buildCallsheetExportData(dayIdxFilter = null) {
  const { schedule, callsheets, projectName, castRoster, crewRoster, scriptScenes, getScheduleWithShots, callsheetColumnConfig } = useStore.getState()
  if (!schedule.length) return { projectName, pages: [] }

  const fmt12 = (t) => {
    if (!t) return ''
    const [h, m] = t.split(':').map(Number)
    if (isNaN(h) || isNaN(m)) return t
    const ap = h >= 12 ? 'PM' : 'AM'
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ap}`
  }
  const fmtDate = (d) => {
    if (!d) return ''
    const [y, mo, da] = d.split('-')
    return `${mo}/${da}/${y}`
  }
  const formatMinuteOfDay = (totalMins) => {
    if (typeof totalMins !== 'number') return ''
    const safeTotal = ((Math.round(totalMins) % (24 * 60)) + 24 * 60) % (24 * 60)
    const h24 = Math.floor(safeTotal / 60)
    const m = safeTotal % 60
    const h12 = h24 % 12 || 12
    const ampm = h24 < 12 ? 'AM' : 'PM'
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`
  }
  const formatDayNightDisplay = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    const upper = raw.toUpperCase()
    if (upper === 'NIGHT') return 'NITE'
    return upper.slice(0, 4)
  }

  const scheduleWithShots = getScheduleWithShots()
  const primaryBySection = { advancedSchedule: 'sluglineScene', castList: 'actor', crewList: 'name' }
  const isColumnVisible = (sectionKey, columnKey) => {
    if (columnKey === primaryBySection[sectionKey]) return true
    const rows = Array.isArray(callsheetColumnConfig?.[sectionKey]) ? callsheetColumnConfig[sectionKey] : []
    const match = rows.find(row => row.key === columnKey)
    return match ? !!match.visible : true
  }

  const pages = schedule
    .map((day, dayIdx) => ({ day, dayIdx }))
    .filter(({ dayIdx }) => dayIdxFilter === null || dayIdxFilter.includes(dayIdx))
    .map(({ day, dayIdx }) => {
      const cs = callsheets[day.id] || {}
      const productionTitle = cs.productionTitle !== undefined ? cs.productionTitle : (projectName || 'Untitled Project')
      const preferredShootLocation = hasMeaningfulCallsheetValue(day.primaryLocation) ? day.primaryLocation : cs.shootLocation
      const generalInfo = [
        ['Production', productionTitle],
        ['Basecamp / Unit Base', day.basecamp],
        ['Shoot Location', preferredShootLocation],
        ['Weather', cs.weather],
        ['Nearest Hospital', cs.nearestHospital],
        ['Emergency Contacts', cs.emergencyContacts],
      ]
        .filter(([, value]) => hasMeaningfulCallsheetValue(value))
        .map(([label, value]) => ({ label, value: String(value).trim() }))

      const derivedScheduleRows = buildDayScheduleRows(day, scheduleWithShots, scriptScenes)
      const castListRows = deriveDayCastRows({
        dayId: day.id, callsheet: cs, castRoster, scriptScenes, scheduledSceneIds: derivedScheduleRows.scheduledSceneIds,
      })
      const crewListRows = deriveDayCrewRows({ callsheet: cs, crewRoster, day })

      const scheduleColumns = CALLSHEET_COLUMN_DEFINITIONS.advancedSchedule.filter(col => isColumnVisible('advancedSchedule', col.key))
      const castColumns = CALLSHEET_COLUMN_DEFINITIONS.castList.filter(col => isColumnVisible('castList', col.key))
      const crewColumns = CALLSHEET_COLUMN_DEFINITIONS.crewList.filter(col => isColumnVisible('crewList', col.key))

      const scheduleRows = derivedScheduleRows.scenes.map((scene) => ({
        sceneNumber: scene.sceneNumber || '',
        sluglineScene: scene.slugline || '',
        location: scene.location || '',
        intExt: scene.intExt || '',
        dayNight: formatDayNightDisplay(scene.dayNight),
        start: formatMinuteOfDay(scene.start),
        end: formatMinuteOfDay(scene.end),
        pages: Number(scene.pageCount || 0).toFixed(2),
        shots: String(scene.shotCount ?? ''),
        notes: scene.notes || '',
      })).filter(row => Object.values(row).some(hasMeaningfulCallsheetValue))

      const castRows = castListRows.map(row => ({
        actor: row.name || '',
        character: row.character || '',
        sceneCount: row.sceneCount ? String(row.sceneCount) : '',
        pageCount: row.pageCount ? Number(row.pageCount).toFixed(2) : '',
        callTime: row.callTime || '',
        pickupTime: row.pickupTime || '',
        makeupCall: row.makeupCall || '',
        setCall: row.setCall || '',
        contact: row.contact || '',
      })).filter(row => Object.values(row).some(hasMeaningfulCallsheetValue))

      const crewRows = crewListRows.map(row => ({
        name: row.name || '',
        role: row.role || row.department || '',
        callTime: row.callTime || '',
        notes: row.notes || '',
        contact: row.contact || '',
      })).filter(row => Object.values(row).some(hasMeaningfulCallsheetValue))

      const locationDetails = [
        ['Address', cs.locationAddress],
        ['Parking', cs.parkingNotes],
        ['Directions', cs.directions],
        ['Maps', cs.mapsLink],
      ]
        .filter(([, value]) => hasMeaningfulCallsheetValue(value))
        .map(([label, value]) => ({ label, value: String(value).trim() }))

      const additionalNotes = hasMeaningfulCallsheetValue(cs.additionalNotes) ? String(cs.additionalNotes).trim() : ''
      const footerMeta = [`Day ${dayIdx + 1}`, day.date ? fmtDate(day.date) : '', day.startTime ? `General Call ${fmt12(day.startTime)}` : '']
        .filter(Boolean)
        .join(' • ')

      return {
        dayNumber: dayIdx + 1,
        productionTitle,
        generalInfo,
        schedule: { columns: scheduleColumns, rows: scheduleRows },
        cast: { columns: castColumns, rows: castRows },
        crew: { columns: crewColumns, rows: crewRows },
        locationDetails,
        additionalNotes,
        footerMeta,
      }
    })

  return { projectName, pages }
}

function createCallsheetPdfDocument({ Document, Page, Text, View, StyleSheet }) {
  const callsheetPdfStyles = StyleSheet.create({
    page: { backgroundColor: '#ffffff', paddingTop: 26, paddingBottom: 36, paddingHorizontal: 26, fontFamily: 'Helvetica', color: '#0f172a', fontSize: 9 },
    header: { backgroundColor: '#0b1220', borderBottomWidth: 3, borderBottomColor: '#1f2937', borderTopLeftRadius: 6, borderTopRightRadius: 6, paddingVertical: 10, paddingHorizontal: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: 17, fontWeight: 700, color: '#ffffff' },
    subtitle: { marginTop: 4, fontSize: 8, fontWeight: 700, color: '#dbeafe', letterSpacing: 1.5 },
    day: { fontSize: 12, fontWeight: 700, color: '#f8fafc' },
    section: { marginTop: 10 },
    sectionTitle: { backgroundColor: '#111827', color: '#ffffff', fontSize: 8, fontWeight: 700, paddingVertical: 5, paddingHorizontal: 8, letterSpacing: 1.2, textTransform: 'uppercase' },
    infoRow: { flexDirection: 'row', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#d1d5db' },
    infoLabel: { width: 120, backgroundColor: '#eef2ff', paddingVertical: 6, paddingHorizontal: 8, fontSize: 8, fontWeight: 700, color: '#111827', borderRightWidth: 1, borderRightColor: '#d1d5db' },
    infoValue: { flex: 1, paddingVertical: 6, paddingHorizontal: 8, fontSize: 9, color: '#111111' },
    table: { borderWidth: 1, borderColor: '#111827' },
    tableHead: { flexDirection: 'row', backgroundColor: '#111827' },
    th: { fontSize: 7.5, fontWeight: 700, color: '#ffffff', paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#1f2937' },
    tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#d1d5db' },
    td: { fontSize: 8.5, color: '#111111', paddingVertical: 5, paddingHorizontal: 6, borderRightWidth: 1, borderRightColor: '#d1d5db' },
    notesBlock: { borderWidth: 1, borderColor: '#111827', paddingVertical: 7, paddingHorizontal: 8, fontSize: 9, lineHeight: 1.4, color: '#111111' },
    footer: { marginTop: 10, borderTopWidth: 1.2, borderTopColor: '#111827', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    footerLeft: { flexDirection: 'column', gap: 2 },
    footerMeta: { fontSize: 8, fontWeight: 700, color: '#111827' },
    footerText: { fontSize: 8, color: '#111827' },
    footerRight: { fontSize: 8, fontWeight: 700, color: '#111827', textAlign: 'right' },
  })

  function CallsheetTable({ title, columns, rows }) {
    const widthPercent = `${(100 / Math.max(columns.length, 1)).toFixed(4)}%`
    return (
      <View style={callsheetPdfStyles.section}>
        <Text style={callsheetPdfStyles.sectionTitle}>{title}</Text>
        <View style={callsheetPdfStyles.table}>
          <View style={callsheetPdfStyles.tableHead}>
            {columns.map((column, idx) => (
              <Text key={`${title}-th-${column.key}`} style={[callsheetPdfStyles.th, { width: widthPercent, borderRightWidth: idx === columns.length - 1 ? 0 : 1 }]}>
                {String(column.label || '').toUpperCase()}
              </Text>
            ))}
          </View>
          {rows.map((row, rowIdx) => (
            <View key={`${title}-row-${rowIdx}`} style={[callsheetPdfStyles.tr, { backgroundColor: rowIdx % 2 ? '#f9fafb' : '#ffffff' }]} wrap={false}>
              {columns.map((column, colIdx) => (
                <Text key={`${title}-td-${rowIdx}-${column.key}`} style={[callsheetPdfStyles.td, { width: widthPercent, borderRightWidth: colIdx === columns.length - 1 ? 0 : 1 }]}>
                  {String(row[column.key] ?? '')}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </View>
    )
  }

  return function CallsheetPdfDocument({ payload }) {
    const generatedStamp = new Date().toLocaleString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    return (
      <Document>
        {payload.pages.map((dayPage, pageIdx) => (
          <Page key={`${dayPage.dayNumber}-${pageIdx}`} size="LETTER" style={callsheetPdfStyles.page} wrap>
            <View style={callsheetPdfStyles.header}>
              <View>
                <Text style={callsheetPdfStyles.title}>{dayPage.productionTitle || 'Untitled Project'}</Text>
                <Text style={callsheetPdfStyles.subtitle}>CALLSHEET</Text>
              </View>
              <Text style={callsheetPdfStyles.day}>Day {dayPage.dayNumber}</Text>
            </View>

            {dayPage.generalInfo.length > 0 && (
              <View style={callsheetPdfStyles.section}>
                <Text style={callsheetPdfStyles.sectionTitle}>GENERAL INFO</Text>
                {dayPage.generalInfo.map((row, idx) => (
                  <View key={`gi-${idx}`} style={callsheetPdfStyles.infoRow}>
                    <Text style={callsheetPdfStyles.infoLabel}>{row.label.toUpperCase()}</Text>
                    <Text style={callsheetPdfStyles.infoValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {dayPage.schedule.rows.length > 0 && (
              <CallsheetTable title="ADVANCED SCHEDULE" columns={dayPage.schedule.columns} rows={dayPage.schedule.rows} />
            )}
            {dayPage.cast.rows.length > 0 && (
              <CallsheetTable title="CAST LIST" columns={dayPage.cast.columns} rows={dayPage.cast.rows} />
            )}
            {dayPage.crew.rows.length > 0 && (
              <CallsheetTable title="CREW LIST" columns={dayPage.crew.columns} rows={dayPage.crew.rows} />
            )}

            {dayPage.locationDetails.length > 0 && (
              <View style={callsheetPdfStyles.section}>
                <Text style={callsheetPdfStyles.sectionTitle}>LOCATION DETAILS</Text>
                {dayPage.locationDetails.map((row, idx) => (
                  <View key={`loc-${idx}`} style={callsheetPdfStyles.infoRow}>
                    <Text style={callsheetPdfStyles.infoLabel}>{row.label.toUpperCase()}</Text>
                    <Text style={callsheetPdfStyles.infoValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            {dayPage.additionalNotes && (
              <View style={callsheetPdfStyles.section}>
                <Text style={callsheetPdfStyles.sectionTitle}>ADDITIONAL NOTES / SPECIAL INSTRUCTIONS</Text>
                <Text style={callsheetPdfStyles.notesBlock}>{dayPage.additionalNotes}</Text>
              </View>
            )}

            <View style={callsheetPdfStyles.footer}>
              <View style={callsheetPdfStyles.footerLeft}>
                <Text style={callsheetPdfStyles.footerMeta}>{dayPage.footerMeta}</Text>
                <Text style={callsheetPdfStyles.footerText}>Generated by ShotScribe — {generatedStamp}</Text>
              </View>
              <Text style={callsheetPdfStyles.footerRight}>CONFIDENTIAL — FOR PRODUCTION USE ONLY</Text>
            </View>
          </Page>
        ))}
      </Document>
    )
  }
}

async function downloadCallsheetPdf({ dayIdxFilter = null, projectName, explicitFileName = '' } = {}) {
  const payload = buildCallsheetExportData(dayIdxFilter)
  if (!payload.pages.length) {
    throw new Error('No shooting days scheduled.')
  }
  const base = (projectName || payload.projectName || 'callsheet').replace(/[^a-z0-9]/gi, '_')
  const fileName = explicitFileName || `${base || 'callsheet'}_callsheet.pdf`
  const { pdf, Document, Page, Text, View, StyleSheet } = await getReactPdfRenderer()
  const CallsheetPdfDocument = createCallsheetPdfDocument({ Document, Page, Text, View, StyleSheet })
  const blob = await pdf(<CallsheetPdfDocument payload={payload} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return { filePath: '', fileName }
}

// ── Browser fallback path: html2canvas ────────────────────────────────────────
// Used when running outside Electron (no desktop print-to-PDF bridge).

/**
 * Temporarily replace every <input> and <textarea> inside el with a
 * visible <span>/<pre> showing the current value, so html2canvas captures
 * typed text rather than empty form fields.  Returns a restore function.
 */
function prepareForCapture(el) {
  const replacements = []

  el.querySelectorAll('input, textarea').forEach(input => {
    const isTextarea = input.tagName === 'TEXTAREA'
    const value = input.value ?? ''
    const cs = window.getComputedStyle(input)

    const span = document.createElement(isTextarea ? 'pre' : 'span')
    span.textContent = value
    span.style.fontFamily = cs.fontFamily
    span.style.fontSize = cs.fontSize
    span.style.fontWeight = cs.fontWeight
    span.style.color = cs.color
    span.style.textAlign = cs.textAlign
    span.style.lineHeight = cs.lineHeight
    span.style.letterSpacing = cs.letterSpacing
    span.style.whiteSpace = isTextarea ? 'pre-wrap' : 'pre'
    span.style.display = isTextarea ? 'block' : 'inline-block'
    span.style.verticalAlign = 'middle'
    span.style.margin = '0'
    span.style.padding = '0'
    span.style.border = 'none'
    span.style.background = 'transparent'
    span.style.minWidth = cs.minWidth
    span.style.width = cs.width

    input.parentNode.insertBefore(span, input)
    const prevDisplay = input.style.display
    input.style.display = 'none'
    replacements.push({ span, input, prevDisplay })
  })

  const uiOnly = el.querySelectorAll(
    '.delete-btn, .drag-handle, .add-shot-btn, .add-scene-btn, .add-scene-row'
  )
  const hiddenUi = []
  uiOnly.forEach(uiEl => {
    hiddenUi.push({ el: uiEl, prev: uiEl.style.display })
    uiEl.style.display = 'none'
  })

  return function restore() {
    replacements.forEach(({ span, input, prevDisplay }) => {
      span.remove()
      input.style.display = prevDisplay
    })
    hiddenUi.forEach(({ el: uiEl, prev }) => {
      uiEl.style.display = prev
    })
  }
}

async function captureElementWithTimeout(el, scale = 1.5, timeoutMs = 60000, imageMap = {}) {
  const restore = prepareForCapture(el)
  try {
    return await Promise.race([
      html2canvas(el, {
        scale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 15000,
        onclone: (_clonedDoc, clonedEl) => {
          clonedEl.style.overflow = 'visible'
          // Replace remote img src values with pre-fetched base64 data URLs so
          // html2canvas never encounters a cross-origin URL that would taint the canvas.
          if (Object.keys(imageMap).length > 0) {
            clonedEl.querySelectorAll('img[src]').forEach(img => {
              const src = img.getAttribute('src')
              if (src && imageMap[src]) img.setAttribute('src', imageMap[src])
            })
          }
        },
      }),
      new Promise((_res, rej) =>
        setTimeout(() => rej(new Error(`html2canvas timeout after ${timeoutMs / 1000}s`)), timeoutMs)
      ),
    ])
  } finally {
    restore()
  }
}

async function exportPagesBrowser(pages, imageMap = {}) {
  console.log(`[PDF Export] Starting browser/html2canvas path — ${pages.length} page(s)`)

  let pdf = null
  let scale = 1.5

  for (let i = 0; i < pages.length; i++) {
    let canvas
    try {
      console.log(`[PDF Export] Rendering page ${i + 1}/${pages.length} at scale ${scale}…`)
      canvas = await captureElementWithTimeout(pages[i], scale, 60000, imageMap)
    } catch (scaleErr) {
      console.warn(`[PDF Export] Page ${i + 1} failed at scale ${scale}:`, scaleErr.message)
      if (scale > 1.0) {
        scale = 1.0
        console.log(`[PDF Export] Retrying page ${i + 1} at scale 1.0…`)
        try {
          canvas = await captureElementWithTimeout(pages[i], scale, 60000, imageMap)
        } catch (retryErr) {
          console.error(`[PDF Export] Page ${i + 1} failed on retry:`, retryErr.message)
          continue
        }
      } else {
        console.error(`[PDF Export] Page ${i + 1} failed, skipping…`)
        continue
      }
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.88)
    const pxW = canvas.width / scale
    const pxH = canvas.height / scale

    if (!pdf) {
      pdf = new jsPDF({
        orientation: pxW > pxH ? 'landscape' : 'portrait',
        unit: 'px',
        format: [pxW, pxH],
        hotfixes: ['px_scaling'],
      })
    } else {
      pdf.addPage([pxW, pxH], pxW > pxH ? 'landscape' : 'portrait')
    }

    pdf.addImage(imgData, 'JPEG', 0, 0, pxW, pxH)
    console.log(`[PDF Export] Page ${i + 1} added to PDF`)
  }

  if (!pdf) {
    throw new Error('No pages could be rendered. Check the console for details.')
  }

  pdf.save('storyboard.pdf')
  console.log('[PDF Export] Saved via browser download.')
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Export the storyboard as a PDF.
 * Electron path: builds fresh HTML from store data, passes to printToPDF.
 * Browser fallback: html2canvas captures the live .page-document DOM elements.
 */
export async function exportStoryboardPDF(pageRefs, projectName) {
  try {
    if (platformService.hasPrintToPDF()) {
      // Pre-fetch all remote shot images to base64 so the Electron print-to-PDF
      // renderer never encounters cross-origin URLs that could produce blank frames.
      const imageMap = await preloadShotImages()
      const html = buildStoryboardPrintHtml(imageMap)
      await exportViaPrint(html, projectName, 'storyboard')
    } else {
      const pages = (pageRefs?.current || []).filter(Boolean)
      if (pages.length === 0) {
        console.warn('[PDF Export] No storyboard page elements found — aborting.')
        return
      }
      // Pre-fetch all remote images visible in the live DOM before html2canvas
      // runs, so the canvas is never tainted by cross-origin <img> elements.
      const imageMap = await preloadDomImages(pages)
      await exportPagesBrowser(pages, imageMap)
    }
  } catch (err) {
    console.error('[PDF Export] Storyboard export failed:', err)
    _handleExportError(err)
  }
}

/**
 * Export the shotlist as a PDF.
 * Electron path: builds fresh HTML from store data, passes to printToPDF.
 * Browser fallback: html2canvas captures the live shotlist container element.
 */
export async function exportShotlistPDF(shotlistRef, projectName) {
  try {
    if (platformService.hasPrintToPDF()) {
      const html = buildShotlistPrintHtml()
      await exportViaPrint(html, projectName, 'shotlist')
    } else {
      const el = shotlistRef?.current
      if (!el) {
        console.warn('[PDF Export] Shotlist element not found — aborting.')
        return
      }
      await exportPagesBrowser([el])
    }
  } catch (err) {
    console.error('[PDF Export] Shotlist export failed:', err)
    _handleExportError(err)
  }
}

/**
 * Export the shooting schedule as a PDF.
 * Electron path: builds fresh HTML from store data, passes to printToPDF.
 * Browser fallback: opens a print dialog with generated HTML in a new window.
 */
/**
 * Export an expanded (detailed) shooting schedule as a PDF.
 * Includes projected wrap time and full shot/block details.
 */
export async function exportExpandedSchedulePDF(projectName) {
  try {
    const html = buildExpandedSchedulePrintHtml()
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, 'expanded_schedule')
    } else {
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'schedule').replace(/[^a-z0-9]/gi, '_')}_expanded.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Expanded schedule export failed:', err)
    _handleExportError(err)
  }
}

/**
 * Export the stripboard view as a landscape PDF.
 * Each column = one shoot day; strips show color swatches.
 */
export async function exportStripboardPDF(projectName) {
  try {
    const html = buildStripboardPrintHtml()
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, 'stripboard')
    } else {
      const win = window.open('', '_blank', 'width=1100,height=700')
      if (!win) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'schedule').replace(/[^a-z0-9]/gi, '_')}_stripboard.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Stripboard export failed:', err)
    _handleExportError(err)
  }
}

/**
 * Export the calendar view as a PDF.
 * One page per month with shoot days marked.
 */
export async function exportCalendarPDF(projectName) {
  try {
    const html = buildCalendarPrintHtml()
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, 'calendar')
    } else {
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'schedule').replace(/[^a-z0-9]/gi, '_')}_calendar.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Calendar export failed:', err)
    _handleExportError(err)
  }
}

export async function exportSchedulePDF(projectName) {
  try {
    const html = buildSchedulePrintHtml()
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, 'schedule')
    } else {
      // Browser fallback: open in a new window and trigger print
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        // Popup blocked — fall back to download
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'schedule').replace(/[^a-z0-9]/gi, '_')}_schedule.html`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html)
      win.document.close()
      setTimeout(() => {
        win.focus()
        win.print()
      }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Schedule export failed:', err)
    _handleExportError(err)
  }
}

/**
 * Export callsheets as a PDF — one page per shooting day.
 */
export async function exportCallsheetPDF(projectName) {
  try {
    await downloadCallsheetPdf({ dayIdxFilter: null, projectName })
  } catch (err) {
    console.error('[PDF Export] Callsheet export failed:', err)
    _handleExportError(err)
  }
}

function sanitizeExportFilename(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function exportSingleDayCallsheetPDF({
  dayIdx,
  projectName,
  dayNumber,
  shootDate,
  explicitFileName,
}) {
  const fallbackName = `${projectName || 'Untitled Project'} - Callsheet - Day ${dayNumber || (dayIdx + 1)} - ${shootDate || 'TBD'}.pdf`
  const resolvedFileName = sanitizeExportFilename(explicitFileName || fallbackName) || `Callsheet-Day-${dayIdx + 1}.pdf`
  return downloadCallsheetPdf({
    dayIdxFilter: [dayIdx],
    projectName,
    explicitFileName: resolvedFileName,
  })
}

/** @deprecated Use exportStoryboardPDF or exportShotlistPDF directly */
export async function exportToPDF(pageRefs, projectName) {
  return exportStoryboardPDF(pageRefs, projectName)
}

export async function exportToPNG(pageRefs) {
  const pages = (pageRefs?.current || []).filter(Boolean)
  if (pages.length === 0) return

  try {
    for (let i = 0; i < pages.length; i++) {
      console.log(`[PNG Export] Rendering page ${i + 1}/${pages.length}…`)
      const canvas = await captureElementWithTimeout(pages[i], 2, 60000)
      const filename = pages.length === 1 ? 'storyboard.png' : `storyboard_page${i + 1}.png`

      if (platformService.isDesktop()) {
        const dataURL = canvas.toDataURL('image/png')
        const base64 = dataURL.replace(/^data:image\/png;base64,/, '')
        await platformService.savePNG(filename, base64)
      } else {
        const link = document.createElement('a')
        link.download = filename
        link.href = canvas.toDataURL('image/png')
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      console.log(`[PNG Export] Page ${i + 1} saved.`)
    }
  } catch (err) {
    console.error('[PNG Export] Failed:', err)
    const raw = err?.message || ''
    let msg = `PNG export failed: ${raw || 'Unknown error'}`
    if (/memory|heap|call stack|out of/i.test(raw)) {
      msg += '\n\nTip: try removing or resizing large images.'
    }
    alert(msg)
  }
}

// ── Combined export HTML builder ──────────────────────────────────────────────
// Strips @page rules (including nested @bottom-* rules) from a CSS string so
// we can replace them with named-page rules for the combined document.
function _stripPageRules(css) {
  let result = ''
  let i = 0
  while (i < css.length) {
    const idx = css.indexOf('@page', i)
    if (idx === -1) { result += css.slice(i); break }
    result += css.slice(i, idx)
    const openIdx = css.indexOf('{', idx)
    if (openIdx === -1) { result += css.slice(idx); break }
    let depth = 1
    let j = openIdx + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    i = j
  }
  return result
}

// ── Per-day combined HTML builder ─────────────────────────────────────────────
// options: { shotlist: bool, schedule: bool, callsheet: bool }
function buildDayCombinedHtml(dayIdx, options = {}) {
  const { projectName } = useStore.getState()

  const parts = []
  const cssBlocks = []
  const styles = []

  const extractStyle = (html) => { const m = html.match(/<style>([\s\S]*?)<\/style>/); return m ? m[1] : '' }
  const extractBody  = (html) => { const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/); return m ? m[1].trim() : '' }

  if (options.shotlist) {
    const html = buildShotlistPrintHtml([dayIdx])
    cssBlocks.push(_stripPageRules(extractStyle(html)))
    parts.push({ cls: 'day-shotlist', body: extractBody(html), page: 'sl-page' })
  }
  if (options.schedule) {
    const html = buildSchedulePrintHtml([dayIdx])
    cssBlocks.push(_stripPageRules(extractStyle(html)))
    parts.push({ cls: 'day-schedule', body: extractBody(html), page: 'sc-page' })
  }
  if (options.callsheet) {
    const html = buildCallsheetPrintHtml([dayIdx])
    cssBlocks.push(_stripPageRules(extractStyle(html)))
    parts.push({ cls: 'day-callsheet', body: extractBody(html), page: 'cs-page' })
  }

  if (parts.length === 0) return null

  const pageRules = `
@page sl-page { size: A4 landscape; margin: 12mm 10mm 14mm; }
@page sc-page { size: A4; margin: 10mm 10mm 12mm; }
@page cs-page { size: A4; margin: 12mm 14mm 14mm; }
`
  const wrapperCss = parts.map((p, i) =>
    `.${p.cls} { page: ${p.page}; ${i > 0 ? 'break-before: page; page-break-before: always;' : ''} }`
  ).join('\n')

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Day ${dayIdx + 1} — ${escapeHtml(projectName || 'Untitled')}</title>
<style>
${pageRules}
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #111; }
${wrapperCss}
${cssBlocks.join('\n')}
</style>
</head>
<body>
${parts.map(p => `<div class="${p.cls}">\n${p.body}\n</div>`).join('\n')}
</body>
</html>`
}

export async function exportDayPDF(dayIdx, options, projectName) {
  try {
    const html = buildDayCombinedHtml(dayIdx, options)
    if (!html) { alert('No documents selected.'); return }
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, `day${dayIdx + 1}`)
    } else {
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'export').replace(/[^a-z0-9]/gi, '_')}_day${dayIdx + 1}.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Day export failed:', err)
    _handleExportError(err)
  }
}

function buildCombinedPrintHtml() {
  const { projectName } = useStore.getState()

  const sbHtml = buildStoryboardPrintHtml()
  const slHtml = buildShotlistPrintHtml()
  const scHtml = buildSchedulePrintHtml()
  const csHtml = buildCallsheetPrintHtml()

  const extractStyle = (html) => { const m = html.match(/<style>([\s\S]*?)<\/style>/); return m ? m[1] : '' }
  const extractBody  = (html) => { const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/); return m ? m[1].trim() : '' }

  const sbCss = _stripPageRules(extractStyle(sbHtml))
  const slCss = _stripPageRules(extractStyle(slHtml))
  const scCss = _stripPageRules(extractStyle(scHtml))
  const csCss = _stripPageRules(extractStyle(csHtml))

  const sbBody = extractBody(sbHtml)
  const slBody = extractBody(slHtml)
  const scBody = extractBody(scHtml)
  const csBody = extractBody(csHtml)

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(projectName || 'Untitled')} — Complete Export</title>
<style>
/* Named pages handle orientation per section */
@page sb-page { size: A4 landscape; margin: 8mm 10mm 14mm; }
@page sl-page { size: A4 landscape; margin: 12mm 10mm 14mm; }
@page sc-page { size: A4; margin: 12mm 12mm 14mm; }
@page cs-page { size: A4; margin: 12mm 14mm 14mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #111; }
.combined-storyboard { page: sb-page; }
.combined-shotlist   { page: sl-page; break-before: page; page-break-before: always; }
.combined-schedule   { page: sc-page; break-before: page; page-break-before: always; }
.combined-callsheet  { page: cs-page; break-before: page; page-break-before: always; }
/* Per-section styles */
${sbCss}
${slCss}
${scCss}
${csCss}
</style>
</head>
<body>
<div class="combined-storyboard">
${sbBody}
</div>
<div class="combined-shotlist">
${slBody}
</div>
<div class="combined-schedule">
${scBody}
</div>
<div class="combined-callsheet">
${csBody}
</div>
</body>
</html>`
}

export async function exportAllCombinedPDF(projectName) {
  try {
    const html = buildCombinedPrintHtml()
    if (platformService.hasPrintToPDF()) {
      await exportViaPrint(html, projectName, 'complete')
    } else {
      const win = window.open('', '_blank', 'width=900,height=700')
      if (!win) {
        const blob = new Blob([html], { type: 'text/html' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${(projectName || 'export').replace(/[^a-z0-9]/gi, '_')}_complete.html`
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
        URL.revokeObjectURL(url)
        return
      }
      win.document.write(html); win.document.close()
      setTimeout(() => { win.focus(); win.print() }, 500)
    }
  } catch (err) {
    console.error('[PDF Export] Combined export failed:', err)
    _handleExportError(err)
  }
}

export async function exportAllSeparatePDFs(pageRefs, shotlistRef, projectName) {
  try {
    await exportStoryboardPDF(pageRefs, projectName)
    await exportShotlistPDF(shotlistRef, projectName)
    await exportSchedulePDF(projectName)
    await exportCallsheetPDF(projectName)
  } catch (err) {
    console.error('[PDF Export] Export All (separate) failed:', err)
    _handleExportError(err)
  }
}

function _handleExportError(err) {
  const raw = err?.message || String(err) || 'Unknown error'
  let msg = `PDF export failed: ${raw}`
  if (/memory|heap|call stack|out of/i.test(raw)) {
    msg += '\n\nTip: try removing or resizing large images attached to shots.'
  } else if (/timeout/i.test(raw)) {
    msg += '\n\nTip: the page took too long to render — try exporting fewer scenes at once.'
  } else if (/ipc|main process/i.test(raw)) {
    msg += '\n\nThe Electron main process could not render the page. Check the developer console for details.'
  } else if (/VITE_CALLSHEET_PDF_EXPORT_URL/i.test(raw)) {
    msg += '\n\nTrue PDF export is not configured. Set VITE_CALLSHEET_PDF_EXPORT_URL and rebuild the frontend.'
  } else if (/cors|failed to fetch|network/i.test(raw)) {
    msg += '\n\nThe true PDF endpoint could not be reached (possible CORS/network issue). Verify endpoint deployment and CORS allowlist.'
  } else if (/Server callsheet export failed/i.test(raw)) {
    msg += '\n\nThe true PDF endpoint responded with an error. Check server logs for api/export-callsheet-pdf.'
  }
  alert(msg)
}

// ── ExportModal component ──────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      color: '#999',
      marginBottom: 8,
      paddingBottom: 5,
      borderBottom: '1px solid #e5e7eb',
    }}>
      {children}
    </div>
  )
}

function ExportBtn({ label, sub, onClick, disabled, primary }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        padding: '9px 12px',
        borderRadius: 6,
        border: `1px solid ${primary ? '#2563eb' : '#e5e7eb'}`,
        background: primary ? '#2563eb' : '#f9fafb',
        color: primary ? '#fff' : '#111',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background 0.1s',
        marginBottom: 6,
        fontSize: 13,
        fontWeight: 600,
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = primary ? '#1d4ed8' : '#f3f4f6' }}
      onMouseLeave={e => { if (!disabled) e.currentTarget.style.background = primary ? '#2563eb' : '#f9fafb' }}
    >
      {label}
      {sub && <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.7, marginTop: 1 }}>{sub}</div>}
    </button>
  )
}

export default function ExportModal({ isOpen, onClose, pageRefs, shotlistRef, activeTab, projectName }) {
  const schedule = useStore(s => s.schedule)
  const getProjectData = useStore(s => s.getProjectData)
  const callsheetTabViewState = useStore(s => s.tabViewState?.callsheet)
  const [exporting, setExporting] = useState(false)
  const [exportingKey, setExportingKey] = useState(null)
  const [selectedMobileDayId, setSelectedMobileDayId] = useState('')
  const [snapshotDayIds, setSnapshotDayIds] = useState([])
  const [callsheetScope, setCallsheetScope] = useState('all')

  useEffect(() => {
    if (!schedule.length) {
      setSelectedMobileDayId('')
      setSnapshotDayIds([])
      return
    }
    if (!selectedMobileDayId || !schedule.some(day => day.id === selectedMobileDayId)) {
      setSelectedMobileDayId(schedule[0].id)
    }
    if (!snapshotDayIds.length) {
      setSnapshotDayIds(schedule.slice(0, 3).map(day => day.id))
    }
  }, [schedule, selectedMobileDayId, snapshotDayIds])

  if (!isOpen) return null

  // Resolve the currently-active callsheet day for "Current Day Only" export
  const activeDayId = callsheetTabViewState?.selectedDayId || null
  const activeDayIdx = activeDayId ? schedule.findIndex(d => d.id === activeDayId) : 0
  const activeDay = activeDayIdx >= 0 ? schedule[activeDayIdx] : schedule[0]
  const resolvedDayIdx = activeDayIdx >= 0 ? activeDayIdx : 0

  const run = async (key, fn) => {
    setExporting(true)
    setExportingKey(key)
    try {
      await fn()
    } catch (err) {
      _handleExportError(err)
    } finally {
      setExporting(false)
      setExportingKey(null)
      onClose()
    }
  }

  const busy = (key) => exporting && exportingKey === key
  const activeTabLabel = activeTab === 'shotlist'
    ? 'Shotlist'
    : activeTab === 'schedule'
      ? 'Schedule'
      : activeTab === 'callsheet'
        ? 'Callsheet'
        : 'Storyboard'

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
  const modalStyle = {
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    width: 520,
    maxWidth: '95vw',
    maxHeight: '88vh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  }
  const scrollStyle = {
    flex: 1,
    overflowY: 'auto',
    padding: '0 20px 20px',
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '1px solid #e5e7eb', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#111' }}>Export Hub</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>
              Unified exports for storyboards, shotlists, schedules, callsheets, and reports.
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        <div style={scrollStyle}>

          <div style={{ marginTop: 16, marginBottom: 12, padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, background: '#f8fafc', fontSize: 12, color: '#475569' }}>
            Current focus: <strong>{activeTabLabel}</strong>. All exports are available below from this single hub.
          </div>

          <div style={{ marginTop: 0 }}>
            <SectionLabel>Export All</SectionLabel>
            <ExportBtn
              label={busy('all-combined') ? 'Exporting…' : 'Everything — One Combined PDF'}
              sub="All documents, all days, combined into a single file"
              primary
              disabled={exporting}
              onClick={() => run('all-combined', () => exportAllCombinedPDF(projectName))}
            />
            <ExportBtn
              label={busy('all-separate') ? 'Exporting…' : 'Everything — Separate PDF Files'}
              sub="Storyboard, Shotlist, Schedule, and Callsheet as individual files"
              disabled={exporting}
              onClick={() => run('all-separate', () => exportAllSeparatePDFs(pageRefs, shotlistRef, projectName))}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Storyboards</SectionLabel>
            <ExportBtn
              label={busy('storyboard-pdf') ? 'Exporting…' : 'Storyboard PDF'}
              sub="Produces all storyboard pages in a print-ready PDF."
              disabled={exporting}
              onClick={() => run('storyboard-pdf', () => exportStoryboardPDF(pageRefs, projectName))}
            />
            <ExportBtn
              label={busy('storyboard-png') ? 'Exporting…' : 'Storyboard PNG'}
              sub="Produces PNG images for storyboard pages."
              disabled={exporting}
              onClick={() => run('storyboard-png', () => exportToPNG(pageRefs))}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Shotlists</SectionLabel>
            <ExportBtn
              label={busy('shotlist') ? 'Exporting…' : 'Shotlist PDF'}
              sub="Produces a full shotlist table grouped by day."
              disabled={exporting}
              onClick={() => run('shotlist', () => exportShotlistPDF(shotlistRef, projectName))}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Schedules</SectionLabel>
            <ExportBtn
              label={busy('schedule') ? 'Exporting…' : 'Schedule PDF'}
              sub="Produces the standard day-by-day schedule layout."
              disabled={exporting}
              onClick={() => run('schedule', () => exportSchedulePDF(projectName))}
            />
            <ExportBtn
              label={busy('exp-schedule') ? 'Exporting…' : 'Expanded Schedule PDF'}
              sub="Produces an expanded schedule with call/wrap and detailed shot rows."
              disabled={exporting}
              onClick={() => run('exp-schedule', () => exportExpandedSchedulePDF(projectName))}
            />
            <ExportBtn
              label={busy('exp-stripboard') ? 'Exporting…' : 'Stripboard PDF'}
              sub="Produces a stripboard view with one column per day."
              disabled={exporting}
              onClick={() => run('exp-stripboard', () => exportStripboardPDF(projectName))}
            />
            <ExportBtn
              label={busy('exp-calendar') ? 'Exporting…' : 'Calendar PDF'}
              sub="Produces a monthly calendar with shoot-day highlights."
              disabled={exporting}
              onClick={() => run('exp-calendar', () => exportCalendarPDF(projectName))}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Callsheets</SectionLabel>
            {/* Scope selector */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {[
                { value: 'current', label: 'Current Day Only' },
                { value: 'all', label: 'All Callsheets' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCallsheetScope(opt.value)}
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    borderRadius: 6,
                    border: callsheetScope === opt.value ? '2px solid #2563eb' : '1px solid #d1d5db',
                    background: callsheetScope === opt.value ? '#eff6ff' : '#f9fafb',
                    color: callsheetScope === opt.value ? '#1d4ed8' : '#374151',
                    fontWeight: callsheetScope === opt.value ? 700 : 400,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {callsheetScope === 'current' && activeDay && (
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 6, paddingLeft: 2 }}>
                Day {resolvedDayIdx + 1}{activeDay.date ? ` · ${activeDay.date}` : ''}
              </div>
            )}
            <ExportBtn
              label={busy('callsheet') ? 'Exporting…' : 'Callsheet PDF'}
              sub={callsheetScope === 'current'
                ? 'Exports only the currently-viewed shoot day.'
                : 'Exports every shoot day as a multi-page PDF.'}
              disabled={exporting}
              onClick={() => run('callsheet', () =>
                callsheetScope === 'current'
                  ? exportSingleDayCallsheetPDF({
                      dayIdx: resolvedDayIdx,
                      projectName,
                      dayNumber: resolvedDayIdx + 1,
                      shootDate: activeDay?.date || 'TBD',
                    })
                  : exportCallsheetPDF(projectName)
              )}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Script</SectionLabel>
            <ExportBtn
              label={busy('script-txt') ? 'Exporting…' : 'Script TXT'}
              sub="Downloads the current script as a plain text screenplay file."
              disabled={exporting}
              onClick={() => run('script-txt', async () => {
                const state = useStore.getState()
                const doc = state.scriptDocumentLive || state.scriptDocument
                downloadScriptAsTxt(doc, state.projectName)
              })}
            />
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Reports</SectionLabel>
            <button
              disabled
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '9px 12px',
                borderRadius: 6,
                border: '1px solid #e5e7eb',
                background: '#f9fafb',
                color: '#64748b',
                cursor: 'not-allowed',
                opacity: 0.75,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Reports Export (Not Yet Supported)
              <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.9, marginTop: 1 }}>
                Hidden from workflows for now to avoid broken launch paths.
              </div>
            </button>
          </div>

          <div style={{ marginTop: 20 }}>
            <SectionLabel>Mobile On-set Packages</SectionLabel>
            <ExportBtn
              label={busy('mobile-day') ? 'Exporting…' : 'Mobile Day Package (JSON)'}
              sub="Produces one mobile-day-package JSON for a single shoot day."
              disabled={exporting || !schedule.length}
              onClick={() => run('mobile-day', async () => {
                if (!selectedMobileDayId) throw new Error('Please select a shoot day to export.')
                const { exportMobilePackageFromProject } = await getMobileExportService()
                await exportMobilePackageFromProject(getProjectData(), {
                  mode: 'day',
                  dayId: selectedMobileDayId,
                })
              })}
            />
            <select
              value={selectedMobileDayId}
              onChange={e => setSelectedMobileDayId(e.target.value)}
              disabled={exporting || !schedule.length}
              style={{ width: '100%', marginBottom: 12, padding: 8, borderRadius: 6, background: '#fff', color: '#111', border: '1px solid #d1d5db' }}
            >
              {schedule.length === 0 ? (
                <option value="">Add a shoot day in Schedule first</option>
              ) : schedule.map((day, idx) => (
                <option key={day.id} value={day.id}>
                  Day {idx + 1} · {day.date || 'No date'}
                </option>
              ))}
            </select>
            <ExportBtn
              label={busy('mobile-snapshot') ? 'Exporting…' : 'Mobile Snapshot (JSON)'}
              sub="Produces one mobile-snapshot JSON for selected shoot days."
              disabled={exporting || !schedule.length}
              onClick={() => run('mobile-snapshot', async () => {
                if (!snapshotDayIds.length) throw new Error('Select at least one shoot day for snapshot export.')
                const { exportMobilePackageFromProject } = await getMobileExportService()
                await exportMobilePackageFromProject(getProjectData(), {
                  mode: 'snapshot',
                  dayIds: snapshotDayIds,
                })
              })}
            />
            {schedule.length > 0 ? (
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 6, padding: 8 }}>
                {schedule.map((day, idx) => (
                  <label key={day.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, color: '#334155', fontSize: 12 }}>
                    <input
                      type="checkbox"
                      checked={snapshotDayIds.includes(day.id)}
                      onChange={e => {
                        setSnapshotDayIds(prev => e.target.checked
                          ? [...new Set([...prev, day.id])]
                          : prev.filter(id => id !== day.id))
                      }}
                    />
                    Day {idx + 1} · {day.date || 'No date'}
                  </label>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: '#64748b' }}>
                Add at least one shoot day in the Schedule tab to enable mobile exports.
              </div>
            )}
          </div>

          {schedule.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <SectionLabel>Per-Day PDF Bundle</SectionLabel>
              <div style={{ display: 'grid', gap: 8 }}>
                {schedule.map((day, idx) => (
                  <ExportBtn
                    key={day.id}
                    label={busy(`day-${idx}`) ? 'Exporting…' : `Day ${idx + 1} Bundle PDF`}
                    sub={`Produces shotlist + schedule + callsheet for Day ${idx + 1}${day.date ? ` (${day.date})` : ''}.`}
                    disabled={exporting}
                    onClick={() => run(`day-${idx}`, () => exportDayPDF(idx, { shotlist: true, schedule: true, callsheet: true }, projectName))}
                  />
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
