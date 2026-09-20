import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './ux.css'

const App = lazy(() => /^\/safari\/field-table\/?$/.test(window.location.pathname)
  ? import('./safari/field-table/FieldTable.jsx')
  : /^\/safari(?:\/|$)/.test(window.location.pathname)
    ? import('./safari/Safari.jsx') : import('./App.jsx'))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={<div role="status" style={{ padding: 40 }}>Opening…</div>}><App /></Suspense>
  </React.StrictMode>,
)
