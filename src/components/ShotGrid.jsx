import React, { useEffect, useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import ShotCard from './ShotCard'
import useStore from '../store'
import useCloudAccessPolicy from '../features/billing/useCloudAccessPolicy'
import { useConvexQueryDiagnostics } from '../utils/convexDiagnostics'

function AddShotButton({ onClick }) {
  return (
    <button className="add-shot-btn" data-add-shot-control="true" data-suppress-entity-context-menu="true" onClick={onClick} title="Add new shot">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10" cy="10" r="8" />
        <line x1="10" y1="6" x2="10" y2="14" />
        <line x1="6" y1="10" x2="14" y2="10" />
      </svg>
      <span>Add Shot</span>
    </button>
  )
}

/**
 * ShotGrid — renders a grid of sortable shot cards for one page of a scene.
 *
 * Props:
 *  sceneId       – the scene this grid belongs to
 *  shots         – array of shots WITH displayId already attached
 *  columnCount   – number of grid columns
 *  useDropdowns  – spec table input mode
 *  showAddBtn    – show the "Add Shot" button (only on last page)
 *  onAddShot     – callback when Add Shot is clicked
 */
function ShotGrid({
  sceneId,
  shots,
  columnCount,
  useDropdowns,
  storyboardDisplayConfig,
  showAddBtn = false,
  onAddShot,
}) {
  const projectRef = useStore(s => s.projectRef)
  const cloudAccessPolicy = useCloudAccessPolicy()
  const getAssetSignedViewsBatch = useAction('assets:getAssetSignedViewsBatch')
  const [prefetchedAssetViews, setPrefetchedAssetViews] = useState({})
  const cloudAssetBlocked = projectRef?.type === 'cloud' && !cloudAccessPolicy.canAccessCloudAssets
  const libraryQueryArgs = (projectRef?.type === 'cloud' && !cloudAssetBlocked)
    ? { projectId: projectRef.projectId, kind: 'storyboard_image', limit: 120 }
    : 'skip'
  const recentDeletedQueryArgs = (projectRef?.type === 'cloud' && !cloudAssetBlocked)
    ? { projectId: projectRef.projectId, limit: 10 }
    : 'skip'
  const libraryAssets = useQuery('assets:listProjectLibraryAssets', libraryQueryArgs)
  const recentlyDeletedAssets = useQuery('assets:getRecentlyDeletedLibraryAssets', recentDeletedQueryArgs)

  useConvexQueryDiagnostics({
    component: 'ShotGrid',
    queryName: 'assets:listProjectLibraryAssets',
    args: libraryQueryArgs,
    result: libraryAssets,
    active: libraryQueryArgs !== 'skip',
  })
  useConvexQueryDiagnostics({
    component: 'ShotGrid',
    queryName: 'assets:getRecentlyDeletedLibraryAssets',
    args: recentDeletedQueryArgs,
    result: recentlyDeletedAssets,
    active: recentDeletedQueryArgs !== 'skip',
  })

  const cloudAssetIds = useMemo(() => {
    if (projectRef?.type !== 'cloud') return []
    const ids = []
    for (const shot of (shots || [])) {
      const assetId = shot?.imageAsset?.cloud?.assetId
      if (assetId) ids.push(assetId)
    }
    return Array.from(new Set(ids.map(String)))
  }, [projectRef?.type, shots])

  useEffect(() => {
    let cancelled = false
    async function loadPrefetchedViews() {
      if (
        projectRef?.type !== 'cloud'
        || !projectRef?.projectId
        || !cloudAccessPolicy.canAccessCloudAssets
        || cloudAssetIds.length === 0
      ) {
        setPrefetchedAssetViews({})
        return
      }
      try {
        const batch = await getAssetSignedViewsBatch({
          projectId: projectRef.projectId,
          assetIds: cloudAssetIds,
        })
        if (!cancelled) setPrefetchedAssetViews(batch || {})
      } catch (err) {
        console.warn('Failed to prefetch cloud asset views', err)
        if (!cancelled) setPrefetchedAssetViews({})
      }
    }
    loadPrefetchedViews()
    return () => {
      cancelled = true
    }
  }, [cloudAccessPolicy.canAccessCloudAssets, cloudAssetIds, getAssetSignedViewsBatch, projectRef])

  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
    gap: '1px',
    backgroundColor: '#e5e0d8',
  }

  return (
    <div className="storyboard-shot-grid" style={gridStyle}>
      {shots.map(shot => (
        <ShotCard
          key={shot.id}
          shot={shot}
          displayId={shot.displayId}
          useDropdowns={useDropdowns}
          storyboardDisplayConfig={storyboardDisplayConfig}
          sceneId={sceneId}
          prefetchedCloudAssetView={prefetchedAssetViews[String(shot?.imageAsset?.cloud?.assetId || '')] || null}
          cloudAccessPolicy={cloudAccessPolicy}
          libraryAssets={libraryAssets}
          recentlyDeletedAssets={recentlyDeletedAssets}
        />
      ))}
      {showAddBtn && <AddShotButton onClick={onAddShot} />}
    </div>
  )
}

export default React.memo(ShotGrid)
