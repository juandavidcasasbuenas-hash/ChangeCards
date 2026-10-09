import { useEffect, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { CARDS, CURATED_ROUTES } from './catalog.js'
import { buildSparkPayload, requestSparks } from './ai.js'
import { collectDevelopEntries, getCurrentAuthor, drawChangeCard, changeCardMarkdown, activateRoute, showDevelop } from './canvas-actions.js'
import { copyText } from '../safari/field-guide.js'
import { focusShapes } from '../safari/field-table/canvas-actions.js'

export function useDevelopController({ editor, safari, collaboration, setStage }) {
  const [category, setCategory] = useState('table'), [sparksState, setSparksState] = useState({}), [toast, setToast] = useState('')
  const requests = useRef(new Map())
  const entries = useValue('develop entries', () => editor ? collectDevelopEntries(editor) : [], [editor])
  const routeId = useValue('develop route', () => editor?.getCurrentPage().meta.developRoute || '', [editor])
  const route = CURATED_ROUTES.find(item => item.id === routeId)
  useEffect(() => () => { for (const controller of requests.current.values()) controller.abort() }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer) }, [toast])
  const canWriteCard = shape => !collaboration || shape.props.authorId === getCurrentAuthor().id
  const openCard = id => {
    const shape = editor?.getShape(id); if (!shape) return
    if (shape.props.template) return drawCard(shape.props.cardId)
    setStage('develop', { focus: false })
    if (!editor.getInstanceState().isReadonly) editor.updateShape({ id, type: shape.type, props: { face: 'back' } })
    setCategory('table'); focusShapes(editor, [shape])
  }
  const drawCard = cardId => { if (!editor) return; setStage('develop', { focus: false }); setCategory('table'); return drawChangeCard(editor, cardId, { reuseUnowned: !collaboration }) }
  const updateDraft = (id, text) => {
    const shape = editor?.getShape(id)
    if (!shape || editor.getInstanceState().isReadonly || !canWriteCard(shape)) return
    const author = getCurrentAuthor()
    if (!shape.meta.developDrafting) editor.markHistoryStoppingPoint('write-change-idea')
    editor.updateShape({ id, type: shape.type, props: { draft: text.slice(0, 1000), authorId: author.id, authorName: author.name }, meta: { ...shape.meta, developDrafting: true } })
  }
  const saveCard = (id, text) => {
    const shape = editor?.getShape(id)
    if (!shape || editor.getInstanceState().isReadonly || !canWriteCard(shape) || !text.trim()) return
    const author = getCurrentAuthor()
    requests.current.get(id)?.abort()
    requests.current.delete(id)
    setSparksState(old => { const next = { ...old }; delete next[id]; return next })
    editor.markHistoryStoppingPoint('save-change-idea')
    editor.updateShape({ id, type: shape.type, props: { note: text.trim().slice(0, 1000), draft: '', sparks: [], authorId: author.id, authorName: author.name }, meta: { ...shape.meta, developDrafting: false, savedAt: Date.now() } })
    setToast('Idea saved on the card.')
  }
  const requestCardSparks = async id => {
    const shape = editor?.getShape(id), card = CARDS.find(item => item.id === shape?.props.cardId)
    if (!card || requests.current.has(id) || editor.getInstanceState().isReadonly || !canWriteCard(shape)) return
    const controller = new AbortController(); requests.current.set(id, controller)
    setSparksState(old => ({ ...old, [id]: { status: 'loading' } }))
    try {
      const evidence = editor.getCurrentPageShapes().filter(item => item.meta.developmentSeed)
      const sparks = await requestSparks(buildSparkPayload({ challenge: safari.challenge, card, entries: collectDevelopEntries(editor), route, evidence }), { signal: controller.signal })
      if (editor.isDisposed || controller.signal.aborted || !editor.getShape(id)) return
      if (!editor.getInstanceState().isReadonly) editor.updateShape({ id, type: shape.type, props: { sparks } })
      setSparksState(old => ({ ...old, [id]: { status: 'ready', sparks } }))
    } catch (error) { if (!controller.signal.aborted) setSparksState(old => ({ ...old, [id]: { status: 'error', error: error.message } })) }
    finally { if (requests.current.get(id) === controller) requests.current.delete(id) }
  }
  return { editor, entries, route, category, sparksState, toast, setToast, canWriteCard, drawCard, openCard, updateDraft, saveCard, requestCardSparks,
    visit: category => { setCategory(category); if (editor) showDevelop(editor, category) },
    takeCard: id => { const shape = editor.getShape(id); if (shape) { setCategory('table'); drawChangeCard(editor, shape.props.cardId, { copy: shape }) } },
    copyCard: async id => { try { await copyText(changeCardMarkdown(editor.getShape(id))); setToast('Idea copied.') } catch (error) { setToast('Copy unavailable. Use Download instead.'); throw error } },
    returnCard: id => { const shape = editor.getShape(id); if (!shape || editor.getInstanceState().isReadonly) return; if (shape.props.note || shape.props.draft) { setToast('This card has writing. It stays on your table.'); return } editor.markHistoryStoppingPoint('return-change-card'); editor.deleteShape(id); showDevelop(editor) },
    chooseRoute: id => { activateRoute(editor, id); setCategory('table'); const route = CURATED_ROUTES.find(item => item.id === id); const next = route.cardIds.find(cardId => !collectDevelopEntries(editor).some(shape => shape.props.cardId === cardId && shape.props.note)); const shape = collectDevelopEntries(editor).find(shape => shape.props.cardId === (next || route.cardIds[0])); if (shape) openCard(shape.id) },
    leaveRoute: () => { const page = editor.getCurrentPage(); if (!editor.getInstanceState().isReadonly) editor.updatePage({ id: page.id, meta: { ...page.meta, developRoute: '' } }) },
  }
}
