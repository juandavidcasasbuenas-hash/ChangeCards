import { useEffect, useState } from 'react'
import { readGuides } from '../field-guide.js'
import FieldCanvas from './FieldCanvas.jsx'
import './field-table.css'

export default function FieldTable() {
  const [safari, setSafari] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    document.title = 'Evidence Safari — field table'
    const controller = new AbortController()
    async function load() {
      try {
        const library = readGuides()
        const id = new URLSearchParams(location.search).get('safari')
        if (id) {
          const saved = library.safaris.find(item => item.id === id)
          if (!saved) throw Error('This safari is not saved in this browser. Open the example to start a new canvas.')
          setSafari(saved)
          return
        }
        const response = await fetch('/safari/example/workshop.json', { signal: controller.signal })
        if (!response.ok) throw Error('The example could not load. Please try again.')
        const example = await response.json()
        if (!Array.isArray(example.cards) || !Array.isArray(example.sources)) throw Error('This evidence collection could not be read.')
        setSafari(library.safaris.find(item => item.id === example.id) || example)
      } catch (err) { if (!controller.signal.aborted) setError(err.message) }
    }
    load()
    return () => controller.abort()
  }, [])
  if (!safari) return <main className="esc-loading"><span className="esc-loading-mark">✳</span><h1>Evidence Safari</h1><p role={error ? 'alert' : 'status'}>{error || 'Unpacking the evidence…'}</p>{error && <a href="/safari/field-table">Open the example</a>}</main>
  return <main className="esc-app" aria-label="Evidence Safari field table"><FieldCanvas key={safari.id} safari={safari}/></main>
}
