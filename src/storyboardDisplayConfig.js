export const STORYBOARD_INFO_FIELDS = [
  { key: 'notes', label: 'Notes' },
  { key: 'setupTime', label: 'Setup Time' },
  { key: 'shotTime', label: 'Shot Time' },
  { key: 'shotAspectRatio', label: 'Aspect Ratio' },
  { key: 'camera', label: 'Camera' },
  { key: 'lens', label: 'Lens' },
  { key: 'size', label: 'Size' },
  { key: 'type', label: 'Type' },
  { key: 'move', label: 'Move' },
  { key: 'equip', label: 'Equip' },
]

const DEFAULT_VISIBLE_FIELDS = STORYBOARD_INFO_FIELDS.reduce((acc, field) => {
  acc[field.key] = true
  return acc
}, {})

export const DEFAULT_STORYBOARD_DISPLAY_CONFIG = {
  aspectRatio: '16:9',
  visibleInfo: DEFAULT_VISIBLE_FIELDS,
  useVisibilitySettingsInPdf: false,
}

export function normalizeStoryboardDisplayConfig(config = {}) {
  return {
    ...DEFAULT_STORYBOARD_DISPLAY_CONFIG,
    ...config,
    visibleInfo: {
      ...DEFAULT_STORYBOARD_DISPLAY_CONFIG.visibleInfo,
      ...(config.visibleInfo || {}),
    },
  }
}
