import { useEffect, useRef, useState } from 'react';
import { FileDown, MoreHorizontal, RotateCcw } from 'lucide-react';
import type { Translator } from '../i18n';

interface ActionsMenuProps {
  canExport: boolean;
  exporting: boolean;
  canReset: boolean;
  onExport: () => void;
  onReset: () => void;
  t: Translator;
}

/** Export and Reset for the whole file, behind one button at the end of the tab row. Reset asks for a second click. */
export function ActionsMenu({ canExport, exporting, canReset, onExport, onReset, t }: ActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(false); setConfirmReset(false); };
    const onPointer = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) close(); };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => { setOpen(false); setConfirmReset(false); action(); };

  return (
    <div className="inv-actions" ref={root}>
      <button
        className="ops-icon-button"
        type="button"
        aria-label={t('actions')}
        title={t('actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => { setOpen((value) => !value); setConfirmReset(false); }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="inv-actions-panel" role="menu">
          <button type="button" role="menuitem" disabled={!canExport || exporting} onClick={() => choose(onExport)}>
            <FileDown size={15} aria-hidden="true" /> {t(exporting ? 'exporting' : 'exportReport')}
          </button>
          <hr />
          {confirmReset ? (
            <button type="button" role="menuitem" className="is-danger is-confirm" onClick={() => choose(onReset)} autoFocus>
              <RotateCcw size={15} aria-hidden="true" /> {t('confirmReset')}
            </button>
          ) : (
            <button type="button" role="menuitem" className="is-danger" disabled={!canReset} onClick={() => setConfirmReset(true)}>
              <RotateCcw size={15} aria-hidden="true" /> {t('resetAll')}
            </button>
          )}
          {confirmReset && <p className="inv-actions-note">{t('resetNote')}</p>}
        </div>
      )}
    </div>
  );
}
