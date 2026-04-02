import React, { useMemo, useState, useRef, useEffect } from 'react'
import useStore from '../store'
import { naturalSortSceneNumber } from '../utils/sceneSort'
import SceneColorPicker from './SceneColorPicker'
import ScenePropertiesPanel, { CharacterTagInput } from './ScenePropertiesPanel'
import { estimateScreenplayPagination } from '../utils/screenplay'
import SidebarPane from './SidebarPane'
import compactIcon from '../../assets/script icons/compct.svg'
import visualIcon from '../../assets/script icons/visual.svg'
import listIcon from '../../assets/script icons/list.svg'
import useResponsiveViewport from '../hooks/useResponsiveViewport'

const VIEW_MODES = [
  { value: 'compactGrid', label: 'Compact', icon: compactIcon },
  { value: 'visualGrid', label: 'Visual', icon: visualIcon },
  { value: 'productionList', label: 'List', icon: listIcon },
]

const COLUMN_OPTIONS_BY_MODE = {
  compactGrid: [1, 2, 3, 4],
  visualGrid: [1, 2, 3],
}

const SORT_OPTIONS = [
  { value: 'sceneNumber', label: 'Scene Number' },
  { value: 'scriptOrder', label: 'Script Order' },
  { value: 'slugline', label: 'Slugline / Title' },
  { value: 'location', label: 'Location' },
  { value: 'shotCount', label: 'Shot Count' },
  { value: 'pageCount', label: 'Page Count' },
  { value: 'intExt', label: 'INT / EXT' },
  { value: 'dayNight', label: 'DAY / NIGHT' },
]

const GROUP_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'location', label: 'Location' },
  { value: 'time', label: 'INT/EXT + DAY/NIGHT' },
  { value: 'importSource', label: 'Imported Script' },
]

const METADATA_TOGGLE_OPTIONS = [
  { key: 'showLocation', label: 'Show location' },
  { key: 'showIntExtDayNight', label: 'Show INT/EXT + DAY/NIGHT' },
  { key: 'showCastCount', label: 'Show cast count' },
  { key: 'showScheduleBadge', label: 'Show schedule badge' },
  { key: 'showStoryboardThumb', label: 'Show storyboard thumbnail' },
]

