export async function requestSafari(challenge, { signal, onEvent }) {
  const response = await fetch('/api/safari/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge }), signal })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw Error(data.error || 'The safari could not start. Please try again.')
  }
  if (!response.body) throw Error('This browser could not open the evidence stream.')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = '', received = false, completed = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n'); buffer = lines.pop()
      if (done && buffer.trim()) { lines.push(buffer); buffer = '' }
      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line)
        if (event.type === 'error') throw Error(event.message)
        if (event.type === 'result') received = true
        if (event.type === 'done') completed = true
        onEvent(event)
      }
      if (done) break
    }
    if (!received) throw Error('The search ended before evidence was ready. Please try again.')
    if (!completed) onEvent({ type: 'completion_interrupted' })
  } finally { reader.releaseLock() }
}
