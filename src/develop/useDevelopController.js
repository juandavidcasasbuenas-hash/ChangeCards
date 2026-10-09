import { useEffect, useRef, useState } from 'react'
import { useValue } from 'tldraw'
import { CARDS } from './catalog.js'
import { buildSparkPayload, requestSparks } from './ai.js'
import { collectDevelopEntries, getCurrentAuthor, drawChangeCard, changeCardMarkdown, activateRoute, getRouteState, nextRouteCard, showRoute, leaveRoute, showDevelop } from './canvas-actions.js'
import { copyText } from '../safari/field-guide.js'
import { focusShapes } from '../safari/field-table/canvas-actions.js'

export function useDevelopController({ editor, safari, collaboration, setStage }) {
  const [category, setCategory] = useState('table'), [sparksState, setSparksState] = useState({}), [toast, setToast] = useState(''), [activeCardId, setActiveCardId] = useState(null)
  const requests = useRef(new Map()), focusFrame = useRef(null)
  const entries = useValue('develop entries', () => editor ? collectDevelopEntries(editor) : [], [editor])
  const routeState = useValue('develop route', () => editor ? getRouteState(editor, { allowUnowned: !collaboration }) : null, [editor, collaboration])
  const route = routeState?.route || null, routeCards = routeState?.cards || []
  useEffect(() => () => { for (const controller of requests.current.values()) controller.abort(); cancelAnimationFrame(focusFrame.current) }, [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer) }, [toast])
  const canWriteCard = shape => !collaboration || shape.props.authorId === getCurrentAuthor().id
  const openCard = id => {
    const shape = editor?.getShape(id); if (!shape) return
    if (shape.props.template) return drawCard(shape.props.cardId)
    setStage('develop', { focus: false })
    if (!editor.getInstanceState().isReadonly) editor.updateShape({ id, type: shape.type, props: { face: 'back' } })
    setCategory('table'); setActiveCardId(id)
    cancelAnimationFrame(focusFrame.current)
    // The route ribbon changes the canvas height. Let ResizeObserver catch up
    // before fitting the card, otherwise Save can land behind the tool tray.
    focusFrame.current = requestAnimationFrame(() => {
      focusFrame.current = requestAnimationFrame(() => {
        const current = !editor.isDisposed && editor.getShape(id)
        if (current) focusShapes(editor, [current], { duration: 650 })
      })
    })
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
    const currentRoute = getRouteState(editor, { allowUnowned: !collaboration })
    const next = nextRouteCard(currentRoute, id)
    if (next) {
      openCard(next.id)
      setToast(`Idea saved. Next: ${CARDS.find(card => card.id === next.props.cardId).title}.`)
    } else if (currentRoute?.cards.some(card => card?.id === id) && currentRoute.cards.every(card => card?.props.note.trim())) {
      setToast('Four ideas. A new direction. ✳')
    } else setToast('Idea saved on the card.')
  }
  const requestCardSparks = async id => {
    const shape = editor?.getShape(id), card = CARDS.find(item => item.id === shape?.props.cardId)
    if (!card || requests.current.has(id) || editor.getInstanceState().isReadonly || !canWriteCard(shape)) return
    const controller = new AbortController(); requests.current.set(id, controller)
    setSparksState(old => ({ ...old, [id]: { status: 'loading' } }))
    try {
      const evidence = editor.getCurrentPageShapes().filter(item => item.meta.developmentSeed)
      const currentRoute = getRouteState(editor, { allowUnowned: !collaboration })
      const cardRoute = currentRoute?.cards.some(item => item?.id === id) ? currentRoute : null
      const contextEntries = collectDevelopEntries(editor).filter(item => (item.props.authorId === getCurrentAuthor().id || !collaboration && !item.props.authorId)
        && (!cardRoute || !cardRoute.route.cardIds.includes(item.props.cardId) || cardRoute.cards.some(routeCard => routeCard?.id === item.id)))
      const sparks = await requestSparks(buildSparkPayload({ challenge: safari.challenge, card, entries: contextEntries, route: cardRoute?.route, evidence }), { signal: controller.signal })
      if (editor.isDisposed || controller.signal.aborted || !editor.getShape(id)) return
      if (!editor.getInstanceState().isReadonly) editor.updateShape({ id, type: shape.type, props: { sparks } })
      setSparksState(old => ({ ...old, [id]: { status: 'ready', sparks } }))
    } catch (error) { if (!controller.signal.aborted) setSparksState(old => ({ ...old, [id]: { status: 'error', error: error.message } })) }
    finally { if (requests.current.get(id) === controller) requests.current.delete(id) }
  }
  return { editor, entries, route, routeCards, activeCardId, category, sparksState, toast, setToast, canWriteCard, drawCard, openCard, updateDraft, saveCard, requestCardSparks,
    visit: category => { setCategory(category); if (editor) showDevelop(editor, category) },
    takeCard: id => { const shape = editor.getShape(id); if (shape) { setCategory('table'); drawChangeCard(editor, shape.props.cardId, { copy: shape }) } },
    copyCard: async id => { try { await copyText(changeCardMarkdown(editor.getShape(id))); setToast('Idea copied.') } catch (error) { setToast('Copy unavailable. Use Download instead.'); throw error } },
    returnCard: id => { const shape = editor.getShape(id); if (!shape || editor.getInstanceState().isReadonly) return; if (shape.props.note || shape.props.draft) { setToast('This card has writing. It stays on your table.'); return } editor.markHistoryStoppingPoint('return-change-card'); editor.deleteShape(id); showDevelop(editor) },
    chooseRoute: id => {
      if (!editor) return
      const state = activateRoute(editor, id, { reuseUnowned: !collaboration })
      if (!state) return
      setStage('develop', { focus: false }); setCategory('table')
      const next = state.cards.find(shape => shape && !shape.props.note.trim()) || state.cards[0]
      if (next) openCard(next.id)
    },
    openRouteCard: index => {
      if (!editor || !route) return
      const state = getRouteState(editor, { allowUnowned: !collaboration })
      const shape = state?.cards[index] || activateRoute(editor, route.id, { reuseUnowned: !collaboration })?.cards[index]
      if (shape) openCard(shape.id)
    },
    showRoute: () => { setCategory('table'); showRoute(editor, getRouteState(editor, { allowUnowned: !collaboration }), { duration: 650 }) },
    leaveRoute: () => { if (editor) leaveRoute(editor) },
  }
}
