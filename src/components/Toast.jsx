import { useState, createContext, useContext, useCallback } from 'react'

const ToastContext = createContext(null)
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg, color = 'var(--green)') => {
    setToast({ msg, color })
    setTimeout(() => setToast(null), 3500)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            padding: '11px 20px',
            borderRadius: 10,
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: toast.color,
            zIndex: 1000,
            boxShadow: '0 4px 16px rgba(0,0,0,.2)',
            animation: 'fadeUp .3s ease',
            maxWidth: 320,
          }}
        >
          {toast.msg}
        </div>
      )}
    </ToastContext.Provider>
  )
}
