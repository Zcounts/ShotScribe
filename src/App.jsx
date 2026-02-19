import React from 'react'
import PageLayout from './components/PageLayout'
import { dummyPage, dummyShots } from './data/dummyData'

/**
 * App — root component
 *
 * For Session 3, renders a single page with hardcoded dummy data
 * to verify the layout: full-width 3-section header + 4-column
 * shot card grid + centered page number footer.
 */
export default function App() {
  return (
    <div style={{ backgroundColor: '#f8f5ee', minHeight: '100vh' }}>
      <PageLayout page={dummyPage} shots={dummyShots} />
    </div>
  )
}
