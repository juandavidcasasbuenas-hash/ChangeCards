import '../develop/develop.css'
import './design-phase.css'

// One diagram describes the whole journey; each half belongs to one phase.
export default function DesignPhase({ stage, onChange }) {
  const active = stage === 'discover' ? 'discover' : 'develop'
  return <nav className="workshop-phases workshop-phase-switch" data-stage={active} aria-label="Workshop phase">
    <svg className="workshop-double-diamond" viewBox="0 0 92 34" aria-hidden="true">
      <path className="workshop-diamond-discover" d="M2 17 24 2l22 15-22 15Z"/>
      <path className="workshop-diamond-develop" d="m46 17 22-15 22 15-22 15Z"/>
      <path className="workshop-diamond-fold" d="M24 2v30M68 2v30"/>
    </svg>
    <div className="workshop-phase-labels">{[['discover', 'Discover', '/safari/'], ['develop', 'Develop', '/develop']].map(([id, label, href]) => onChange
      ? <button type="button" key={id} aria-current={active === id ? 'step' : undefined} onClick={() => onChange(id)}>{label}</button>
      : <a key={id} href={href} aria-current={active === id ? 'step' : undefined}>{label}</a>)}</div>
  </nav>
}
