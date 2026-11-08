'use client';

import { KeyboardEvent, useEffect, useId, useRef, useState } from 'react';

// Matches .add-menu-list min-width (13rem)
const MENU_MIN_WIDTH_PX = 208;

export interface AddMenuItem {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Draw a divider above this item. */
  separated?: boolean;
}

interface AddMenuProps {
  label: string;
  items: AddMenuItem[];
  className?: string;
}

/**
 * Menu button (WAI-ARIA APG pattern): Enter/Space/ArrowDown open it on the
 * first item, ArrowUp on the last; arrows/Home/End move between items; Escape
 * closes it and returns focus to the button; Tab or a click outside closes it.
 * Rendered closed on the server.
 */
export default function AddMenu({ label, items, className }: AddMenuProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [alignEnd, setAlignEnd] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const focusOnOpen = useRef<'first' | 'last' | null>(null);

  const enabled = items.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i !== -1);

  const focusItem = (index: number) => itemRefs.current[index]?.focus();

  const openMenu = (focus: 'first' | 'last' | null) => {
    // Keep the menu on screen: open it leftwards when it would overflow the right edge
    const rect = buttonRef.current?.getBoundingClientRect();
    setAlignEnd(!!rect && rect.left + MENU_MIN_WIDTH_PX > window.innerWidth - 16);
    focusOnOpen.current = focus;
    setOpen(true);
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    if (focusOnOpen.current && enabled.length > 0) {
      focusItem(focusOnOpen.current === 'first' ? enabled[0] : enabled[enabled.length - 1]);
    }
    focusOnOpen.current = null;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu('first');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu('last');
    }
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = itemRefs.current.findIndex((el) => el === document.activeElement);
    const pos = enabled.indexOf(current);
    const move = (next: number) => {
      e.preventDefault();
      focusItem(enabled[(next + enabled.length) % enabled.length]);
    };
    switch (e.key) {
      case 'ArrowDown': move(pos + 1); break;
      case 'ArrowUp': move(pos - 1); break;
      case 'Home': move(0); break;
      case 'End': move(enabled.length - 1); break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
    }
  };

  const select = (item: AddMenuItem) => {
    close(true);
    item.onSelect();
  };

  return (
    <div ref={wrapperRef} className={`add-menu${className ? ` ${className}` : ''}`}>
      <button
        ref={buttonRef}
        type="button"
        className="add-menu-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(false) : openMenu(null))}
        onKeyDown={onButtonKeyDown}
      >
        {label} <span className="add-menu-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-label={label.replace(/^\+\s*/, '')}
          className={`add-menu-list${alignEnd ? ' add-menu-list--end' : ''}`}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              aria-disabled={item.disabled || undefined}
              className={`add-menu-item${item.separated ? ' add-menu-item--separated' : ''}`}
              onClick={() => select(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
