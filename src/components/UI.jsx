import { useState } from 'react'
import { T, deptStyle } from '../lib/theme.js'
import { initials } from '../lib/calc.js'

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ name, dept, size = 36 }) {
  const c = deptStyle(dept)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: c.bg, color: c.text,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.34, fontWeight: 800, letterSpacing: '-.5px',
    }}>
      {initials(name)}
    </div>
  )
}

// ── Badge ─────────────────────────────────────────────────────────────────────
const BADGE_MAP = {
  blue:   [T.brandLight,  T.brand],
  green:  [T.greenLight,  T.green],
  red:    [T.redLight,    T.red],
  amber:  [T.amberLight,  T.amber],
  purple: [T.purpleLight, T.purple],
  gray:   [T.n100,        T.n500],
}
export function Badge({ color = 'gray', children, dot = false }) {
  const [bg, fg] = BADGE_MAP[color] || BADGE_MAP.gray
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: T.full,
      background: bg, color: fg,
      fontSize: T.xs, fontWeight: 700, letterSpacing: '.2px', whiteSpace: 'nowrap',
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: fg }} />}
      {children}
    </span>
  )
}

// ── Button ────────────────────────────────────────────────────────────────────
const BTN_VARIANTS = {
  primary: { background: T.brand,      color: '#fff', border: 'none' },
  ghost:   { background: 'transparent',color: T.n600, border: `1.5px solid ${T.border}` },
  danger:  { background: T.redLight,   color: T.red,  border: `1.5px solid ${T.redBorder}` },
  success: { background: T.greenLight, color: T.green,border: `1.5px solid ${T.greenBorder}` },
  soft:    { background: T.brandLight, color: T.brand,border: `1.5px solid ${T.brandBorder}` },
}
const BTN_SIZES = {
  xs: { padding: '5px 10px',  fontSize: T.xs,  borderRadius: T.r8  },
  sm: { padding: '7px 13px',  fontSize: T.sm,  borderRadius: T.r8  },
  md: { padding: '10px 18px', fontSize: T.base,borderRadius: T.r12 },
  lg: { padding: '13px 24px', fontSize: T.lg,  borderRadius: T.r12 },
  xl: { padding: '15px 32px', fontSize: T.xl,  borderRadius: T.r16 },
}
export function Btn({ children, onClick, variant = 'primary', size = 'md', disabled = false, full = false, style = {}, icon }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary
  const s = BTN_SIZES[size] || BTN_SIZES.md
  return (
    <button
      onClick={disabled ? undefined : onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: 'inherit', fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? .45 : 1, transition: 'opacity .15s, transform .1s',
        width: full ? '100%' : undefined,
        ...v, ...s, ...style,
      }}
    >
      {icon && <span style={{ fontSize: '1.1em', lineHeight: 1 }}>{icon}</span>}
      {children}
    </button>
  )
}

// ── Card ──────────────────────────────────────────────────────────────────────
export function Card({ children, style = {}, p = '20px', hover = false }) {
  return (
    <div style={{
      background: T.surface, borderRadius: T.r16,
      border: `1px solid ${T.border}`, boxShadow: T.shadow,
      overflow: 'hidden', transition: hover ? 'box-shadow .2s' : undefined,
      ...style,
    }}>
      {p ? <div style={{ padding: p }}>{children}</div> : children}
    </div>
  )
}

export function CardHead({ children, action, border = true }) {
  return (
    <div style={{
      padding: '14px 20px',
      borderBottom: border ? `1px solid ${T.border}` : 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <span style={{ fontSize: T.md, fontWeight: 700, color: T.n800 }}>{children}</span>
      {action}
    </div>
  )
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, value, onChange, type = 'text', placeholder = '', note = '', error = '', style = {}, required = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && (
        <label style={{ fontSize: T.sm, fontWeight: 600, color: T.n600 }}>
          {label}{required && <span style={{ color: T.red, marginLeft: 3 }}>*</span>}
        </label>
      )}
      <input
        value={value} onChange={e => onChange(e.target.value)}
        type={type} placeholder={placeholder}
        style={{
          padding: '10px 13px',
          border: `1.5px solid ${error ? T.red : T.border}`,
          borderRadius: T.r12, fontSize: T.base, fontFamily: 'inherit',
          outline: 'none', background: T.n50, color: T.n800,
          transition: 'border-color .15s',
          ...style,
        }}
        onFocus={e => e.target.style.borderColor = error ? T.red : T.brand}
        onBlur={e  => e.target.style.borderColor = error ? T.red : T.border}
      />
      {error && <span style={{ fontSize: T.xs, color: T.red, fontWeight: 600 }}>{error}</span>}
      {note  && <span style={{ fontSize: T.xs, color: T.n400 }}>{note}</span>}
    </div>
  )
}

