import React from 'react'

export default function ClapperIcon({ size = 20, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="1" y="5" width="18" height="13" rx="1.5" fill="#2C2C2E" stroke="#3A3A3C" strokeWidth="0.75"/>
      <rect x="1" y="5" width="18" height="4" rx="1.5" fill="#E84040"/>
      <rect x="3" y="5.5" width="2" height="3" rx="0.5" fill="#FAF8F4" opacity="0.85"/>
      <rect x="7" y="5.5" width="2" height="3" rx="0.5" fill="#FAF8F4" opacity="0.85"/>
      <rect x="11" y="5.5" width="2" height="3" rx="0.5" fill="#FAF8F4" opacity="0.85"/>
      <rect x="15" y="5.5" width="2" height="3" rx="0.5" fill="#FAF8F4" opacity="0.85"/>
      <rect x="3" y="2" width="2" height="4" rx="0.5" fill="#1A1A1A" transform="rotate(-15 4 4)"/>
      <rect x="8" y="1.5" width="2" height="4" rx="0.5" fill="#1A1A1A" transform="rotate(-15 9 3.5)"/>
    </svg>
  )
}
