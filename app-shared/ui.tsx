import { useEffect, useRef, type ReactNode } from 'react';
import { AlertTriangle, Check, X } from 'lucide-react';

export type ToastKind = 'success' | 'warning' | 'error';
export interface ToastMessage {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

/** A notice in the top-right corner that closes itself. */
export function Toast({ toast, onClose, closeLabel }: { toast: ToastMessage | null; onClose: () => void; closeLabel: string }) {
  // The timer restarts only for a new message, not on every render of the page.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => close.current(), toast.kind === 'error' ? 7000 : 5000);
    return () => window.clearTimeout(timer);
  }, [toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!toast) return null;
  return (
    <div className={`ops-toast is-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <span>{toast.kind === 'success' ? <Check size={18} /> : <AlertTriangle size={18} />}</span>
      <div>
        <strong>{toast.title}</strong>
        {toast.detail && <p>{toast.detail}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label={closeLabel}><X size={15} /></button>
    </div>
  );
}

/** A centred dialog that closes on Escape or a click outside it. */
export function Modal({
  title,
  badge,
  onClose,
  closeLabel,
  footer,
  width = 560,
  children,
}: {
  title: string;
  badge?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  footer?: ReactNode;
  width?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="ops-modal-layer" role="presentation">
      <button className="ops-modal-backdrop" type="button" onClick={onClose} aria-label={closeLabel} tabIndex={-1} />
      <div className="ops-modal" role="dialog" aria-modal="true" aria-label={title} style={{ width: `min(${width}px, 100%)` }}>
        <header className="ops-modal-header">
          <h2>{title}</h2>
          {badge}
          <button className="ops-icon-button" type="button" onClick={onClose} aria-label={closeLabel}><X size={18} /></button>
        </header>
        <div className="ops-modal-body ops-scroller">{children}</div>
        {footer && <footer className="ops-modal-footer">{footer}</footer>}
      </div>
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="ops-section-label">{children}</div>;
}

/** Two or more exclusive choices shown side by side. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <div className="ops-segmented" role="group" aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'is-active' : ''}
          aria-pressed={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
