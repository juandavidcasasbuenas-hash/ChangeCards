import { useEffect, useRef } from 'react'

export function Icon({ name, size = 18, ...props }) {
  const paths = {
    arrow: 'M4 12h16m-6-6 6 6-6 6', back: 'M20 12H4m6-6-6 6 6 6', plus: 'M12 4v16M4 12h16',
    close: 'm6 6 12 12M6 18 18 6', down: 'm6 9 6 6 6-6', external: 'M14 4h6v6m0-6L10 14M10 4H4v16h16v-6',
    bookmark: 'M6 3h12v18l-6-4-6 4Z', copy: 'M9 9h11v12H9ZM4 15H2V2h12v3',
    download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4', check: 'm4 12 5 5L20 6',
    book: 'M12 5C8 2 4 3 2 4v16c3-2 7-2 10 0 3-2 7-2 10 0V4c-3-1-7-2-10 1Zm0 0v15',
    print: 'M6 8V2h12v6M6 17H2V8h20v9h-4M6 14h12v8H6Z',
    shuffle: 'M3 5h3c5 0 7 14 12 14h3m-5-4 5 4-5 4M3 19h3c2 0 3-2 5-5m2-4c2-3 3-5 5-5h3m-5-4 5 4-5 4',
    star: 'm12 2 2.8 6.8L22 9.4l-5.5 4.7 1.7 7.2-6.2-3.8-6.2 3.8 1.7-7.2L2 9.4l7.2-.6Z',
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name] || paths.arrow}/></svg>
}
export function Doodle({ lens, className = '' }) {
  return <img className={`sf-doodle ${className}`} src={`/safari/doodles/${lens.toLowerCase()}.png`} alt="" draggable="false"/>
}
export function Diamond() {
  return <svg viewBox="0 0 92 32" width="60" height="22" aria-hidden="true"><path d="M2 16 24 2v28Z" fill="currentColor" opacity=".25"/><path d="m2 16 22-14 22 14-22 14Zm44 0L68 2l22 14-22 14Z" fill="none" stroke="currentColor"/></svg>
}
export function Modal({ title, children, onClose, className = '', feedback }) {
  const ref = useRef(null)
  useEffect(() => {
    const element = ref.current, overflow = document.body.style.overflow
    element.showModal(); document.body.style.overflow = 'hidden'
    return () => { element.close(); document.body.style.overflow = overflow }
  }, [])
  return <dialog ref={ref} aria-label={title} className={`sf-dialog ${className}`}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === ref.current) onClose() }}>
    <div className="sf-dialog-inner">
      <header className="sf-dialog-heading"><h2>{title}</h2><button className="sf-icon-button sf-close" onClick={onClose} aria-label="Close" autoFocus><Icon name="close"/></button></header>
      {children}
      {feedback && <div className="sf-toast" role="status">{feedback}</div>}
    </div>
  </dialog>
}