// ── Select ────────────────────────────────────────────────────────────────────
export function Select({ label, value, onChange, options = [], style = {} }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {label && <label style={{ fontSize: T.sm, fontWeight: 600, color: T.n600 }}>{label}</label>}
      <select
        value={value} onChange={e => onChange(e.target.value)}
        style={{
          padding: '10px 13px', border: `1.5px solid ${T.border}`,
          borderRadius: T.r12, fontSize: T.base, fontFamily: 'inherit',
          background: T.n50, color: T.n800, outline: 'none',
          ...style,
        }}
      >
        {options.map(o => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 480, noPad = false }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(10,15,30,.5)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: T.surface, borderRadius: T.r24,
          width, maxWidth: '96vw', maxHeight: '92vh', overflowY: 'auto',
          boxShadow: T.shadowLg,
        }}
      >
        <div style={{
          padding: '20px 24px 16px', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`,
          position: 'sticky', top: 0, background: T.surface, zIndex: 1,
        }}>
          <span style={{ fontSize: T.lg, fontWeight: 800, color: T.n800 }}>{title}</span>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: T.n100, cursor: 'pointer', fontSize: 14, color: T.n400,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>✕</button>
        </div>
        {noPad
          ? children
          : <div style={{ padding: '20px 24px 28px' }}>{children}</div>
        }
      </div>
    </div>
  )
}

// ── Toast ─────────────────────────────────────────────────────────────────────
export function Toast({ msg, type = 'success', onDone }) {
  if (!msg) return null
  const bg = type === 'success' ? T.green : type === 'error' ? T.red : T.amber
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
      background: bg, color: '#fff', padding: '12px 24px', borderRadius: T.r12,
      fontSize: T.base, fontWeight: 600, boxShadow: T.shadowMd, zIndex: 900,
      display: 'flex', alignItems: 'center', gap: 10, maxWidth: '90vw', whiteSpace: 'nowrap',
    }}>
      <span>{type === 'success' ? '✓' : type === 'error' ? '✕' : '!'}</span>
      {msg}
    </div>
  )
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = T.brand, icon, trend }) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: T.xs, fontWeight: 700, color: T.n400, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 10 }}>
            {label}
          </div>
          <div style={{ fontSize: T['3xl'], fontWeight: 800, color, lineHeight: 1, letterSpacing: '-1px' }}>
            {value}
          </div>
          {sub && <div style={{ fontSize: T.sm, color: T.n400, marginTop: 6 }}>{sub}</div>}
        </div>
        {icon && (
          <div style={{ fontSize: 24, opacity: .5 }}>{icon}</div>
        )}
      </div>
    </Card>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
      marginBottom: 24, flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <h1 style={{ fontSize: T['2xl'], fontWeight: 800, color: T.n800, margin: 0, letterSpacing: '-.3px' }}>{title}</h1>
        {sub && <p style={{ fontSize: T.sm, color: T.n400, marginTop: 4, margin: 0 }}>{sub}</p>}
      </div>
      {action && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>{action}</div>}
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────
export function ProgressBar({ pct, color = T.brand, height = 5 }) {
  return (
    <div style={{ background: T.n200, borderRadius: T.full, height, overflow: 'hidden', marginTop: 5 }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: color, borderRadius: T.full, transition: 'width .4s ease' }} />
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
export function Empty({ icon = '📭', title, sub }) {
  return (
    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: T.md, fontWeight: 700, color: T.n600, marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: T.sm, color: T.n400 }}>{sub}</div>}
    </div>
  )
}

// ── Divider ───────────────────────────────────────────────────────────────────
export function Divider({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
      <div style={{ flex: 1, height: 1, background: T.border }} />
      {label && <span style={{ fontSize: T.xs, color: T.n400, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</span>}
      <div style={{ flex: 1, height: 1, background: T.border }} />
    </div>
  )
}

// ── Inline alert ──────────────────────────────────────────────────────────────
export function Alert({ type = 'info', children }) {
  const map = {
    info:    [T.brandLight,  T.brand,  T.brandBorder, 'ℹ'],
    warning: [T.amberLight,  T.amber,  T.amberBorder, '⚠'],
    error:   [T.redLight,    T.red,    T.redBorder,   '✕'],
    success: [T.greenLight,  T.green,  T.greenBorder, '✓'],
  }
  const [bg, fg, border, icon] = map[type] || map.info
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '12px 16px',
      background: bg, border: `1px solid ${border}`,
      borderRadius: T.r12, fontSize: T.sm, color: fg,
    }}>
      <span style={{ flexShrink: 0, fontWeight: 800 }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}

// ── Table wrapper ─────────────────────────────────────────────────────────────
export function Table({ headers, children, stickyFirst = false }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: T.n50 }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '10px 16px', textAlign: 'left',
                fontSize: T.xs, fontWeight: 700, color: T.n400,
                textTransform: 'uppercase', letterSpacing: '.8px',
                whiteSpace: 'nowrap', borderBottom: `1px solid ${T.border}`,
                position: stickyFirst && i === 0 ? 'sticky' : undefined,
                left: stickyFirst && i === 0 ? 0 : undefined,
                background: T.n50,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function TR({ children, highlight, onClick }) {
  return (
    <tr
      onClick={onClick}
      style={{
        borderBottom: `1px solid ${T.border2}`,
        background: highlight || 'transparent',
        cursor: onClick ? 'pointer' : undefined,
        transition: 'background .1s',
      }}
      onMouseEnter={e => { if (!highlight) e.currentTarget.style.background = T.n50 }}
      onMouseLeave={e => { if (!highlight) e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </tr>
  )
}

export function TD({ children, style = {}, mono = false }) {
  return (
    <td style={{
      padding: '12px 16px', fontSize: T.base, color: T.n700,
      fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
      ...style,
    }}>
      {children}
    </td>
  )
}
