import React from 'react'
import { runtimeConfig } from '../config/runtimeConfig'
import ScriptTabLegacy from './ScriptTabLegacy'

export default function ScriptTab() {
  const shouldUseLegacyFallback = runtimeConfig.scriptDocument?.legacyFallbackEnabled === true
  return <ScriptTabLegacy useUnifiedEditorCore={!shouldUseLegacyFallback} />
}
