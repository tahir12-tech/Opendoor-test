/* =====================================================================
   Modal — the shared scrim + dialog used by org, application detail,
   partners, users and help. Closes on scrim click and Escape. Rendered in
   a portal so it stacks above the app shell.
   ===================================================================== */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import './Modal.css';

// Shared stack of open modals so Escape only dismisses the TOP-most one. Without
// this, two mounted modals (e.g. a delete confirmation stacked over an edit
// modal) each register a document-level Escape listener and one keypress closes
// both, discarding the underlying form.
const modalStack: string[] = [];

export function Modal({
  open,
  onClose,
  title,
  sub,
  children,
  footer,
  width,
  bodyStyle,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  bodyStyle?: React.CSSProperties;
}) {
  const titleId = useId();
  // Latest onClose without re-running the stack effect on every render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    modalStack.push(titleId);
    const onKey = (e: KeyboardEvent) => {
      // Only the top-most modal responds to Escape.
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === titleId) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = modalStack.lastIndexOf(titleId);
      if (i >= 0) modalStack.splice(i, 1);
    };
  }, [open, titleId]);

  if (!open) return null;

  return createPortal(
    <div className="modal-scrim is-open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={titleId} style={width ? { maxWidth: width } : undefined}>
        <div className="modal__head">
          <div>
            <div className="modal__title" id={titleId}>{title}</div>
            {sub != null && <div className="modal__sub">{sub}</div>}
          </div>
          <button className="modal__close" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="modal__body" style={bodyStyle}>{children}</div>
        {footer != null && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
