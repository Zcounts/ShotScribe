import { useEffect, useRef, useState } from 'react'
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

export function hasResponsiveViewportLayoutChanged(currentState, nextState) {
  if (!currentState) return true
  if (!nextState) return false
  return currentState.tier !== nextState.tier
    || currentState.isPhone !== nextState.isPhone
    || currentState.isTabletPortrait !== nextState.isTabletPortrait
    || currentState.isTabletLandscape !== nextState.isTabletLandscape
    || currentState.isDesktopDown !== nextState.isDesktopDown
}

function getWindowWidth() {
  if (typeof window === 'undefined') return BREAKPOINTS.wide
  return coerceViewportWidth(window.innerWidth, MIN_VIEWPORT_WIDTH)
}

export default function useResponsiveViewport() {
  const [viewportState, setViewportState] = useState(() => getResponsiveViewportState(getWindowWidth()))
  const frameRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const measure = () => {
      frameRef.current = null
      const nextState = getResponsiveViewportState(getWindowWidth())
      setViewportState((currentState) => (
        hasResponsiveViewportLayoutChanged(currentState, nextState) ? nextState : currentState
      ))
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

  return viewportState
}
