import logo from './assets/katala-logo-transparent.png'

export default function KatalaBrand({ light = false, compact = false, className = '' }) {
  return (
    <span className={`katala-lockup ${light ? 'is-light' : ''} ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <img src={logo} alt="" />
      <span className="katala-lockup-copy">
        <strong>KATALA</strong>
        <small>Fire Protection Product Trading</small>
      </span>
    </span>
  )
}
