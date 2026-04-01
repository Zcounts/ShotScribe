import React, { useMemo } from 'react'
import useStore from '../store'
import {
  Plus,
  FolderOpen,
  Pencil,
  LayoutGrid,
  Monitor,
  List,
  Play,
  FileInput,
  Calendar,
  FilePlus,
  Download,
} from 'lucide-react'
import './HomeView.css'
import SidebarPane from './SidebarPane'

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

export default function HomeView() {
  const scenes = useStore(s => s.scenes)
  const schedule = useStore(s => s.schedule)
  const castRoster = useStore(s => s.castRoster)
  const projectName = useStore(s => s.projectName)
  const projectPath = useStore(s => s.projectPath)
  const browserProjectId = useStore(s => s.browserProjectId)
  const recentProjects = useStore(s => s.recentProjects)
  const setActiveTab = useStore(s => s.setActiveTab)
  const newProject = useStore(s => s.newProject)
  const openProject = useStore(s => s.openProject)

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
  const hasLoadedProject = Boolean(projectPath || browserProjectId)

  const sidebarRecent = (Array.isArray(recentProjects) && recentProjects.length > 0)
    ? recentProjects.slice(0, 3)
    : [
        { name: 'Night Exterior', shots: 24 },
        { name: 'Warehouse Unit B', shots: 16 },
        { name: 'Stage Two Pickup', shots: 8 },
      ]

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

  return (
    <div className="home-view">
      <SidebarPane bodyClassName="home-sidebar-content">
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
        {!hasLoadedProject && (
          <section className="home-hero">
            <div>
              <div className="home-hero-kicker">// ShotScribe · Production Suite</div>
              <div className="home-hero-title">
                Build the <span className="is-blue">Shot.</span><br />
                Run the <span className="is-blue">Day.</span>
              </div>
              <div className="home-hero-copy">
                Script breakdown, storyboards, shotlists, scheduling, and callsheets in one workspace built to carry a production from first draft to shoot day.
              </div>
            </div>
            <div className="home-hero-actions">
              <button type="button" className="ss-btn ghost" onClick={() => openProject()}>Open Project</button>
              <button type="button" className="ss-btn primary" onClick={() => newProject()}>New Project</button>
            </div>
          </section>
        )}

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
    </div>
  )
}
