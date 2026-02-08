'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { CurrencyInfo } from '@/lib/api';
import { useClickOutside } from '@/hooks/useClickOutside';

interface CurrencySelectorProps {
  value: string;
  onChange: (currency: string) => void;
  disabled?: boolean;
  currencies: CurrencyInfo[];
}

export default function CurrencySelector({
  value,
  onChange,
  disabled = false,
  currencies,
}: CurrencySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setIsOpen(false);
    setSearch('');
    setHighlightIndex(-1);
  }, []);

  useClickOutside([triggerRef, dropdownRef], close);

  const selected = currencies.find((c) => c.code === value);

  const filtered = useMemo(() => {
    if (!search.trim()) return currencies;
    const q = search.toLowerCase();
    return currencies.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    );
  }, [search, currencies]);

  const toggleOpen = () => {
    if (disabled || currencies.length === 0) return;
    if (isOpen) {
      close();
    } else {
      setIsOpen(true);
      setHighlightIndex(-1);
      setSearch('');
      setTimeout(() => searchInputRef.current?.focus(), 0);
    }
  };

  const selectCurrency = (code: string) => {
    onChange(code);
    close();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < filtered.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectCurrency(filtered[highlightIndex].code);
        }
        break;
      case 'Escape':
        close();
        triggerRef.current?.focus();
        break;
    }
  };

  return (
    <div className="currency-selector">
      <label>Currency</label>
      <div style={{ position: 'relative' }}>
        <button
          ref={triggerRef}
          className={`currency-trigger${disabled ? ' disabled' : ''}`}
          onClick={toggleOpen}
          disabled={disabled}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="currency-trigger-flag">{selected?.flag ?? ''}</span>
          <span className="currency-trigger-code">{value}</span>
          <span className="currency-trigger-arrow">{isOpen ? '▲' : '▼'}</span>
        </button>

        {isOpen && (
          <div
            ref={dropdownRef}
            className="currency-dropdown"
            role="listbox"
            onKeyDown={handleKeyDown}
          >
            <div className="currency-search-wrapper">
              <input
                ref={searchInputRef}
                className="currency-search"
                type="text"
                placeholder="Type a currency"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHighlightIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                autoComplete="off"
              />
            </div>

            <div className="currency-options">
              {filtered.map((c, index) => (
                <div
                  key={c.code}
                  className={`currency-option${index === highlightIndex ? ' highlighted' : ''}${c.code === value ? ' selected' : ''}`}
                  onClick={() => selectCurrency(c.code)}
                  onMouseEnter={() => setHighlightIndex(index)}
                  role="option"
                  aria-selected={c.code === value}
                >
                  <span className="currency-option-flag">{c.flag}</span>
                  <span className="currency-option-code">{c.code}</span>
                  <span className="currency-option-name">{c.name}</span>
                  {c.code === value && (
                    <span className="currency-option-check">✓</span>
                  )}
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="currency-no-results">No currencies found</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
