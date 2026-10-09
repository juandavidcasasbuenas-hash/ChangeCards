import '../develop/develop.css'
export default function DesignPhase({ stage, onChange }) {
  return <nav className="workshop-phases" aria-label="Workshop phase">{[['discover', 'Discover', '/safari/'], ['develop', 'Develop', '/develop']].map(([id, label, href]) => {
    const content = <><svg viewBox="0 0 46 32" aria-hidden="true"><path d="m2 16 21-14 21 14-21 14Z" fill="none" stroke="currentColor"/><path d="M2 16 23 2v28Z" fill="currentColor" opacity=".3"/></svg><span>{label}</span></>
    return onChange ? <button key={id} aria-current={stage === id ? 'step' : undefined} onClick={() => onChange(id)}>{content}</button> : <a key={id} href={href} aria-current={stage === id ? 'step' : undefined}>{content}</a>
  })}</nav>
}
