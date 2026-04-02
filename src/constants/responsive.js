export const BREAKPOINTS = Object.freeze({
  phone: 600,
  tabletPortrait: 768,
  desktop: 1024,
  wide: 1280,
})

export function getViewportTier(width) {
  const safeWidth = Number(width) || 0
  if (safeWidth < BREAKPOINTS.phone) return 'phone'
  if (safeWidth < BREAKPOINTS.tabletPortrait) return 'tablet-portrait'
  if (safeWidth < BREAKPOINTS.desktop) return 'tablet-landscape'
  if (safeWidth < BREAKPOINTS.wide) return 'desktop'
  return 'wide'
}
