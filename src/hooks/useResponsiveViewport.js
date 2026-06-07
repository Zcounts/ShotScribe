import { useEffect, useMemo, useRef, useState } from 'react'
import { BREAKPOINTS, getViewportTier } from '../constants/responsive.js'

export const MIN_VIEWPORT_WIDTH = 280

export function coerceViewportWidth(width, fallbackWidth = BREAKPOINTS.wide) {
  const numericWidth = Number(width)
  const safeWidth = Number.isFinite(numericWidth) && numericWidth > 0
    ? numericWidth
    : fallbackWidth
  return Math.max(MIN_VIEWPORT_WIDTH, Math.round(safeWidth))
}

export function getResponsiveViewportState(width) {
  const safeWidth = coerceViewportWidth(width)
  const tier = getViewportTier(safeWidth)
  const isPhone = safeWidth < BREAKPOINTS.phone
  const isTabletPortrait = safeWidth >= BREAKPOINTS.phone && safeWidth < BREAKPOINTS.tabletPortrait
  const isTabletLandscape = safeWidth >= BREAKPOINTS.tabletPortrait && safeWidth < BREAKPOINTS.desktop
  const isDesktopDown = safeWidth < BREAKPOINTS.desktop

  return {
    width: safeWidth,
    tier,
    isPhone,
    isTabletPortrait,
    isTabletLandscape,
    isDesktopDown,
    isDesktopUp: !isDesktopDown,
    breakpoints: BREAKPOINTS,
  }
}

function getWindowWidth() {
  if (typeof window === 'undefined') return BREAKPOINTS.wide
  return coerceViewportWidth(window.innerWidth, MIN_VIEWPORT_WIDTH)
}

export default function useResponsiveViewport() {
  const [width, setWidth] = useState(getWindowWidth)
  const frameRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const measure = () => {
      frameRef.current = null
      const nextWidth = getWindowWidth()
      setWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth))
    }

    const scheduleMeasure = () => {
      if (frameRef.current != null) return
      frameRef.current = window.requestAnimationFrame(measure)
    }

    window.addEventListener('resize', scheduleMeasure)
    scheduleMeasure()

    return () => {
      window.removeEventListener('resize', scheduleMeasure)
      if (frameRef.current != null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
    }
  }, [])

  return useMemo(() => getResponsiveViewportState(width), [width])
}
