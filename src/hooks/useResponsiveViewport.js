import { useEffect, useMemo, useState } from 'react'
import { BREAKPOINTS, getViewportTier } from '../constants/responsive'

function getWindowWidth() {
  if (typeof window === 'undefined') return BREAKPOINTS.wide
  return window.innerWidth || BREAKPOINTS.wide
}

export default function useResponsiveViewport() {
  const [width, setWidth] = useState(getWindowWidth)

  useEffect(() => {
    const onResize = () => setWidth(getWindowWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return useMemo(() => {
    const tier = getViewportTier(width)
    const isPhone = width < BREAKPOINTS.phone
    const isTabletPortrait = width >= BREAKPOINTS.phone && width < BREAKPOINTS.tabletPortrait
    const isTabletLandscape = width >= BREAKPOINTS.tabletPortrait && width < BREAKPOINTS.desktop
    const isDesktopDown = width < BREAKPOINTS.desktop

    return {
      width,
      tier,
      isPhone,
      isTabletPortrait,
      isTabletLandscape,
      isDesktopDown,
      isDesktopUp: !isDesktopDown,
      breakpoints: BREAKPOINTS,
    }
  }, [width])
}
