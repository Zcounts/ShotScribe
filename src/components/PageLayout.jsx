import React from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
} from '@dnd-kit/sortable'
import ShotCard from './ShotCard'
import useShotlistStore from '../store/useShotlistStore'

/**
 * PageLayout — Session 4 component
 *
 * - Page header with editable fields (scene, notes, camera)
 * - dnd-kit sortable 4-column grid of ShotCards
 * - "Add Shot" button appends to grid
 * - Shot IDs auto-reindex after every change
 */
export default function PageLayout() {
  const page = useShotlistStore((s) => s.page)
  const shots = useShotlistStore((s) => s.shots)
  const updatePage = useShotlistStore((s) => s.updatePage)
  const addShot = useShotlistStore((s) => s.addShot)
  const reorderShots = useShotlistStore((s) => s.reorderShots)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  )

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldOrder = shots.map((s) => s.id)
    const oldIdx = oldOrder.indexOf(active.id)
    const newIdx = oldOrder.indexOf(over.id)
    const next = [...oldOrder]
    next.splice(oldIdx, 1)
    next.splice(newIdx, 0, active.id)
    reorderShots(next)
  }

  return (
    <div className="shotlist-page flex flex-col" style={{ minHeight: '100vh', backgroundColor: '#f8f5ee' }}>
      {/* ═══════════════════════════════════════════════
          PAGE HEADER — three editable columns
      ═══════════════════════════════════════════════ */}
      <header
        style={{
          backgroundColor: '#f8f5ee',
          borderBottom: '2.5px solid #1a1a2e',
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'stretch',
          padding: '0',
        }}
      >
        {/* ── LEFT: Scene Label (editable) ── */}
        <div
          style={{
            padding: '14px 20px',
            borderRight: '1.5px solid #d4cebd',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: '4px',
          }}
        >
          {/* Main scene label row: SCENE N | LOCATION */}
          <div className="flex items-baseline gap-2">
            <input
              value={page.sceneLabel}
              onChange={(e) => updatePage({ sceneLabel: e.target.value })}
              className="bg-transparent border-none outline-none font-black uppercase text-gray-900 leading-none"
              style={{ fontSize: '22px', letterSpacing: '0.04em', width: '100%' }}
              placeholder="SCENE 1"
            />
          </div>
          {/* Sub-row: LOCATION | INT/EXT */}
          <div className="flex items-center gap-1.5">
            <input
              value={page.sceneLocation}
              onChange={(e) => updatePage({ sceneLocation: e.target.value })}
              className="bg-transparent border-none outline-none font-bold uppercase text-gray-600 text-sm"
              style={{ fontSize: '13px', letterSpacing: '0.12em' }}
              placeholder="LOCATION"
            />
            <span className="text-gray-400 font-bold text-xs">|</span>
            {/* INT / EXT toggle */}
            <button
              onClick={() =>
                updatePage({ sceneType: page.sceneType === 'INT' ? 'EXT' : 'INT' })
              }
              className="font-bold uppercase text-gray-600 hover:text-gray-900 transition-colors"
              style={{ fontSize: '13px', letterSpacing: '0.12em', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              {page.sceneType}
            </button>
          </div>
        </div>

        {/* ── CENTER: NOTE + SHOOT ORDER (editable) ── */}
        <div
          style={{
            padding: '12px 24px',
            borderRight: '1.5px solid #d4cebd',
            minWidth: '320px',
            maxWidth: '480px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            justifyContent: 'center',
          }}
        >
          {/* *NOTE block */}
          <div>
            <div
              style={{
                fontSize: '8px',
                fontWeight: '800',
                letterSpacing: '0.15em',
                color: '#6b7280',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}
            >
              ✦ NOTE
            </div>
            <textarea
              value={page.note || ''}
              onChange={(e) => updatePage({ note: e.target.value })}
              className="w-full bg-transparent border-none outline-none resize-none text-gray-700"
              style={{ fontSize: '10px', lineHeight: 1.5, fontStyle: 'italic', minHeight: '36px' }}
              placeholder="Add scene notes…"
              rows={2}
            />
          </div>

          {/* *SHOOT ORDER block */}
          <div>
            <div
              style={{
                fontSize: '8px',
                fontWeight: '800',
                letterSpacing: '0.15em',
                color: '#6b7280',
                textTransform: 'uppercase',
                marginBottom: '2px',
              }}
            >
              ✦ SHOOT ORDER
            </div>
            <textarea
              value={page.shootOrder || ''}
              onChange={(e) => updatePage({ shootOrder: e.target.value })}
              className="w-full bg-transparent border-none outline-none resize-none text-gray-700"
              style={{ fontSize: '10px', lineHeight: 1.5, minHeight: '28px' }}
              placeholder="1. Wide → 2. Close-ups → …"
              rows={1}
            />
          </div>
        </div>

        {/* ── RIGHT: Camera Badge + SHOTLIST title ── */}
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            justifyContent: 'center',
            gap: '6px',
          }}
        >
          {/* SHOTLIST title */}
          <div
            style={{
              fontSize: '22px',
              fontWeight: '900',
              letterSpacing: '0.1em',
              color: '#1a1a2e',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            SHOTLIST
          </div>

          {/* Camera badge — editable name and body */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#1a1a2e',
              color: '#f8f5ee',
              borderRadius: '4px',
              padding: '4px 10px',
              fontSize: '10px',
              fontWeight: '700',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: '#22c55e',
                display: 'inline-block',
                flexShrink: 0,
              }}
            />
            <input
              value={page.cameraName}
              onChange={(e) => updatePage({ cameraName: e.target.value })}
              className="bg-transparent border-none outline-none text-inherit font-inherit uppercase"
              style={{ fontSize: '10px', letterSpacing: '0.08em', width: '70px', color: '#f8f5ee' }}
              placeholder="Camera 1"
            />
            <span style={{ opacity: 0.6 }}>=</span>
            <input
              value={page.cameraBody}
              onChange={(e) => updatePage({ cameraBody: e.target.value })}
              className="bg-transparent border-none outline-none text-inherit font-inherit uppercase"
              style={{ fontSize: '10px', letterSpacing: '0.08em', width: '50px', color: '#f8f5ee' }}
              placeholder="FX30"
            />
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          SHOT CARD GRID — 4 columns, drag-and-drop
      ═══════════════════════════════════════════════ */}
      <main
        style={{
          flex: 1,
          padding: '16px 20px',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={shots.map((s) => s.id)} strategy={rectSortingStrategy}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '12px',
                alignContent: 'start',
              }}
            >
              {shots.map((shot) => (
                <ShotCard key={shot.id} shot={shot} />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Shot button */}
        <div className="flex justify-center mt-4">
          <button
            onClick={addShot}
            className="flex items-center gap-2 px-5 py-2 rounded font-bold uppercase tracking-widest text-sm transition-colors"
            style={{
              backgroundColor: '#1a1a2e',
              color: '#f8f5ee',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              letterSpacing: '0.12em',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2d2d4e')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#1a1a2e')}
          >
            <svg
              style={{ width: '14px', height: '14px' }}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Shot
          </button>
        </div>
      </main>

      {/* ═══════════════════════════════════════════════
          PAGE NUMBER FOOTER
      ═══════════════════════════════════════════════ */}
      <footer
        style={{
          borderTop: '1.5px solid #d4cebd',
          padding: '8px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f0ece0',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.12em',
            color: '#6b7280',
            textTransform: 'uppercase',
          }}
        >
          Page {page.pageNumber}
        </span>
      </footer>
    </div>
  )
}
