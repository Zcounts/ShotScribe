import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import useStore from '../store'
import {
  Plus,
  FolderOpen,
  ChevronDown,
  Pencil,
  LayoutGrid,
  Monitor,
  List,
  Play,
  FileInput,
  Calendar,
  FilePlus,
  Download,
  Settings2,
} from 'lucide-react'
import './HomeView.css'
import SidebarPane from './SidebarPane'
import ProjectPropertiesDialog from './ProjectPropertiesDialog'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import { runtimeConfig } from '../config/runtimeConfig'
import { isCloudAuthConfigured } from '../auth/authConfig'
import { notifyError, notifySuccess } from '../lib/toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog'

function monogram(name) {
  const raw = String(name || 'Untitled').trim().split(/\s+/).filter(Boolean)
  if (!raw.length) return 'UN'
  return raw.slice(0, 2).map(part => part[0]).join('').toUpperCase()
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '—'
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatUpdatedAt(timestamp) {
  if (!timestamp) return 'Updated recently'
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Updated recently'
  return `Updated ${date.toLocaleDateString()}`
}

function isEffectivelyBlankProject({ projectName, scenes, schedule, castRoster, crewRoster, scriptScenes, importedScripts }) {
  const hasOnlyDefaultScene = Array.isArray(scenes)
    && scenes.length === 1
    && (scenes[0]?.shots || []).length === 0
    && !scenes[0]?.slugline
    && (scenes[0]?.sceneLabel || '').trim().toUpperCase() === 'SCENE 1'
    && (scenes[0]?.location || '').trim().toUpperCase() === 'LOCATION'
  const hasNoSupportingData = (schedule?.length || 0) === 0
    && (castRoster?.length || 0) === 0
    && (crewRoster?.length || 0) === 0
    && (scriptScenes?.length || 0) === 0
    && (importedScripts?.length || 0) === 0
  const hasDefaultName = !projectName || projectName === 'Untitled Shotlist'
  return hasOnlyDefaultScene && hasNoSupportingData && hasDefaultName
}

export default function HomeView() {
  const scenes = useStore(s => s.scenes)
  const schedule = useStore(s => s.schedule)
  const castRoster = useStore(s => s.castRoster)
  const crewRoster = useStore(s => s.crewRoster)
  const scriptScenes = useStore(s => s.scriptScenes)
  const importedScripts = useStore(s => s.importedScripts)
  const projectName = useStore(s => s.projectName)
  const projectLogline = useStore(s => s.projectLogline)
  const projectHeroImage = useStore(s => s.projectHeroImage)
  const projectHeroOverlayColor = useStore(s => s.projectHeroOverlayColor)
  const projectPath = useStore(s => s.projectPath)
  const browserProjectId = useStore(s => s.browserProjectId)
  const hasUnsavedChanges = useStore(s => s.hasUnsavedChanges)
  const saveSyncState = useStore(s => s.saveSyncState)
  const projectRef = useStore(s => s.projectRef)
  const cloudSyncContext = useStore(s => s.cloudSyncContext)
  const recentProjects = useStore(s => s.recentProjects)
  const setActiveTab = useStore(s => s.setActiveTab)
  const setTabViewState = useStore(s => s.setTabViewState)
  const homeTabViewState = useStore(s => s.tabViewState.home)
  const newProject = useStore(s => s.newProject)
  const openProject = useStore(s => s.openProject)
  const openCloudProject = useStore(s => s.openCloudProject)
  const cloudAccessPolicy = useCloudAccessPolicy()

  const [pendingOpenProjectId, setPendingOpenProjectId] = useState(null)
  const [contextMenu, setContextMenu] = useState(null)
  const [heroContextMenu, setHeroContextMenu] = useState(null)
  const [deleteConfirmProject, setDeleteConfirmProject] = useState(null)
  const [cloudProjectsExpanded, setCloudProjectsExpanded] = useState(true)
  const [pendingDeletionExpanded, setPendingDeletionExpanded] = useState(true)
  const menuRef = useRef(null)
  const heroMenuRef = useRef(null)

  const shotCount = useMemo(
    () => scenes.reduce((sum, scene) => sum + ((scene?.shots || []).length), 0),
    [scenes]
  )
  const imageCount = useMemo(
    () => scenes.reduce((sum, scene) => (
      sum + (scene?.shots || []).filter(shot => !!(shot?.image || shot?.imageAsset?.thumb || shot?.imageAsset?.full)).length
    ), 0),
    [scenes]
  )
  const dayCount = Array.isArray(schedule) ? schedule.length : 0
  const firstShootDate = schedule?.[0]?.date || null
  const hasLoadedProject = Boolean(projectRef?.projectId || projectPath || browserProjectId)
  const cloudEnvEnabled = runtimeConfig.appMode.cloudEnabled
  const cloudAuthConfigured = isCloudAuthConfigured()
  const signedInForCloud = Boolean(cloudSyncContext?.currentUserId)
  const cloudListEnabled = cloudEnvEnabled && cloudAuthConfigured && signedInForCloud && cloudAccessPolicy?.paidCloudAccess
  const cloudProjects = useQuery('projects:listProjectsForCurrentUser', cloudListEnabled ? {} : 'skip')
  const homeHeroDefaults = useQuery('admin:getHomeHeroDefaultsPublic', cloudEnvEnabled ? {} : 'skip')
  const pendingDeleteProjects = useQuery('projects:listPendingDeletionProjectsForCurrentUser', cloudListEnabled ? {} : 'skip')
  const markProjectPendingDeletion = useMutation('projects:markProjectPendingDeletion')
  const restorePendingDeletionProject = useMutation('projects:restorePendingDeletionProject')
  const updateProjectIdentity = useMutation('projects:updateProjectIdentity')
  const [projectPropertiesOpen, setProjectPropertiesOpen] = useState(false)

  const sidebarRecent = (Array.isArray(recentProjects) && recentProjects.length > 0)
    ? recentProjects.slice(0, 3)
    : [
        { name: 'Night Exterior', shots: 24 },
        { name: 'Warehouse Unit B', shots: 16 },
        { name: 'Stage Two Pickup', shots: 8 },
      ]
  const hasBlockingUnsavedChanges = hasUnsavedChanges
    && saveSyncState?.status === 'unsaved_changes'
    && !isEffectivelyBlankProject({ projectName, scenes, schedule, castRoster, crewRoster, scriptScenes, importedScripts })
  const cloudProjectsExpanded = homeTabViewState.cloudProjectsExpanded
  const pendingDeletionExpanded = homeTabViewState.pendingDeletionExpanded

  useEffect(() => {
    if (!contextMenu && !heroContextMenu) return
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setContextMenu(null)
      if (heroMenuRef.current && !heroMenuRef.current.contains(event.target)) setHeroContextMenu(null)
    }
    const onEsc = (event) => {
      if (event.key === 'Escape') {
        setContextMenu(null)
        setHeroContextMenu(null)
      }
    }
    document.addEventListener('mousedown', closeMenu)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', closeMenu)
      document.removeEventListener('keydown', onEsc)
    }
  }, [contextMenu, heroContextMenu])

  const requestOpenCloudProject = (projectId) => {
    setContextMenu(null)
    if (!projectId || String(projectRef?.projectId || '') === String(projectId)) return
    if (hasBlockingUnsavedChanges) {
      setPendingOpenProjectId(String(projectId))
      return
    }
    openCloudProject({ projectId: String(projectId) }).catch((error) => {
      notifyError(error?.message || 'Could not open cloud project.')
    })
  }

  const confirmSwitchProject = async () => {
    const targetId = pendingOpenProjectId
    setPendingOpenProjectId(null)
    if (!targetId) return
    try {
      await openCloudProject({ projectId: targetId })
    } catch (error) {
      notifyError(error?.message || 'Could not open cloud project.')
    }
  }

  const handleDeleteProject = async () => {
    if (!deleteConfirmProject?._id) return
    try {
      await markProjectPendingDeletion({ projectId: deleteConfirmProject._id })
      notifySuccess(`${deleteConfirmProject.name || 'Project'} moved to pending deletion. You can restore it within 24 hours.`)
    } catch (error) {
      notifyError(error?.message || 'Could not delete cloud project.')
    } finally {
      setDeleteConfirmProject(null)
      setContextMenu(null)
    }
  }

  const handleRestoreProject = async (projectId) => {
    try {
      const result = await restorePendingDeletionProject({ projectId })
      if (result?.ok) notifySuccess('Project restored.')
      else notifyError('Restore window has elapsed for this project.')
    } catch (error) {
      notifyError(error?.message || 'Could not restore cloud project.')
    }
  }

  const workflowCards = [
    {
      name: 'Write',
      stage: 'Stage 01',
      icon: Pencil,
      accent: '#7C2D3E',
      description: 'Draft pages, import scripts, and shape scene flow before visual planning.',
      links: [
        { label: 'Script Editor', tab: 'script' },
        { label: 'Import .fountain / .fdx', tab: 'script' },
      ],
    },
    {
      name: 'Breakdown',
      stage: 'Stage 02',
      icon: LayoutGrid,
      accent: '#a07a1a',
      description: 'Analyze scenes, track notes, and prep production metadata by sequence.',
      links: [
        { label: 'Scene Manager', tab: 'scenes' },
        { label: 'Script Notes', tab: 'script' },
      ],
    },
    {
      name: 'Visualize',
      stage: 'Stage 03',
      icon: Monitor,
      accent: '#5265EC',
      description: 'Build storyboard pages and shape visual intent across every setup.',
      links: [
        { label: 'Storyboard', tab: 'storyboard' },
        { label: 'Shot Cards', tab: 'storyboard' },
      ],
    },
    {
      name: 'Plan',
      stage: 'Stage 04',
      icon: List,
      accent: '#5265EC',
      description: 'Organize shotlists and map each day with practical scheduling structure.',
      links: [
        { label: 'Shotlist', tab: 'shotlist' },
        { label: 'Schedule', tab: 'schedule' },
      ],
    },
    {
      name: 'Shoot',
      stage: 'Stage 05',
      icon: Play,
      accent: '#CC2936',
      description: 'Finalize callsheets and align cast/crew for a smooth production day.',
      links: [
        { label: 'Callsheet', tab: 'callsheet' },
        { label: 'Cast / Crew', tab: 'castcrew' },
      ],
    },
  ]

  const quickActions = [
    {
      title: 'Import Script',
      subtitle: 'Load .fountain, .fdx, or plain text',
      icon: FileInput,
      accent: '#5265EC',
      onClick: () => {
        setActiveTab('script')
        // TODO: trigger script import modal directly when a global handler is exposed.
      },
    },
    {
      title: 'Jump to Schedule',
      subtitle: '8 shoot days · Day 1 — May 2',
      icon: Calendar,
      accent: '#a07a1a',
      onClick: () => setActiveTab('schedule'),
    },
    {
      title: 'Generate Callsheet',
      subtitle: 'Next up: Day 1 — Sat, May 2',
      icon: FilePlus,
      accent: '#CC2936',
      onClick: () => {
        // TODO: connect quick action to callsheet generation flow.
      },
    },
    {
      title: 'Open Storyboard',
      subtitle: shotCount > 0 ? `${shotCount} shots · ${imageCount || '—'} images` : '—',
      icon: Monitor,
      accent: '#5265EC',
      onClick: () => setActiveTab('storyboard'),
    },
    {
      title: 'View Shotlist',
      subtitle: `${shotCount || '—'} shots · ${scenes.length || '—'} scenes`,
      icon: List,
      accent: '#a07a1a',
      onClick: () => setActiveTab('shotlist'),
    },
    {
      title: 'Export PDF',
      subtitle: 'Storyboard, shotlist, or callsheet',
      icon: Download,
      accent: '#CC2936',
      onClick: () => {
        // TODO: connect quick action to export PDF flow.
      },
    },
  ]

  const defaultHeroBackground = 'https://fairlyodd.org/wp-content/uploads/2022/12/camera.jpg'
  const heroBackgroundImage = projectHeroImage?.imageAsset?.thumb || projectHeroImage?.image || null
  const resolvedProjectHeroBackground = heroBackgroundImage || defaultHeroBackground
  const heroOverlayColor = projectHeroOverlayColor || '#1f1f27'
  const projectTitle = String(projectName || '').trim()
  const defaultHeroTitle = (homeHeroDefaults?.headline || '').trim() || 'Build the Shot. Run the Day.'
  const defaultHeroSubhead = (homeHeroDefaults?.subhead || '').trim() || 'Script breakdown, storyboards, shotlists, scheduling, and callsheets in one workspace built to carry a production from first draft to shoot day.'

  const saveProjectIdentity = async ({ name, emoji }) => {
    if (projectRef?.type !== 'cloud') return
    await updateProjectIdentity({
      projectId: projectRef.projectId,
      name,
      emoji,
    })
  }

  return (
    <div className="home-view">
      <SidebarPane bodyClassName="home-sidebar-content" hideMobileToggle>
        {cloudListEnabled ? (
          <>
            <button
              type="button"
              className="home-section-toggle"
              onClick={() => setTabViewState('home', { cloudProjectsExpanded: !cloudProjectsExpanded })}
              aria-expanded={cloudProjectsExpanded}
            >
              <span className="home-section-label">Cloud Projects</span>
              <ChevronDown size={12} strokeWidth={1.8} className={`home-section-caret ${cloudProjectsExpanded ? 'is-expanded' : ''}`} />
            </button>
            {cloudProjectsExpanded ? (
              <div className="home-recent-list">
                {Array.isArray(cloudProjects) && cloudProjects.length > 0 ? cloudProjects.map((project) => (
                  <button
                    key={String(project._id)}
                    className={`home-recent-item ${String(projectRef?.projectId || '') === String(project._id) ? 'active' : ''}`}
                    type="button"
                    onClick={() => requestOpenCloudProject(String(project._id))}
                    onContextMenu={(event) => {
                      event.preventDefault()
                      setContextMenu({
                        project,
                        x: event.clientX,
                        y: event.clientY,
                      })
                    }}
                  >
                    <div className="home-thumb">{project.emoji || monogram(project.name)}</div>
                    <div>
                      <div className="home-recent-name">{project.name}</div>
                      <div className="home-recent-meta">{formatUpdatedAt(project.updatedAt)} · {project.currentUserRole}</div>
                    </div>
                  </button>
                )) : <div className="home-empty-note">No cloud projects yet.</div>}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="home-section-label">Recent Projects</div>
            <div className="home-recent-list">
              {sidebarRecent.map((project, index) => (
                <button key={`${project.name}-${index}`} className={`home-recent-item ${index === 0 ? 'active' : ''}`} type="button">
                  <div className="home-thumb">{monogram(project.name)}</div>
                  <div>
                    <div className="home-recent-name">{project.name}</div>
                    <div className="home-recent-meta">{project.shots ?? '—'} shots · {project.scenes ?? '—'} scenes</div>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {cloudListEnabled && Array.isArray(pendingDeleteProjects) && pendingDeleteProjects.length > 0 ? (
          <div className="home-pending-list">
            <button
              type="button"
              className="home-section-toggle"
              onClick={() => setTabViewState('home', { pendingDeletionExpanded: !pendingDeletionExpanded })}
              aria-expanded={pendingDeletionExpanded}
            >
              <span className="home-section-label">Pending deletion</span>
              <ChevronDown size={12} strokeWidth={1.8} className={`home-section-caret ${pendingDeletionExpanded ? 'is-expanded' : ''}`} />
            </button>
            {pendingDeletionExpanded ? pendingDeleteProjects.map((project) => (
              <div key={`pending-${String(project._id)}`} className="home-pending-item">
                <div className="home-pending-copy">
                  <div className="home-recent-name">{project.name}</div>
                  <div className="home-recent-meta">Deletes after {new Date(project.deleteAfter).toLocaleString()}</div>
                </div>
                <button type="button" className="ss-btn ghost home-pending-restore" onClick={() => handleRestoreProject(project._id)}>
                  Restore
                </button>
              </div>
            )) : null}
          </div>
        ) : null}

        <div className="home-action-stack">
          <button type="button" className="ss-btn home-btn-dashed home-btn-inline" onClick={() => newProject()}>
            <Plus size={14} strokeWidth={1.5} />
            New Project
          </button>
          <button type="button" className="ss-btn ghost home-btn-inline" onClick={() => openProject()}>
            <FolderOpen size={14} strokeWidth={1.5} />
            Open Project
          </button>
        </div>
      </SidebarPane>

      <main className="home-main">
        <section
          className={`home-hero ${hasLoadedProject ? 'project-loaded' : ''}`}
          style={hasLoadedProject
            ? {
                backgroundImage: `linear-gradient(0deg, ${heroOverlayColor}99, ${heroOverlayColor}99), url(${resolvedProjectHeroBackground})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : {
                backgroundImage: `linear-gradient(0deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url(${defaultHeroBackground})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
          onContextMenu={(event) => {
            event.preventDefault()
            setContextMenu(null)
            setHeroContextMenu({
              x: event.clientX,
              y: event.clientY,
            })
          }}
        >
          <div>
            <div className="home-hero-kicker">{hasLoadedProject ? '// Active Project' : '// ShotScribe · Production Suite'}</div>
            <div className="home-hero-title">
              {hasLoadedProject && projectTitle ? (
                <span className="home-hero-project-title-text">{projectTitle}</span>
              ) : (
                <>
                  {defaultHeroTitle}
                </>
              )}
            </div>
            <div className="home-hero-copy">
              {hasLoadedProject
                ? (projectLogline || 'Add a project logline in Project Properties.')
                : defaultHeroSubhead}
            </div>
          </div>
          <div className="home-hero-actions">
            {hasLoadedProject ? (
              <button type="button" className="ss-btn ghost home-btn-inline home-hero-project-props-btn" onClick={() => setProjectPropertiesOpen(true)}>
                <Settings2 size={14} strokeWidth={1.6} />
                Project Properties
              </button>
            ) : (
              <>
                <button type="button" className="ss-btn ghost" onClick={() => openProject()}>Open Project</button>
                <button type="button" className="ss-btn primary" onClick={() => newProject()}>New Project</button>
              </>
            )}
          </div>
        </section>

        <section className="home-stat-strip">
          {[
            { value: scenes.length || '—', label: 'SCENES' },
            { value: shotCount || '—', label: 'SHOTS PLANNED', className: 'is-mustard' },
            { value: dayCount || '—', label: 'SHOOT DAYS' },
            { value: formatDateLabel(firstShootDate), label: 'FIRST DAY', className: 'is-blue' }, // TODO: confirm chronological first date from schedule model.
            { value: castRoster.length || '—', label: 'CAST MEMBERS' },
            { value: 0, label: 'CONFLICTS' },
          ].map((item) => (
            <div className="home-stat-item" key={item.label}>
              <div className={`home-stat-value ${item.className || ''}`}>{item.value}</div>
              <div className="home-stat-label">{item.label}</div>
            </div>
          ))}
        </section>

        <div className="home-content-pad">
          <div className="home-section-head">
            <div className="home-section-index">01</div>
            <div className="home-section-title">Production Workflow</div>
            <div className="home-section-line" />
            <div className="home-chip">5 modules</div>
          </div>

          <section className="home-workflow-grid">
            {workflowCards.map((card) => {
              const Icon = card.icon
              return (
                <article key={card.name} className="home-work-card" style={{ '--card-accent': card.accent }}>
                  <div className="home-work-head">
                    <div className="home-icon-wrap" style={{ background: `${card.accent}1A`, color: card.accent }}>
                      <Icon size={18} strokeWidth={1.8} />
                    </div>
                    <div>
                      <div className="home-stage">{card.stage}</div>
                      <div className="home-work-name">{card.name}</div>
                    </div>
                  </div>
                  <div className="home-work-desc">{card.description}</div>
                  <div className="home-work-links">
                    {card.links.map(link => (
                      <button key={link.label} type="button" className="home-work-link" onClick={() => setActiveTab(link.tab)}>
                        <span className="home-dot" style={{ background: card.accent }} />
                        {link.label}
                      </button>
                    ))}
                  </div>
                </article>
              )
            })}
          </section>

          <section className="home-quick-row">
            <div className="home-section-head">
              <div className="home-section-index">// Quick Actions</div>
              <div className="home-section-line" />
              <div className="home-chip mustard">{projectName || 'Untitled'}</div>
            </div>
            <div className="home-quick-grid">
              {quickActions.map((action) => {
                const Icon = action.icon
                return (
                  <button type="button" key={action.title} className="home-quick-card" onClick={action.onClick}>
                    <span className="home-quick-icon" style={{ background: `${action.accent}1A`, color: action.accent }}>
                      <Icon size={18} strokeWidth={1.8} />
                    </span>
                    <span>
                      <div className="home-quick-title">{action.title}</div>
                      <div className="home-quick-subtitle">{action.subtitle}</div>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <footer className="home-footer">
          <div className="home-footer-brand">
            <span className="home-footer-brand-name">SHOTSCRIBE</span>
            <span className="home-footer-version">v1.0.0</span>
          </div>
          <div className="home-footer-links">
            <button type="button" className="home-footer-link">Documentation</button>
            <button type="button" className="home-footer-link">Changelog</button>
            <button type="button" className="home-footer-link">GitHub</button>
          </div>
        </footer>
      </main>
      {contextMenu ? (
        <div
          ref={menuRef}
          className="home-cloud-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button type="button" className="home-cloud-menu-item" onClick={() => requestOpenCloudProject(String(contextMenu.project._id))}>Open</button>
          <button type="button" className="home-cloud-menu-item disabled" disabled title="Coming soon">Make Copy (Coming soon)</button>
          <button
            type="button"
            className="home-cloud-menu-item danger"
            onClick={() => {
              setDeleteConfirmProject(contextMenu.project)
              setContextMenu(null)
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
      {heroContextMenu ? (
        <div
          ref={heroMenuRef}
          className="home-cloud-menu"
          style={{ left: heroContextMenu.x, top: heroContextMenu.y }}
        >
          {hasLoadedProject ? (
            <button type="button" className="home-cloud-menu-item" onClick={() => {
              setProjectPropertiesOpen(true)
              setHeroContextMenu(null)
            }}
            >
              Project Properties
            </button>
          ) : (
            <button type="button" className="home-cloud-menu-item disabled" disabled title="Load a project to edit project properties">
              Project Properties (Load project first)
            </button>
          )}
        </div>
      ) : null}

      <AlertDialog open={!!pendingOpenProjectId} onOpenChange={(open) => { if (!open) setPendingOpenProjectId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch projects?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved local changes. Open another project anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay here</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSwitchProject}>Open project</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirmProject} onOpenChange={(open) => { if (!open) setDeleteConfirmProject(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This project will be deleted. You can restore it within 24 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteProject}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <ProjectPropertiesDialog
        open={projectPropertiesOpen}
        onClose={() => setProjectPropertiesOpen(false)}
        onSaveIdentity={saveProjectIdentity}
      />
    </div>
  )
}
