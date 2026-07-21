import React from 'react'

export function Badge({ status, label }) {
  return <span className={`badge-${status || 'pending'}`}>{label}</span>
}
