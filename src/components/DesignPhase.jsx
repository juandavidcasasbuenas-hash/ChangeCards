export default function DesignPhase({ stage }) {
  const discovering = stage === 'discover'
  return (
    <span className="design-phase">
      <svg viewBox="0 0 92 32" width="60" height="22" aria-hidden="true">
        <path d={discovering ? 'M2 16 24 2v28Z' : 'M46 16 68 2v28Z'} fill="currentColor" opacity=".2" />
        <path d="m2 16 22-14 22 14-22 14Zm44 0L68 2l22 14-22 14Z" fill="none" stroke="currentColor" />
      </svg>
      <span>{discovering ? 'Discover' : 'Develop'}</span>
    </span>
  )
}
