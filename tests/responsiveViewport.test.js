import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MIN_VIEWPORT_WIDTH,
  coerceViewportWidth,
  getResponsiveViewportState,
} from '../src/hooks/useResponsiveViewport.js'

describe('responsive viewport helpers', () => {
  it('clamps extremely narrow widths to a stable phone floor', () => {
    assert.equal(coerceViewportWidth(0, MIN_VIEWPORT_WIDTH), MIN_VIEWPORT_WIDTH)
    assert.equal(coerceViewportWidth(120), MIN_VIEWPORT_WIDTH)

    const state = getResponsiveViewportState(120)
    assert.equal(state.width, MIN_VIEWPORT_WIDTH)
    assert.equal(state.tier, 'phone')
    assert.equal(state.isPhone, true)
    assert.equal(state.isDesktopDown, true)
  })

  it('reports normal desktop widths without clamping', () => {
    const state = getResponsiveViewportState(1440)

    assert.equal(state.width, 1440)
    assert.equal(state.tier, 'wide')
    assert.equal(state.isPhone, false)
    assert.equal(state.isDesktopDown, false)
    assert.equal(state.isDesktopUp, true)
  })

  it('stays stable across breakpoint transitions', () => {
    assert.equal(getResponsiveViewportState(599).tier, 'phone')
    assert.equal(getResponsiveViewportState(600).tier, 'tablet-portrait')
    assert.equal(getResponsiveViewportState(768).tier, 'tablet-landscape')
    assert.equal(getResponsiveViewportState(1024).tier, 'desktop')
    assert.equal(getResponsiveViewportState(1280).tier, 'wide')
  })

  it('returns equal primitive viewport fields for repeated unchanged resize measurements', () => {
    const first = getResponsiveViewportState(320)
    const second = getResponsiveViewportState(320)

    assert.deepEqual(
      {
        width: first.width,
        tier: first.tier,
        isPhone: first.isPhone,
        isDesktopDown: first.isDesktopDown,
      },
      {
        width: second.width,
        tier: second.tier,
        isPhone: second.isPhone,
        isDesktopDown: second.isDesktopDown,
      },
    )
  })
})
