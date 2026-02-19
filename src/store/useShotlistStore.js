import { create } from 'zustand'
import { dummyPage, dummyShots, CARD_COLORS } from '../data/dummyData'

// Generate a sequential shot code like 1A, 1B, ..., 1Z, 1AA, 1AB, ...
function indexToCode(index) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  let n = index
  do {
    code = letters[n % 26] + code
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `1${code}`
}

// Reassign shotCodes sequentially after any reorder/delete/add
function reindex(shots) {
  return shots.map((shot, i) => ({
    ...shot,
    shotCode: indexToCode(i),
  }))
}

let nextId = dummyShots.length + 1

function makeShot() {
  const id = `shot-${Date.now()}-${nextId++}`
  return {
    id,
    shotCode: '1A', // will be reindexed
    camera: 'Camera 1',
    focalLength: '50mm',
    color: CARD_COLORS.green,
    image: null,
    size: '',
    type: '',
    move: '',
    equip: '',
    notes: '',
  }
}

const useShotlistStore = create((set, get) => ({
  // ── Page metadata ──────────────────────────────────────
  page: { ...dummyPage },

  // ── Shots array ────────────────────────────────────────
  shots: reindex([...dummyShots]),

  // ── Page actions ──────────────────────────────────────
  updatePage(patch) {
    set((state) => ({ page: { ...state.page, ...patch } }))
  },

  // ── Shot actions ──────────────────────────────────────
  updateShot(id, patch) {
    set((state) => ({
      shots: state.shots.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }))
  },

  addShot() {
    set((state) => {
      const newShot = makeShot()
      return { shots: reindex([...state.shots, newShot]) }
    })
  },

  deleteShot(id) {
    set((state) => ({ shots: reindex(state.shots.filter((s) => s.id !== id)) }))
  },

  duplicateShot(id) {
    set((state) => {
      const idx = state.shots.findIndex((s) => s.id === id)
      if (idx === -1) return {}
      const clone = {
        ...state.shots[idx],
        id: `shot-${Date.now()}-${nextId++}`,
      }
      const next = [
        ...state.shots.slice(0, idx + 1),
        clone,
        ...state.shots.slice(idx + 1),
      ]
      return { shots: reindex(next) }
    })
  },

  // dnd-kit supplies an array of ids in new order
  reorderShots(orderedIds) {
    set((state) => {
      const map = Object.fromEntries(state.shots.map((s) => [s.id, s]))
      const reordered = orderedIds.map((id) => map[id]).filter(Boolean)
      return { shots: reindex(reordered) }
    })
  },
}))

export default useShotlistStore
