import React, { useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import useStore from '../store'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getShotLetterForPrint(index) {
  if (index < 26) return String.fromCharCode(65 + index)
  const firstChar = String.fromCharCode(65 + Math.floor(index / 26) - 1)
  const secondChar = String.fromCharCode(65 + (index % 26))
  return firstChar + secondChar
}

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

// ── Storyboard print HTML: built from store data ──────────────────────────────
//
// Generates a self-contained HTML document with one .page-doc div per logical
// storyboard page (each scene paginates its shots into groups of columnCount×2).
// Always uses a hardcoded light theme — white background, black text.
// No reference to the live app DOM.

function buildStoryboardPrintHtml() {
  const { scenes, columnCount, projectName } = useStore.getState()
  const cols = Math.max(2, Math.min(4, columnCount || 4))
  const cardsPerPage = cols * 2  // two rows of cards per page

  const pageDivs = []

  scenes.forEach((scene, sceneIdx) => {
    const sceneNum = sceneIdx + 1
    const shots = scene.shots.map((shot, idx) => ({
      ...shot,
      displayId: `${sceneNum}${getShotLetterForPrint(idx)}`,
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
          ? `<img src="${shot.image}" alt="${escapeHtml(shot.displayId)}">`
          : `<div class="no-img">No image</div>`

        return `<div class="shot-card" style="border-color:${escapeHtml(shot.color || '#4ade80')};">
  <div class="card-hdr">
    <span class="sid">${escapeHtml(shot.displayId)} &mdash; ${escapeHtml(shot.cameraName || '')}</span>
    <span class="fl">${escapeHtml(shot.focalLength || '')}</span>
  </div>
  <div class="card-img" style="border-color:${escapeHtml(shot.color || '#4ade80')};">${imgHtml}</div>
  <table class="specs-tbl">
    <thead><tr><th>SIZE</th><th>TYPE</th><th>MOVE</th><th>EQUIP</th></tr></thead>
    <tbody><tr>
      <td>${escapeHtml(shot.specs?.size || '')}</td>
      <td>${escapeHtml(shot.specs?.type || '')}</td>
      <td>${escapeHtml(shot.specs?.move || '')}</td>
      <td>${escapeHtml(shot.specs?.equip || '')}</td>
    </tr></tbody>
  </table>
  <div class="card-notes">${escapeHtml(shot.notes || '')}</div>
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
.hdr-center { text-align: center; }
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
  font-size: 8pt;
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
  font-size: 7pt;
  color: #666;
  white-space: pre-line;
  text-align: center;
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
.sid { font-size: 7pt; font-weight: 700; font-family: monospace; }
.fl  { font-size: 7pt; font-weight: 400; font-family: monospace; color: #666; }
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
  font-size: 7pt;
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
  font-size: 5.5pt;
  font-weight: 700;
  font-family: monospace;
  letter-spacing: 0.08em;
  text-align: center;
  padding: 1px 0;
  border-bottom: 1px solid #e0dbd0;
  border-right: 1px solid #e0dbd0;
}
.specs-tbl th:last-child { border-right: none; }
.specs-tbl td {
  font-size: 6pt;
  font-family: monospace;
  text-align: center;
  padding: 1px 0;
  border-right: 1px solid #e0dbd0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.specs-tbl td:last-child { border-right: none; }
.card-notes {
  flex: 1 1 0;
  padding: 2px 4px;
  font-size: 6.5pt;
  white-space: pre-wrap;
  word-break: break-word;
  color: #333;
  overflow: hidden;
  min-height: 0;
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

function buildSchedulePrintHtml() {
  const { schedule, scenes, projectName } = useStore.getState()

  // Build a fast shot lookup: shotId → { shot, scene, displayId }
  const shotMap = new Map()
  scenes.forEach((scene, sceneIdx) => {
    scene.shots.forEach((shot, shotIdx) => {
      shotMap.set(shot.id, {
        shot,
        scene,
        displayId: `${sceneIdx + 1}${getShotLetterForPrint(shotIdx)}`,
      })
    })
  })

  const dayDivs = []

  schedule.forEach((day, dayIdx) => {
    const formattedDate = scheduleFormatDate(day.date)
    const startMins = scheduleParseStartTime(day.startTime)
    const hasTimeline = startMins !== null

    let cumulativeMins = 0
    let totalShootMins = 0
    let totalSetupMins = 0
    let totalBreakMins = 0

    const blockRows = day.shotBlocks.map(block => {
      const projectedTime = hasTimeline ? startMins + cumulativeMins : null

      // ── Break block ──────────────────────────────────────────────────
      if (block.type === 'break') {
        const breakMins = parseScheduleMinutes(block.breakDuration)
        totalBreakMins += breakMins
        cumulativeMins += breakMins

        const timelineCell = hasTimeline
          ? (projectedTime !== null
              ? `<td class="tl-cell"><span class="est-badge">~ ${escapeHtml(scheduleFormatTimeOfDay(projectedTime))}</span><br><span class="est-label">EST.</span></td>`
              : `<td class="tl-cell">—</td>`)
          : ''

        return `<tr class="break-row">
          ${timelineCell}
          <td colspan="6" class="break-name-cell">
            <span class="break-icon">⏸</span>
            <strong>${escapeHtml(block.breakName || 'Break')}</strong>
            ${breakMins > 0 ? `<span class="break-dur">${breakMins}m</span>` : ''}
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

    const shotCount = day.shotBlocks.filter(b => b.type !== 'break').length
    const breakCount = day.shotBlocks.filter(b => b.type === 'break').length
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
  ${day.shotBlocks.length === 0
    ? '<p class="no-shots">No shots scheduled for this day.</p>'
    : `<table>
    <colgroup>
      ${hasTimeline ? '<col style="width:90px">' : ''}
      <col style="width:42px">
      <col style="width:auto">
      <col style="width:80px">
      <col style="width:52px">
      <col style="width:52px">
      <col style="width:130px">
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
@page { size: A4; margin: 12mm 12mm 14mm; }
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: #fff;
  color: #111;
  font-family: 'Courier New', Courier, monospace;
  font-size: 9pt;
}
.doc-title {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 6px;
  border-bottom: 2px solid #111;
  margin-bottom: 14px;
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
.day-section {
  margin-bottom: 18px;
}
.day-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f5f3ee;
  color: #111;
  padding: 6px 10px;
  border: 1px solid #bbb;
  border-radius: 2px 2px 0 0;
  margin-bottom: 0;
}
.day-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}
.day-num {
  font-size: 11pt;
  font-weight: 900;
  letter-spacing: 0.04em;
}
.day-date {
  font-size: 9pt;
  font-weight: 400;
  color: #444;
}
.no-date { color: #999; font-style: italic; }
.call-time {
  font-size: 9pt;
  font-weight: 700;
  background: rgba(0,0,0,0.07);
  padding: 1px 6px;
  border-radius: 3px;
  letter-spacing: 0.04em;
  color: #111;
}
.shot-count {
  font-size: 8pt;
  color: #555;
  letter-spacing: 0.06em;
}
.no-shots {
  padding: 10px;
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
  background: #f5f3ee;
  color: #555;
  font-size: 7pt;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  text-align: left;
  padding: 4px 6px;
  border-bottom: 1.5px solid #bbb;
  border-right: 1px solid #ddd;
  white-space: nowrap;
  overflow: hidden;
}
thead th:last-child { border-right: none; }
.tl-th { text-align: center; }
tbody td {
  padding: 4px 6px;
  border-bottom: 1px solid #e8e5e0;
  border-right: 1px solid #e8e5e0;
  vertical-align: top;
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
  font-size: 9pt;
  font-weight: 700;
  color: #1d4ed8;
  letter-spacing: 0.02em;
}
.est-label {
  font-size: 6pt;
  color: #777;
  letter-spacing: 0.1em;
  font-weight: 400;
}
.shot-id {
  font-size: 10pt;
  font-weight: 900;
  vertical-align: middle;
  white-space: nowrap;
}
.subject-cell { font-size: 8.5pt; }
.notes-txt { color: #555; font-style: italic; font-size: 7.5pt; }
.scene-loc { color: #555; font-size: 7.5pt; }
.badge-cell { white-space: nowrap; vertical-align: middle; }
.bdg {
  display: inline-block;
  padding: 1px 4px;
  font-size: 7pt;
  font-weight: 700;
  border: 1px solid #ccc;
  border-radius: 2px;
  background: #f5f5f5;
}
.time-cell {
  text-align: center;
  vertical-align: middle;
  white-space: nowrap;
  font-weight: 600;
}
.cast-cell { font-size: 8pt; }
.totals-row td {
  background: #f0ede4 !important;
  border-top: 1.5px solid #bbb;
  padding: 5px 6px;
  font-size: 8.5pt;
}
.total-val { font-weight: 700; color: #1a1a1a; }
.day-basecamp {
  font-size: 8pt;
  font-weight: 600;
  background: rgba(0,0,0,0.07);
  padding: 1px 6px;
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
  padding: 5px 8px;
  font-size: 8.5pt;
}
.break-icon {
  margin-right: 5px;
}
.break-dur {
  display: inline-block;
  margin-left: 10px;
  font-size: 8pt;
  color: #555;
  background: #fde68a;
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 600;
}
.footer {
  margin-top: 16px;
  border-top: 1px solid #ddd;
  padding-top: 6px;
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
  <div class="doc-title-sub">${schedule.length} day${schedule.length !== 1 ? 's' : ''} · ${schedule.reduce((n, d) => n + d.shotBlocks.filter(b => b.type !== 'break').length, 0)} shots scheduled</div>
</div>

${dayDivs.join('\n')}

<div class="footer">
  <span>Generated by ShotScribe · ${escapeHtml(today)}</span>
  <span class="footer-page">Page <span class="page-num"></span></span>
</div>
</body>
</html>`
}

// ── Shotlist print HTML: built from store data ────────────────────────────────
//
// Generates a self-contained HTML table using the user's current column config.
// Column widths are percentage-based so the table always fills the full page width.
// Font size is 9pt so all columns fit comfortably in landscape A4/Letter.
// Always uses a hardcoded light theme.

function buildShotlistPrintHtml() {
  const { scenes, shotlistColumnConfig, customColumns, projectName } = useStore.getState()

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

  const bodyRows = []
  scenes.forEach((scene, sceneIdx) => {
    const sceneNum = sceneIdx + 1
    const shots = scene.shots.map((shot, idx) => ({
      ...shot,
      displayId: `${sceneNum}${getShotLetterForPrint(idx)}`,
    }))

    const nCols = visibleColumns.length
    const sceneInfo = [scene.sceneLabel, scene.location, scene.intOrExt, scene.dayNight || 'DAY'].join(' | ')
    const shotCount = `${shots.length} SHOT${shots.length !== 1 ? 'S' : ''}`

    bodyRows.push(
      `<tr class="scene-hdr"><td colspan="${nCols}">` +
      `<div class="scene-hdr-inner">` +
      `<span>${escapeHtml(sceneInfo)}</span>` +
      `<span class="shot-count">${escapeHtml(shotCount)}</span>` +
      `</div></td></tr>`
    )

    if (shots.length === 0) {
      bodyRows.push(
        `<tr><td colspan="${nCols}" style="padding:4px 8px;font-style:italic;color:#aaa;">No shots</td></tr>`
      )
    }

    shots.forEach((shot, idx) => {
      const rowCls = [
        idx % 2 === 0 ? 'row-even' : 'row-odd',
        shot.checked ? 'row-chk' : '',
      ].filter(Boolean).join(' ')

      const cells = visibleColumns.map(col => {
        const val = getCellValue(col.key, shot, scene)
        // Notes column wraps; all others truncate
        const isNotes = col.key === 'notes'
        const clsParts = []
        if (col.key === 'checked') clsParts.push('col-c')
        if (!isNotes) clsParts.push('no-wrap')
        const cls = clsParts.length ? ` class="${clsParts.join(' ')}"` : ''
        return `<td${cls}>${escapeHtml(String(val))}</td>`
      }).join('')

      bodyRows.push(`<tr class="${rowCls}">${cells}</tr>`)
    })
  })

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

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
${bodyRows.join('\n')}
  </tbody>
</table>
</body>
</html>`
}

// ── Electron path: webContents.printToPDF() ───────────────────────────────────

async function exportViaPrint(htmlContent, projectName, suffix = '') {
  console.log(`[PDF Export] Starting printToPDF — ${(htmlContent.length / 1024).toFixed(0)}KB`)

  let result
  try {
    result = await window.electronAPI.printToPDF(htmlContent)
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
  const fileName = suffix ? `${base}_${suffix}.pdf` : `${base}.pdf`

  await window.electronAPI.savePDF(fileName, buffer.buffer)
  console.log('[PDF Export] Saved successfully.')
}

// ── Browser fallback path: html2canvas ────────────────────────────────────────
// Used when running outside Electron (no window.electronAPI.printToPDF).

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

async function captureElementWithTimeout(el, scale = 1.5, timeoutMs = 60000) {
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

async function exportPagesBrowser(pages) {
  console.log(`[PDF Export] Starting browser/html2canvas path — ${pages.length} page(s)`)

  let pdf = null
  let scale = 1.5

  for (let i = 0; i < pages.length; i++) {
    let canvas
    try {
      console.log(`[PDF Export] Rendering page ${i + 1}/${pages.length} at scale ${scale}…`)
      canvas = await captureElementWithTimeout(pages[i], scale, 60000)
    } catch (scaleErr) {
      console.warn(`[PDF Export] Page ${i + 1} failed at scale ${scale}:`, scaleErr.message)
      if (scale > 1.0) {
        scale = 1.0
        console.log(`[PDF Export] Retrying page ${i + 1} at scale 1.0…`)
        try {
          canvas = await captureElementWithTimeout(pages[i], scale, 60000)
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
    if (window.electronAPI?.printToPDF) {
      const html = buildStoryboardPrintHtml()
      await exportViaPrint(html, projectName, 'storyboard')
    } else {
      const pages = (pageRefs?.current || []).filter(Boolean)
      if (pages.length === 0) {
        console.warn('[PDF Export] No storyboard page elements found — aborting.')
        return
      }
      await exportPagesBrowser(pages)
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
    if (window.electronAPI?.printToPDF) {
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
export async function exportSchedulePDF(projectName) {
  try {
    const html = buildSchedulePrintHtml()
    if (window.electronAPI?.printToPDF) {
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

      if (window.electronAPI) {
        const dataURL = canvas.toDataURL('image/png')
        const base64 = dataURL.replace(/^data:image\/png;base64,/, '')
        await window.electronAPI.savePNG(filename, base64)
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

function buildCombinedPrintHtml() {
  const { projectName } = useStore.getState()

  const sbHtml = buildStoryboardPrintHtml()
  const slHtml = buildShotlistPrintHtml()
  const scHtml = buildSchedulePrintHtml()

  const extractStyle = (html) => { const m = html.match(/<style>([\s\S]*?)<\/style>/); return m ? m[1] : '' }
  const extractBody  = (html) => { const m = html.match(/<body[^>]*>([\s\S]*?)<\/body>/); return m ? m[1].trim() : '' }

  const sbCss = _stripPageRules(extractStyle(sbHtml))
  const slCss = _stripPageRules(extractStyle(slHtml))
  const scCss = _stripPageRules(extractStyle(scHtml))

  const sbBody = extractBody(sbHtml)
  const slBody = extractBody(slHtml)
  const scBody = extractBody(scHtml)

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
@media print { html, body { margin: 0; } }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #111; }
.combined-storyboard { page: sb-page; }
.combined-shotlist   { page: sl-page; break-before: page; page-break-before: always; }
.combined-schedule   { page: sc-page; break-before: page; page-break-before: always; }
/* Per-section styles */
${sbCss}
${slCss}
${scCss}
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
</body>
</html>`
}

export async function exportAllCombinedPDF(projectName) {
  try {
    const html = buildCombinedPrintHtml()
    if (window.electronAPI?.printToPDF) {
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
  }
  alert(msg)
}

// ── ExportModal component ──────────────────────────────────────────────────────

export default function ExportModal({ isOpen, onClose, pageRefs, shotlistRef, activeTab, projectName }) {
  const [exporting, setExporting] = useState(false)
  const [exportType, setExportType] = useState(null)

  if (!isOpen) return null

  const isAll       = activeTab === 'all'
  const isSchedule  = activeTab === 'schedule'
  const isShotlist  = activeTab === 'shotlist'
  const isStoryboard = !isAll && !isSchedule && !isShotlist

  const tabLabel = isSchedule ? 'Schedule' : isShotlist ? 'Shotlist' : isAll ? 'All' : 'Storyboard'

  const handleExportPDF = async (forceTab) => {
    const tab = forceTab ?? activeTab
    setExporting(true)
    setExportType('pdf-' + tab)
    try {
      if (tab === 'shotlist') {
        await exportShotlistPDF(shotlistRef, projectName)
      } else if (tab === 'schedule') {
        await exportSchedulePDF(projectName)
      } else if (tab === 'all-combined') {
        await exportAllCombinedPDF(projectName)
      } else if (tab === 'all-separate') {
        await exportAllSeparatePDFs(pageRefs, shotlistRef, projectName)
      } else {
        await exportStoryboardPDF(pageRefs, projectName)
      }
    } finally {
      setExporting(false)
      setExportType(null)
      onClose()
    }
  }

  const handleExportPNG = async () => {
    setExporting(true)
    setExportType('png')
    try {
      await exportToPNG(pageRefs)
    } finally {
      setExporting(false)
      setExportType(null)
      onClose()
    }
  }

  const pageCount = (pageRefs?.current || []).filter(Boolean).length

  // ── Export All dialog ──────────────────────────────────────────────────────
  if (isAll) {
    return (
      <div className="modal-overlay" onClick={onClose}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">Export All</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="5" x2="15" y2="15" /><line x1="15" y1="5" x2="5" y2="15" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-5">
            Export the storyboard, shotlist, and schedule as PDFs. Choose how you'd like to save them.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => handleExportPDF('all-combined')}
              disabled={exporting}
              className="flex-1 py-4 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors text-left px-4"
            >
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                {exporting && exportType === 'pdf-all-combined' ? 'Exporting…' : 'One Combined PDF'}
              </div>
              <div className="text-xs font-normal opacity-75">All three documents in a single file</div>
            </button>
            <button
              onClick={() => handleExportPDF('all-separate')}
              disabled={exporting}
              className="flex-1 py-4 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors text-left px-4"
            >
              <div style={{ fontSize: 15, marginBottom: 4 }}>
                {exporting && exportType === 'pdf-all-separate' ? 'Exporting…' : 'Separate PDFs'}
              </div>
              <div className="text-xs font-normal opacity-75">Three individual PDF files, one per document</div>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Export</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="5" y1="5" x2="15" y2="15" />
              <line x1="15" y1="5" x2="5" y2="15" />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          Export your {tabLabel.toLowerCase()} as a print-ready document.
        </p>

        <div className="flex gap-3 mb-3">
          <button
            onClick={() => handleExportPDF()}
            disabled={exporting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exporting && exportType === 'pdf-' + activeTab ? 'Exporting…' : `Export ${tabLabel} PDF`}
            <div className="text-xs font-normal opacity-75">
              {isSchedule
                ? 'Day-by-day layout with timeline & totals'
                : isStoryboard
                  ? 'Card grid layout, one page per scene'
                  : 'Full table layout'}
            </div>
          </button>

          {isStoryboard && (
            <button
              onClick={() => handleExportPNG()}
              disabled={exporting}
              className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              {exporting && exportType === 'png' ? 'Exporting…' : 'Export PNG'}
              <div className="text-xs font-normal opacity-75">One PNG per page</div>
            </button>
          )}
        </div>

        {/* Cross-export links */}
        <div style={{
          borderTop: '1px solid #e5e7eb',
          paddingTop: 12,
          marginTop: 4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <span className="text-xs text-gray-400">Also export:</span>

          {activeTab !== 'storyboard' && (
            <button
              onClick={() => handleExportPDF('storyboard')}
              disabled={exporting}
              className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
            >
              Storyboard PDF →
            </button>
          )}
          {activeTab !== 'shotlist' && (
            <button
              onClick={() => handleExportPDF('shotlist')}
              disabled={exporting}
              className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
            >
              Shotlist PDF →
            </button>
          )}
          {activeTab !== 'schedule' && (
            <button
              onClick={() => handleExportPDF('schedule')}
              disabled={exporting}
              className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
            >
              Schedule PDF →
            </button>
          )}
          {!isStoryboard && (
            <button
              onClick={() => handleExportPNG()}
              disabled={exporting}
              className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50"
            >
              Storyboard PNG →
            </button>
          )}
        </div>

        {isStoryboard && (
          <p className="text-xs text-gray-400 mt-3">
            {pageCount} page{pageCount !== 1 ? 's' : ''} will be exported.
          </p>
        )}
        {isSchedule && (
          <p className="text-xs text-gray-400 mt-3">
            Schedule PDF includes projected timeline (where call times are set) and day totals.
          </p>
        )}
      </div>
    </div>
  )
}
