import { useEffect } from 'react';

export default function Modal({ open, title, onClose, children, footer, size = 'md', panelClassName, dark }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape') onClose?.();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className={`w-full ${widths[size]} rounded-xl shadow-lg ${panelClassName ?? 'bg-white'}`}>
        <div
          className="flex items-center justify-between px-5 py-3"
          style={{ borderBottom: `1px solid ${dark ? '#374151' : '#e5e7eb'}` }}
        >
          <h2
            className="text-base font-semibold"
            style={{ color: dark ? '#f3f4f6' : '#111827' }}
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 transition"
            style={{ color: dark ? '#6b7280' : '#9ca3af' }}
            aria-label="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.28 4.22a.75.75 0 011.06 0L10 8.94l4.66-4.72a.75.75 0 111.06 1.06L11.06 10l4.66 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.66 4.72a.75.75 0 11-1.06-1.06L8.94 10 4.28 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <div
            className="flex items-center justify-end gap-2 px-5 py-3"
            style={{ borderTop: `1px solid ${dark ? '#374151' : '#e5e7eb'}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
