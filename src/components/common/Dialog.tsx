import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

interface DialogProps {
  titleId: string;
  descriptionId?: string;
  onClose: () => void;
  children: ReactNode;
}

export function Dialog({ titleId, descriptionId, onClose, children }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-overlay" onClick={onClose}>
    <div className="modal-content" style={{ maxWidth: 440 }} role="alertdialog" aria-modal="true"
      aria-labelledby={titleId} aria-describedby={descriptionId} tabIndex={-1} ref={ref}
      onClick={event => event.stopPropagation()} onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === ref.current)) { event.preventDefault(); first.focus(); }
      }}>
      {children}
    </div>
  </div>;
}
