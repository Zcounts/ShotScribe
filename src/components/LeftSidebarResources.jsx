import React from 'react'
import { BookOpen, Settings } from 'lucide-react'
import useStore from '../store'

export default function LeftSidebarResources() {
  const toggleSettings = useStore(s => s.toggleSettings)

  return (
    <div className="ss-left-sidebar-footer">
      <div className="ss-left-sidebar-divider" />
      <div className="ss-left-sidebar-section-label">Resources</div>
      <button type="button" className="ss-left-sidebar-resource-item">
        <BookOpen size={14} strokeWidth={1.5} />
        Documentation
      </button>
      <button type="button" className="ss-left-sidebar-resource-item" onClick={() => toggleSettings()}>
        <Settings size={14} strokeWidth={1.5} />
        Settings
      </button>
    </div>
  )
}
