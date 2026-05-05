import { DEPT_COLORS } from './helpers'

export const roleBadge = (r) => {
  if (r === 'owner') return <span className="badge b-red">Owner</span>
  if (r === 'admin') return <span className="badge b-purple">Admin</span>
  return <span className="badge b-blue">Employee</span>
}

export const deptBadge = (d) => {
  const c = DEPT_COLORS[d] || '#888'
  return (
    <span className="badge" style={{ background: c + '18', color: c }}>
      {d}
    </span>
  )
}
