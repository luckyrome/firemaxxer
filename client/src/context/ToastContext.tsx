import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  addToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) { clearTimeout(timer); timers.current.delete(id); }
  }, []);

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++counter;
    setToasts((prev) => [...prev.slice(-4), { id, message, type }]);
    timers.current.set(id, setTimeout(() => remove(id), 4000));
  }, [remove]);

  useEffect(() => {
    const map = timers.current;
    return () => { map.forEach(clearTimeout); };
  }, []);

  const colors: Record<ToastType, { bg: string; border: string; text: string }> = {
    success: { bg: 'var(--success-bg)',  border: 'var(--green)',       text: 'var(--success-text)' },
    error:   { bg: 'var(--red-bg)',      border: 'var(--red-border)',  text: 'var(--red-text)' },
    info:    { bg: 'var(--bg-overlay)',  border: 'var(--border-sub)',  text: 'var(--fg-sec)' },
  };

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div style={{
        position: 'fixed', bottom: 24, right: 24,
        display: 'flex', flexDirection: 'column', gap: 8,
        zIndex: 1000, maxWidth: 360,
      }}>
        {toasts.map((t) => {
          const c = colors[t.type];
          return (
            <div
              key={t.id}
              style={{
                background: c.bg, border: `1px solid ${c.border}`,
                borderRadius: 8, color: c.text,
                fontSize: '0.83rem', padding: '10px 36px 10px 14px',
                boxShadow: 'var(--shadow-menu)',
                position: 'relative', animation: 'fadeInUp 0.15s ease',
              }}
            >
              {t.message}
              <button
                onClick={() => remove(t.id)}
                style={{
                  position: 'absolute', top: 6, right: 8,
                  background: 'none', border: 'none', color: 'inherit',
                  cursor: 'pointer', fontSize: '1rem', lineHeight: 1, opacity: 0.6,
                }}
              >×</button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
