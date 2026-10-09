import React, { lazy, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './ux.css'
import { FeedbackProvider } from './components/Feedback.jsx'

const App = lazy(() => /^\/safari\/session\//.test(window.location.pathname)
  ? import('./safari/collaboration/SharedSafari.jsx')
  : /^\/safari\/field-table\/?$/.test(window.location.pathname)
  ? import('./safari/field-table/FieldTable.jsx')
  : new URLSearchParams(location.search).has('room') ? import('./App.jsx') : import('./workshop/WorkshopApp.jsx'))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FeedbackProvider><Suspense fallback={<div role="status" style={{ padding: 40 }}>Opening…</div>}><App /></Suspense></FeedbackProvider>
  </React.StrictMode>,
)
