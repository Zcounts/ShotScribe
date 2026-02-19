import React, { useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'

async function captureElement(el, scale = 2) {
  return html2canvas(el, {
    scale,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    logging: false,
  })
}

export async function exportToPDF(pageRef) {
  if (!pageRef) return
  try {
    const canvas = await captureElement(pageRef, 2)
    const imgData = canvas.toDataURL('image/jpeg', 0.95)
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width / 2, canvas.height / 2],
    })
    pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width / 2, canvas.height / 2)

    if (window.electronAPI) {
      // Native desktop: use system Save dialog
      const arrayBuffer = pdf.output('arraybuffer')
      await window.electronAPI.savePDF('shotlist.pdf', arrayBuffer)
    } else {
      pdf.save('shotlist.pdf')
    }
  } catch (err) {
    console.error('PDF export failed:', err)
    alert('PDF export failed. Try reducing image sizes.')
  }
}

export async function exportToPNG(pageRef) {
  if (!pageRef) return
  try {
    const canvas = await captureElement(pageRef, 3)

    if (window.electronAPI) {
      // Native desktop: use system Save dialog
      const dataURL = canvas.toDataURL('image/png')
      const base64 = dataURL.replace(/^data:image\/png;base64,/, '')
      await window.electronAPI.savePNG('shotlist.png', base64)
    } else {
      const link = document.createElement('a')
      link.download = 'shotlist.png'
      link.href = canvas.toDataURL('image/png')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  } catch (err) {
    console.error('PNG export failed:', err)
    alert('PNG export failed. Try reducing image sizes.')
  }
}

export default function ExportModal({ isOpen, onClose, onExportPDF, onExportPNG }) {
  const [exporting, setExporting] = useState(false)

  if (!isOpen) return null

  const handleExport = async (type) => {
    setExporting(true)
    try {
      if (type === 'pdf') await onExportPDF()
      else await onExportPNG()
    } finally {
      setExporting(false)
      onClose()
    }
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

        <p className="text-sm text-gray-600 mb-6">
          Export your shotlist as a high-resolution document.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => handleExport('pdf')}
            disabled={exporting}
            className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export PDF'}
            <div className="text-xs font-normal opacity-75">Landscape, print-ready</div>
          </button>
          <button
            onClick={() => handleExport('png')}
            disabled={exporting}
            className="flex-1 py-3 bg-gray-700 text-white rounded-lg font-semibold hover:bg-gray-800 disabled:opacity-50 transition-colors"
          >
            {exporting ? 'Exporting...' : 'Export PNG'}
            <div className="text-xs font-normal opacity-75">High resolution image</div>
          </button>
        </div>
      </div>
    </div>
  )
}
