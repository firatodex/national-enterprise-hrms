// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
// Apple-inspired: clean whites, precise type scale, meaningful colour only
export const T = {
  // Brand
  brand:       '#1A56DB',
  brandDark:   '#1245B8',
  brandLight:  '#EBF2FF',
  brandBorder: '#BFDBFE',

  // Semantic
  green:       '#059669',
  greenLight:  '#ECFDF5',
  greenBorder: '#A7F3D0',
  red:         '#DC2626',
  redLight:    '#FEF2F2',
  redBorder:   '#FECACA',
  amber:       '#D97706',
  amberLight:  '#FFFBEB',
  amberBorder: '#FDE68A',
  purple:      '#7C3AED',
  purpleLight: '#F5F3FF',

  // Neutrals — 9-stop scale
  n900: '#0F1117',
  n800: '#1F2937',
  n700: '#374151',
  n600: '#4B5563',
  n500: '#6B7280',
  n400: '#9CA3AF',
  n300: '#D1D5DB',
  n200: '#E5E7EB',
  n100: '#F3F4F6',
  n50:  '#F9FAFB',
  white:'#FFFFFF',

  // Surface
  bg:      '#F5F7FA',
  surface: '#FFFFFF',
  surface2:'#F9FAFB',

  // Border
  border:  '#E5E7EB',
  border2: '#F3F4F6',

  // Radius
  r4:  '4px',
  r8:  '8px',
  r12: '12px',
  r16: '16px',
  r20: '20px',
  r24: '24px',
  full:'9999px',

  // Shadow
  shadowSm: '0 1px 2px rgba(0,0,0,.05)',
  shadow:   '0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,.08), 0 16px 40px rgba(0,0,0,.06)',
  shadowLg: '0 16px 64px rgba(0,0,0,.12)',

  // Type scale
  xs:   '11px',
  sm:   '12px',
  base: '13px',
  md:   '14px',
  lg:   '15px',
  xl:   '18px',
  '2xl':'22px',
  '3xl':'28px',
  '4xl':'36px',
}

export const DEPT_COLORS = {
  Production:  { text: '#1A56DB', bg: '#EBF2FF' },
  Management:  { text: '#7C3AED', bg: '#F5F3FF' },
  Quality:     { text: '#059669', bg: '#ECFDF5' },
  Logistics:   { text: '#D97706', bg: '#FFFBEB' },
  Admin:       { text: '#DC2626', bg: '#FEF2F2' },
  Default:     { text: '#4B5563', bg: '#F3F4F6' },
}
export const deptStyle = d => DEPT_COLORS[d] || DEPT_COLORS.Default
