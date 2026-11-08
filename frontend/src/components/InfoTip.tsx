'use client';

import { ReactNode, useEffect, useId, useRef, useState } from 'react';

interface InfoTipProps {
  /** Accessible name of the trigger button, e.g. "About Sharpe Ratio". */
  label: string;
  /** Visible content of the trigger (an icon or text). */
  trigger: ReactNode;
  triggerClassName: string;
  wrapperClassName: string;
  tooltipClassName: string;
  /** Tooltip body. Linked to the trigger with aria-describedby. */
  children: ReactNode;
}

/**
 * A tooltip that works for mouse, keyboard and touch: the trigger is a real
 * button that opens the tip on hover, focus and click (tap), and closes it on
 * mouse leave, blur, Escape, or a second click.
 */
export default function InfoTip({
  label, trigger, triggerClassName, wrapperClassName, tooltipClassName, children,
}: InfoTipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  // Opened by click/tap: stays open when the pointer leaves
  const pinnedRef = useRef(false);

  const close = () => {
    pinnedRef.current = false;
    setOpen(false);
  };

  // Escape closes it even when it was opened by hovering (focus elsewhere)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span
      className={wrapperClassName}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => { if (!pinnedRef.current) setOpen(false); }}
    >
      <button
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-describedby={id}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          if (pinnedRef.current) {
            close();
          } else {
            pinnedRef.current = true;
            setOpen(true);
          }
        }}
      >
        {trigger}
      </button>
      <span role="tooltip" id={id} className={tooltipClassName} hidden={!open}>
        {children}
      </span>
    </span>
  );
}
