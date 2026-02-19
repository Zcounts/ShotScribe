import React from 'react'
import PageLayout from './components/PageLayout'

/**
 * App — Session 4
 *
 * All state is managed in useShotlistStore (Zustand).
 * PageLayout reads from and writes to the store directly —
 * no props need to be passed from here.
 */
export default function App() {
  return (
    <div style={{ backgroundColor: '#f8f5ee', minHeight: '100vh' }}>
      <PageLayout />
    </div>
  )
}
