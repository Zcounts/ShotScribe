import React from 'react'
import useStore from '../store'

export default function RecentProjects() {
  const recentProjects = useStore(s => s.recentProjects)
  const openProject = useStore(s => s.openProject)
  const openProjectFromPath = useStore(s => s.openProjectFromPath)

  if (recentProjects.length === 0) return null

  const handleClick = (project) => {
    // In Electron with a real file path, open directly; otherwise open file picker
    if (window.electronAPI && project.path && project.path !== project.name) {
      openProjectFromPath(project.path)
    } else {
      openProject()
    }
  }

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center gap-3 overflow-x-auto">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">
          Recent:
        </span>
        {recentProjects.slice(0, 5).map((project, i) => (
          <button
            key={i}
            onClick={() => handleClick(project)}
            className="text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap flex items-center gap-1 flex-shrink-0"
            title={`${project.shots} shots — ${new Date(project.date).toLocaleDateString()}`}
          >
            <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0116 9.414V17a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
            </svg>
            {project.name}
          </button>
        ))}
      </div>
    </div>
  )
}