export default function ScenesTab({
  onConfigureOpenChange = () => {},
}) {
  const scriptScenes = useStore(s => s.scriptScenes)
  const scenes = useStore(s => s.scenes)
  const updateScriptScene = useStore(s => s.updateScriptScene)
  const deleteScriptScene = useStore(s => s.deleteScriptScene)
  const importScriptScenes = useStore(s => s.importScriptScenes)
  const linkShotToScene = useStore(s => s.linkShotToScene)
  const openScenePropertiesDialog = useStore(s => s.openScenePropertiesDialog)
  const scenesViewState = useStore(s => s.tabViewState?.scenes || {})
  const setTabViewState = useStore(s => s.setTabViewState)
  const setActiveTab = useStore(s => s.setActiveTab)
  const schedule = useStore(s => s.schedule)

  const [viewMode, setViewMode] = useState(() => scenesViewState.sceneViewMode || 'compactGrid')
  const [columnCount, setColumnCount] = useState(() => {
    const value = Number(scenesViewState.sceneColumnCount ?? scenesViewState.columnCount)
    const allowed = COLUMN_OPTIONS_BY_MODE[scenesViewState.sceneViewMode || 'compactGrid'] || COLUMN_OPTIONS_BY_MODE.compactGrid
    return allowed.includes(value) ? value : allowed[allowed.length - 1]
  })
  const [sortBy, setSortBy] = useState(() => scenesViewState.sortBy || 'sceneNumber')
  const [sortDirection, setSortDirection] = useState(() => scenesViewState.sortDirection || 'asc')
  const [groupBy, setGroupBy] = useState(() => scenesViewState.groupBy || 'none')
  const [metadataVisibility, setMetadataVisibility] = useState(() => ({
    showLocation: scenesViewState.metadataVisibility?.showLocation ?? true,
    showIntExtDayNight: scenesViewState.metadataVisibility?.showIntExtDayNight ?? true,
    showCastCount: scenesViewState.metadataVisibility?.showCastCount ?? true,
    showScheduleBadge: scenesViewState.metadataVisibility?.showScheduleBadge ?? true,
    showStoryboardThumb: scenesViewState.metadataVisibility?.showStoryboardThumb ?? true,
  }))
  const [panelCollapsed, setPanelCollapsed] = useState(() => ({
    viewOptions: scenesViewState.sidebarPanelCollapsed?.viewOptions ?? false,
    sceneOrganization: scenesViewState.sidebarPanelCollapsed?.sceneOrganization ?? false,
  }))
  const [expandedIds, setExpandedIds] = useState({})
  const [editingSceneNumberId, setEditingSceneNumberId] = useState(null)
  const [editSceneNumberValue, setEditSceneNumberValue] = useState('')
  const [invalidEdit, setInvalidEdit] = useState(false)
  const [selectedSceneIds, setSelectedSceneIds] = useState([])
  const [combineOpen, setCombineOpen] = useState(false)
  const listRef = useRef(null)

  const linkedShotsMap = useMemo(() => {
    const map = {}
    scenes.forEach((scene, sceneIdx) => {
      scene.shots.forEach((shot, shotIdx) => {
        if (shot.linkedSceneId) {
          if (!map[shot.linkedSceneId]) map[shot.linkedSceneId] = []
          map[shot.linkedSceneId].push({ ...shot, displayId: `${sceneIdx + 1}${String.fromCharCode(65 + shotIdx)}` })
        }
      })
    })
    return map
  }, [scenes])

  const pagination = useMemo(() => estimateScreenplayPagination(scriptScenes), [scriptScenes])
  const scriptOrderMap = useMemo(() => {
    const map = {}
    scriptScenes.forEach((scene, idx) => { map[scene.id] = idx })
    return map
  }, [scriptScenes])

  const scheduledDayCountByScene = useMemo(() => {
    const shotIdToSceneId = {}
    scenes.forEach(scene => {
      scene.shots.forEach(shot => {
        shotIdToSceneId[shot.id] = shot.linkedSceneId || null
      })
    })
    const perSceneDays = {}
    ;(schedule || []).forEach(day => {
      ;(day.blocks || []).forEach(block => {
        if (block.type !== 'shot' || !block.shotId) return
        const linkedSceneId = shotIdToSceneId[block.shotId]
        if (!linkedSceneId) return
        if (!perSceneDays[linkedSceneId]) perSceneDays[linkedSceneId] = new Set()
        perSceneDays[linkedSceneId].add(day.id)
      })
    })
    return Object.fromEntries(Object.entries(perSceneDays).map(([k, v]) => [k, v.size]))
  }, [schedule, scenes])

  const visibleScenes = useMemo(() => {
    const subset = scriptScenes
    const baseSorted = [...subset].sort(naturalSortSceneNumber)
    const directionMultiplier = sortDirection === 'desc' ? -1 : 1
    const safeTextCompare = (left, right) => String(left || '').localeCompare(String(right || ''), undefined, { sensitivity: 'base' })
    const ordered = [...baseSorted].sort((left, right) => {
      if (sortBy === 'sceneNumber') return naturalSortSceneNumber(left, right) * directionMultiplier
      if (sortBy === 'scriptOrder') {
        const leftOrder = scriptOrderMap[left.id] ?? Number.MAX_SAFE_INTEGER
        const rightOrder = scriptOrderMap[right.id] ?? Number.MAX_SAFE_INTEGER
        if (leftOrder !== rightOrder) return (leftOrder - rightOrder) * directionMultiplier
      }
      if (sortBy === 'pageCount') {
        const leftPages = pagination.byScene[left.id]?.pageCount ?? 0
        const rightPages = pagination.byScene[right.id]?.pageCount ?? 0
        if (leftPages !== rightPages) return (leftPages - rightPages) * directionMultiplier
      } else if (sortBy === 'shotCount') {
        const leftShots = (linkedShotsMap[left.id] || []).length
        const rightShots = (linkedShotsMap[right.id] || []).length
        if (leftShots !== rightShots) return (leftShots - rightShots) * directionMultiplier
      } else if (sortBy === 'location') {
        const cmp = safeTextCompare(left.location, right.location)
        if (cmp !== 0) return cmp * directionMultiplier
      } else if (sortBy === 'slugline') {
        const cmp = safeTextCompare(left.slugline, right.slugline)
        if (cmp !== 0) return cmp * directionMultiplier
      } else if (sortBy === 'intExt') {
        const cmp = safeTextCompare(left.intExt, right.intExt)
        if (cmp !== 0) return cmp * directionMultiplier
      } else if (sortBy === 'dayNight') {
        const cmp = safeTextCompare(left.dayNight, right.dayNight)
        if (cmp !== 0) return cmp * directionMultiplier
      }
      return naturalSortSceneNumber(left, right)
    })
    return ordered
  }, [scriptScenes, sortBy, sortDirection, linkedShotsMap, pagination, scriptOrderMap])

  const groupedVisibleScenes = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', label: null, scenes: visibleScenes }]
    const groups = new Map()
    visibleScenes.forEach(scene => {
      let key = 'Other'
      if (groupBy === 'location') key = scene.location?.trim() || 'No Location'
      if (groupBy === 'time') key = `${scene.intExt || '—'} · ${scene.dayNight || '—'}`
      if (groupBy === 'importSource') key = scene.importSource?.trim() || 'Primary Script'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(scene)
    })
    return [...groups.entries()].map(([key, groupedScenes]) => ({ key, label: key, scenes: groupedScenes }))
  }, [visibleScenes, groupBy])

  const allCharacters = useMemo(() => {
    const set = new Set()
    scriptScenes.forEach(s => (s.characters || []).forEach(c => set.add(c)))
    return [...set]
  }, [scriptScenes])

  const openEditor = (scene) => {
    setEditingSceneNumberId(scene.id)
    setEditSceneNumberValue(scene.sceneNumber || '')
    setInvalidEdit(false)
  }

  const commitEditor = () => {
    if (!editingSceneNumberId) return
    const v = editSceneNumberValue.trim()
    if (!v) {
      setInvalidEdit(true)
      setTimeout(() => setInvalidEdit(false), 350)
      return
    }
    updateScriptScene(editingSceneNumberId, { sceneNumber: v })
    setEditingSceneNumberId(null)
  }

  const combineInit = useMemo(() => {
    const selected = visibleScenes.filter(s => selectedSceneIds.includes(s.id))
    if (selected.length === 0) return null
    const sorted = [...selected].sort(naturalSortSceneNumber)
    return {
      selected,
      sceneNumber: sorted[0].sceneNumber || '',
      slugline: sorted[0].slugline || '',
      characters: [...new Set(selected.flatMap(s => s.characters || []))],
    }
  }, [selectedSceneIds, visibleScenes])

  const [combineForm, setCombineForm] = useState(null)
  const { isDesktopDown, isPhone } = useResponsiveViewport()
  useEffect(() => { if (combineOpen && combineInit) setCombineForm(combineInit) }, [combineOpen, combineInit])

  useEffect(() => {
    const allowedColumns = COLUMN_OPTIONS_BY_MODE[viewMode] || COLUMN_OPTIONS_BY_MODE.compactGrid
    if (!allowedColumns.includes(columnCount)) setColumnCount(allowedColumns[allowedColumns.length - 1])
  }, [viewMode, columnCount])

  useEffect(() => {
    setTabViewState('scenes', {
      sceneViewMode: viewMode,
      sceneColumnCount: columnCount,
      columnCount,
      sortBy,
      sortDirection,
      groupBy,
      metadataVisibility,
      sidebarPanelCollapsed: panelCollapsed,
    })
  }, [viewMode, columnCount, sortBy, sortDirection, groupBy, metadataVisibility, panelCollapsed, setTabViewState])

  useEffect(() => {
    const node = listRef.current
    if (!node) return
    const savedTop = scenesViewState.scrollTop
    if (typeof savedTop === 'number') {
      requestAnimationFrame(() => {
        node.scrollTop = savedTop
      })
    }
  }, [scenesViewState.scrollTop])

  const doCombine = () => {
    if (!combineForm || !combineForm.sceneNumber.trim()) return
    const selected = combineForm.selected
    const mergedScene = {
      ...selected[0],
      id: `sc_${Date.now()}`,
      sceneNumber: combineForm.sceneNumber.trim(),
      slugline: combineForm.slugline,
      characters: combineForm.characters,
      actionText: selected.map(s => s.actionText || '').filter(Boolean).join('\n\n---\n\n'),
    }
    const linkedShotIds = [...new Set(selected.flatMap(s => (linkedShotsMap[s.id] || []).map(sh => sh.id)))]
    linkedShotIds.forEach(shotId => linkShotToScene(shotId, mergedScene.id))
    const kept = scriptScenes.filter(s => !selectedSceneIds.includes(s.id))
    importScriptScenes([...kept, mergedScene], { id: 'manual', filename: mergedScene.importSource || 'manual' }, 'replace')
    setSelectedSceneIds([])
    setCombineOpen(false)
  }

  const effectiveColumnCount = useMemo(() => {
    if (viewMode === 'productionList') return 1
    if (isPhone) return 1
    if (isDesktopDown) return Math.min(columnCount, 2)
    return columnCount
  }, [columnCount, isDesktopDown, isPhone, viewMode])

  if (scriptScenes.length === 0) {
    return (
        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontWeight: 700 }}>No script scenes available yet</div>
        <div style={{ color: '#4A5568', fontSize: 13 }}>Import your script from the Script tab to begin scene breakdown.</div>
        <button className="ss-btn is-secondary" onClick={() => setActiveTab('script')}>Go to Script tab</button>
      </div>
    )
  }

  const togglePanel = (panelKey) => setPanelCollapsed(prev => ({ ...prev, [panelKey]: !prev[panelKey] }))
  const expandAllPanels = () => setPanelCollapsed({ viewOptions: false, sceneOrganization: false })
  const collapseAllPanels = () => setPanelCollapsed({ viewOptions: true, sceneOrganization: true })
  const columnOptions = COLUMN_OPTIONS_BY_MODE[viewMode] || []
  const showColumnControls = viewMode !== 'productionList'

  return (
    <div style={{ display: 'flex', height: '100%' }} onClick={() => { onConfigureOpenChange(false) }}>
      <SidebarPane
        responsiveLabel="Open Scenes panel"
                title={null}
        footer={null}
      >
          <div style={{ padding: '10px 12px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#9fb0d1', fontWeight: 700, letterSpacing: '0.06em' }}>Panels</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button title="Collapse All" onClick={collapseAllPanels} className="ss-btn outline" style={{ fontSize: 11, borderRadius: 4, width: 22, height: 22, padding: 0 }}>↑</button>
              <button title="Expand All" onClick={expandAllPanels} className="ss-btn outline" style={{ fontSize: 11, borderRadius: 4, width: 22, height: 22, padding: 0 }}>↓</button>
            </div>
          </div>
          <SidebarSection title="View Options" collapsed={panelCollapsed.viewOptions} onToggle={() => togglePanel('viewOptions')}>
            <label style={{ display: 'block', fontSize: 10, color: '#9fb0d1', marginBottom: 4 }}>View Mode</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
              {VIEW_MODES.map(mode => (
                <button
                  key={mode.value}
                  onClick={() => setViewMode(mode.value)}
                  className={`ss-btn outline icon-toggle ${viewMode === mode.value ? 'is-active' : ''}`}
                  aria-label={mode.label}
                  title={mode.label}
                  aria-pressed={viewMode === mode.value}
                  style={{
                    borderRadius: 4,
                    padding: '6px 4px',
                  }}
                >
                  <img src={mode.icon} alt="" aria-hidden="true" />
                </button>
              ))}
            </div>
            {showColumnControls && (
              <>
                <label style={{ display: 'block', fontSize: 10, color: '#9fb0d1', marginBottom: 4, marginTop: 8 }}>Columns</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, marginBottom: 8 }}>
                  {columnOptions.map(count => (
                    <button key={count} onClick={() => setColumnCount(count)} style={{ ...pillStyle, background: columnCount === count ? 'rgba(82,101,236,0.38)' : 'rgba(255,255,255,0.08)', borderColor: columnCount === count ? 'rgba(130,153,255,0.85)' : 'rgba(148,163,184,0.34)', color: columnCount === count ? '#f4f7ff' : '#dbe5f5' }}>
                      {count}
                    </button>
                  ))}
                </div>
              </>
            )}
            <div style={{ display: 'grid', gap: 6 }}>
              {METADATA_TOGGLE_OPTIONS.map(toggle => (
                <label key={toggle.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#dbe5f5' }}>
                  <input
                    type="checkbox"
                    checked={!!metadataVisibility[toggle.key]}
                    onChange={(e) => setMetadataVisibility(prev => ({ ...prev, [toggle.key]: e.target.checked }))}
                  />
                  {toggle.label}
                </label>
              ))}
            </div>
          </SidebarSection>
          <SidebarSection title="Scene Organization" collapsed={panelCollapsed.sceneOrganization} onToggle={() => togglePanel('sceneOrganization')}>
            <label style={{ display: 'block', fontSize: 10, color: '#9fb0d1', marginBottom: 4 }}>Sort By</label>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={selectStyle} className="ss-input">
              {SORT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button onClick={() => setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')} className="ss-btn outline" style={{ ...pillStyle, width: '100%', marginTop: 8 }}>
              {sortDirection === 'asc' ? 'Ascending ↑' : 'Descending ↓'}
            </button>
            <label style={{ display: 'block', fontSize: 10, color: '#9fb0d1', marginBottom: 4, marginTop: 8 }}>Group By</label>
            <select value={groupBy} onChange={(e) => setGroupBy(e.target.value)} className="ss-input" style={{ ...selectStyle, marginBottom: 0 }}>
              {GROUP_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </SidebarSection>
      </SidebarPane>

      <div
        ref={listRef}
        onScroll={(e) => setTabViewState('scenes', { scrollTop: e.currentTarget.scrollTop })}
        style={{ flex: 1, padding: 14, overflowY: 'auto', position: 'relative' }}
      >
        {viewMode === 'productionList' ? (
          <ProductionList
            scenes={visibleScenes}
            linkedShotsMap={linkedShotsMap}
            pagination={pagination}
            metadataVisibility={metadataVisibility}
            selectedSceneIds={selectedSceneIds}
            setSelectedSceneIds={setSelectedSceneIds}
            sortBy={sortBy}
            sortDirection={sortDirection}
            setSortBy={setSortBy}
            setSortDirection={setSortDirection}
          />
        ) : (
          groupedVisibleScenes.map(group => (
            <div key={group.key} style={{ marginBottom: 14 }}>
              {group.label ? <div style={{ fontSize: 11, color: '#475569', fontWeight: 700, marginBottom: 8 }}>{group.label}</div> : null}
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${effectiveColumnCount}, minmax(0, 1fr))`, gap: 10, alignItems: 'start' }}>
                {group.scenes.map(scene => {
          const linkedShots = linkedShotsMap[scene.id] || []
          const storyboardImages = linkedShots.filter(shot => !!shot.image)
          const heroImage = storyboardImages[0]?.image || null
          const expanded = !!expandedIds[scene.id]
          const selected = selectedSceneIds.includes(scene.id)
          const pageCount = pagination.byScene[scene.id]?.pageCount?.toFixed(2) || '0.00'
          const castCount = (scene.characters || []).length
          const scheduledDays = scheduledDayCountByScene[scene.id] || 0
          return (
            <div className="app-surface-card" key={scene.id} data-entity-type="scene" data-entity-id={scene.id} onDoubleClick={() => openScenePropertiesDialog('script', scene.id)} style={{ borderRadius: 6, background: colorWithAlpha(scene.color, 0.12) }}>
              {viewMode === 'visualGrid' && metadataVisibility.showStoryboardThumb && (
                <div style={{ padding: '8px 12px 0' }}>
                  <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(74,85,104,0.16)', background: '#f8fafc', aspectRatio: '16 / 9', position: 'relative' }}>
                    {heroImage
                      ? <img src={heroImage} alt={`Scene ${scene.sceneNumber || '—'} storyboard`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 11 }}>No storyboard image</div>}
                    {storyboardImages.length > 1 && (
                      <div style={{ position: 'absolute', right: 6, bottom: 6, fontSize: 10, background: 'rgba(15,23,42,0.78)', color: '#fff', padding: '2px 6px', borderRadius: 999 }}>+{storyboardImages.length - 1}</div>
                    )}
                  </div>
                </div>
              )}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] }))}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] })) } }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer' }}
              >
                <input type="checkbox" checked={selected} onChange={(e) => setSelectedSceneIds(prev => e.target.checked ? [...new Set([...prev, scene.id])] : prev.filter(id => id !== scene.id))} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} style={{ opacity: selectedSceneIds.length > 0 || selected ? 1 : 0.2 }} />
                <div onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}><SceneColorPicker value={scene.color || null} onChange={(color) => updateScriptScene(scene.id, { color })} /></div>
                {editingSceneNumberId === scene.id ? (
                  <input
                    autoFocus
                    value={editSceneNumberValue}
                    onChange={e => setEditSceneNumberValue(e.target.value)}
                    onBlur={commitEditor}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onKeyDown={e => { if (e.key === 'Enter') commitEditor(); if (e.key === 'Escape') setEditingSceneNumberId(null) }}
                    style={{ width: 88, fontSize: 11, borderRadius: 3, border: invalidEdit ? '1px solid #ef4444' : '1px solid rgba(128,128,128,0.3)', padding: '3px 6px' }}
                  />
                ) : (
                  <button onClick={(e) => { e.stopPropagation(); openEditor(scene) }} onPointerDown={(e) => e.stopPropagation()} style={{ border: 'none', background: 'none', fontFamily: 'monospace', fontWeight: 700, cursor: 'text' }}>SC {scene.sceneNumber || '—'}</button>
                )}
                <span style={{ color: '#4A5568', flex: 1, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scene.slugline || scene.location || ''}>{scene.slugline || scene.location || 'Untitled Scene'}</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{linkedShots.length} shots</span>
                <span style={{ color: '#718096', fontSize: 10 }}>{pageCount} pp</span>
                <button onClick={(e) => { e.stopPropagation(); setExpandedIds(p => ({ ...p, [scene.id]: !p[scene.id] })) }} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>{expanded ? '▴' : '▾'}</button>
              </div>
              <div style={{ padding: '0 12px 8px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {metadataVisibility.showIntExtDayNight && (scene.intExt || scene.dayNight)
                  ? <Badge>{scene.intExt || '—'} · {scene.dayNight || '—'}</Badge>
                  : null}
                {metadataVisibility.showLocation && scene.location ? <Badge>{scene.location}</Badge> : null}
                {metadataVisibility.showCastCount && castCount > 0 ? <Badge>{castCount} cast</Badge> : null}
                {metadataVisibility.showScheduleBadge && scheduledDays > 0 ? <Badge>{scheduledDays} day{scheduledDays > 1 ? 's' : ''} scheduled</Badge> : null}
              </div>

              {expanded && (
                <div style={{ padding: '0 12px 12px' }}>
                  <ScenePropertiesPanel
                    values={{
                      sceneNumber: scene.sceneNumber || '',
                      titleSlugline: scene.slugline || '',
                      location: scene.location || '',
                      intExt: scene.intExt || '',
                      dayNight: scene.dayNight || '',
                      color: scene.color || null,
                      characters: scene.characters || [],
                    }}
                    estimatedPages={pagination.byScene[scene.id]
                      ? `${pagination.byScene[scene.id].pageCount.toFixed(2)} pp · p${pagination.byScene[scene.id].startPage}–${pagination.byScene[scene.id].endPage}`
                      : '—'}
                    editable
                    allCharacters={allCharacters}
                    onChange={(updates) => {
                      const canonicalUpdates = {
                        ...updates,
                        ...(('titleSlugline' in updates) ? { slugline: updates.titleSlugline } : {}),
                      }
                      delete canonicalUpdates.titleSlugline
                      updateScriptScene(scene.id, canonicalUpdates)
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
              </div>
            </div>
          ))
        )}

        {selectedSceneIds.length >= 2 && (
          <div style={{ position: 'sticky', bottom: 0, background: '#1c1c1e', color: '#fff', borderRadius: 8, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span>{selectedSceneIds.length} scenes selected</span>
            <button className="ss-btn is-primary" onClick={() => setCombineOpen(true)}>Combine Scenes</button>
            <button className="ss-btn destructive" onClick={() => selectedSceneIds.forEach(id => deleteScriptScene(id))}>Delete</button>
            <button className="ss-btn ghost" onClick={() => setSelectedSceneIds([])}>✕ Cancel</button>
          </div>
        )}
      </div>

      {combineOpen && combineForm && (
        <div className="modal-overlay" onClick={() => setCombineOpen(false)}>
          <div className="modal app-dialog" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3 className="dialog-title">Combine {combineForm.selected.length} Scenes</h3>
            <label className="dialog-label">New scene number</label>
            <input className="dialog-input ss-input" value={combineForm.sceneNumber} onChange={e => setCombineForm(f => ({ ...f, sceneNumber: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
            <label className="dialog-label">New slugline</label>
            <input className="dialog-input ss-input" value={combineForm.slugline} onChange={e => setCombineForm(f => ({ ...f, slugline: e.target.value }))} style={{ width: '100%', marginBottom: 8 }} />
            <label className="dialog-label">Merged characters</label>
            <CharacterTagInput characters={combineForm.characters} allCharacters={allCharacters} onChange={(chars) => setCombineForm(f => ({ ...f, characters: chars }))} />
            <div className="dialog-actions">
              <button className="dialog-button-secondary" onClick={() => setCombineOpen(false)}>Cancel</button>
              <button className="dialog-button-primary" onClick={doCombine}>Combine Scenes</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function SidebarSection({ title, collapsed, onToggle, children }) {
  return (
    <div style={{ padding: 10, paddingTop: 6 }}>
      <div className="ss-module" style={{ borderRadius: 6, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(148,163,184,0.28)', overflow: 'hidden' }}>
        <button onClick={onToggle} className="ss-module-header" style={{ width: '100%', borderLeft: 'none', borderRight: 'none', borderTop: 'none', padding: '8px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(82,101,236,0.14)' }}>
          <span style={{ fontSize: 10, textTransform: 'uppercase', color: '#9fb0d1', fontWeight: 700, letterSpacing: '0.06em' }}>{title}</span>
          <span style={{ color: '#b5c1d7', fontSize: 11 }}>{collapsed ? '▸' : '▾'}</span>
        </button>
        {!collapsed && <div style={{ padding: 10, borderTop: '1px solid rgba(148,163,184,0.2)' }}>{children}</div>}
      </div>
    </div>
  )
}

function Badge({ children }) {
  const text = String(children || '')
  const variant = getChipVariantFromText(text)
  return <span className={`ss-chip ${variant}`} style={{ fontSize: 10 }}>{children}</span>
}

const selectStyle = { width: '100%', border: '1px solid rgba(148,163,184,0.34)', borderRadius: 4, padding: '6px 7px', fontSize: 12, marginBottom: 8, background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }
const pillStyle = { border: '1px solid rgba(148,163,184,0.34)', background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '6px 8px', fontSize: 11, color: '#dbe5f5', cursor: 'pointer' }

function getChipVariantFromText(text) {
  const upper = text.toUpperCase()
  if (upper.includes('INT')) return 'is-int'
  if (upper.includes('EXT')) return 'is-ext'
  if (upper.includes('DAY')) return 'is-day'
  if (upper.includes('NIGHT')) return 'is-night'
  if (upper.includes('ACTIVE')) return 'is-active'
  if (upper.includes('PENDING')) return 'is-pending'
  if (upper.includes('LOCKED')) return 'is-locked'
  if (upper.includes('DROPPED')) return 'is-dropped'
  return ''
}

function colorWithAlpha(hexColor, alpha = 0.12) {
  if (!hexColor) return '#ffffff'
  const hex = hexColor.replace('#', '')
  if (hex.length !== 6) return '#ffffff'
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const blendAmount = Math.max(0, Math.min(1, 1 - alpha))
  const tint = (channel) => Math.round((channel * alpha) + (255 * blendAmount))
  return `rgb(${tint(r)}, ${tint(g)}, ${tint(b)})`
}

function ProductionList({
  scenes,
  linkedShotsMap,
  pagination,
  metadataVisibility,
  selectedSceneIds,
  setSelectedSceneIds,
  sortBy,
  sortDirection,
  setSortBy,
  setSortDirection,
}) {
  const handleSort = (column) => {
    if (sortBy === column) setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortBy(column); setSortDirection('asc') }
  }
  const headers = [
    ...(metadataVisibility.showStoryboardThumb ? [{ key: 'thumb', label: '' }] : []),
    { key: 'sceneNumber', label: 'Scene #' },
    { key: 'slugline', label: 'Slugline / Title' },
    { key: 'location', label: 'Location' },
    { key: 'intExt', label: 'INT/EXT' },
    { key: 'dayNight', label: 'DAY/NIGHT' },
    { key: 'pageCount', label: 'Pages' },
    { key: 'shotCount', label: 'Shots' },
    { key: 'castCount', label: 'Cast' },
  ]
  return (
    <div className="app-surface-card ss-module" style={{ borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
        <thead>
          <tr className="ss-module-header is-blue" style={{ background: '#f8fafc' }}>
            <th style={thStyle}>Sel</th>
            {headers.map(header => (
              <th key={header.key} style={thStyle}>
                {header.key === 'thumb' ? header.label : (
                  <button onClick={() => handleSort(header.key)} style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 11, color: '#334155' }}>
                    {header.label}{sortBy === header.key ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scenes.map(scene => {
            const linkedShots = linkedShotsMap[scene.id] || []
            const hero = linkedShots.find(shot => !!shot.image)?.image || null
            const selected = selectedSceneIds.includes(scene.id)
            return (
              <tr key={scene.id} style={{ borderTop: '1px solid rgba(148,163,184,0.25)', background: colorWithAlpha(scene.color, 0.12) }}>
                <td style={tdStyle}><input type="checkbox" checked={selected} onChange={(e) => setSelectedSceneIds(prev => e.target.checked ? [...new Set([...prev, scene.id])] : prev.filter(id => id !== scene.id))} /></td>
                {metadataVisibility.showStoryboardThumb && <td style={tdStyle}>{hero ? <img src={hero} alt="" style={{ width: 28, height: 18, objectFit: 'cover', borderRadius: 3 }} /> : <span style={{ color: '#94a3b8' }}>—</span>}</td>}
                <td style={tdStyle}>SC {scene.sceneNumber || '—'}</td>
                <td style={{ ...tdStyle, maxWidth: 280, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={scene.slugline || ''}>{scene.slugline || 'Untitled Scene'}</td>
                <td style={tdStyle}>{scene.location || '—'}</td>
                <td style={tdStyle}>{scene.intExt || '—'}</td>
                <td style={tdStyle}>{scene.dayNight || '—'}</td>
                <td style={tdStyle}>{pagination.byScene[scene.id]?.pageCount?.toFixed(2) || '0.00'}</td>
                <td style={tdStyle}>{linkedShots.length}</td>
                <td style={tdStyle}>{(scene.characters || []).length || '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const thStyle = { textAlign: 'left', fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '8px 10px' }
const tdStyle = { padding: '8px 10px', color: '#334155' }
