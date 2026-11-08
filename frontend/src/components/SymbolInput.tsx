'use client';

import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { searchSymbols, SymbolResult, SymbolSearchError } from '@/lib/api';
import { useClickOutside } from '@/hooks/useClickOutside';

interface SymbolInputProps {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
  /** Accessible name for the input (there is no visible label per row). */
  ariaLabel?: string;
}

export default function SymbolInput({ value, onChange, placeholder, ariaLabel }: SymbolInputProps) {
  const listId = useId();
  const [inputValue, setInputValue] = useState(value);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  // Incremented for every search (and whenever the input changes), so a slow
  // response can't overwrite results for newer input.
  const requestIdRef = useRef(0);
  // Last symbol this component reported via onChange. The parent echoes it
  // back as `value`; only a different value (e.g. a form reset) should
  // overwrite what the user is typing.
  const lastEmittedRef = useRef(value);
  const emitChange = useCallback((symbol: string) => {
    lastEmittedRef.current = symbol;
    onChange(symbol);
  }, [onChange]);

  const resetDropdown = useCallback(() => {
    requestIdRef.current += 1;
    setIsLoading(false);
    setResults([]);
    setIsOpen(false);
    setHighlightIndex(-1);
    setError(null);
  }, []);

  // Close dropdown when clicking outside
  useClickOutside([inputRef, dropdownRef], () => setIsOpen(false));

  // Sync inputValue when value prop changes and clear pending debounce
  useEffect(() => {
    if (value === lastEmittedRef.current) return;
    lastEmittedRef.current = value;
    setInputValue(value);
    requestIdRef.current += 1;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [value]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      requestIdRef.current += 1;
    };
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      resetDropdown();
      return;
    }

    const requestId = ++requestIdRef.current;
    const isStale = () => requestId !== requestIdRef.current;

    setIsLoading(true);
    setError(null);
    try {
      const data = await searchSymbols(query);
      if (isStale()) return;
      setResults(data);
      setIsOpen(true);
      setHighlightIndex(-1);
    } catch (err) {
      if (isStale()) return;
      setResults([]);
      setIsOpen(true);
      setError(err instanceof SymbolSearchError ? err.message : 'An unexpected error occurred');
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  }, [resetDropdown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setInputValue(newValue);
    emitChange('');
    // Results on screen are for the old text; drop any in-flight response for it
    requestIdRef.current += 1;
    setIsLoading(false);

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(newValue);
    }, 300);
  };

  const selectSymbol = (symbol: string) => {
    setInputValue(symbol);
    emitChange(symbol);
    resetDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      // Re-open the last results with the keyboard
      if (e.key === 'ArrowDown' && results.length > 0) {
        e.preventDefault();
        setIsOpen(true);
        setHighlightIndex(0);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          selectSymbol(results[highlightIndex].symbol);
        }
        break;
      case 'Escape':
        // Close only the dropdown, not an enclosing dialog
        e.stopPropagation();
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  const showDropdown = isOpen && !isLoading && (error || results.length > 0 || inputValue.trim().length > 0);
  const listOpen = Boolean(showDropdown) && !error && results.length > 0;
  const optionId = (index: number) => `${listId}-option-${index}`;

  return (
    <div className="symbol-input-container">
      <input
        ref={inputRef}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={listOpen}
        aria-controls={listOpen ? listId : undefined}
        aria-activedescendant={listOpen && highlightIndex >= 0 ? optionId(highlightIndex) : undefined}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (results.length > 0 || error) {
            setIsOpen(true);
          } else if (inputValue.length > 0) {
            performSearch(inputValue);
          }
        }}
        placeholder={placeholder || 'Search symbol...'}
        autoComplete="off"
      />
      {isLoading && <span className="symbol-loading" aria-hidden="true">...</span>}
      {showDropdown && (
        <div ref={dropdownRef} className="symbol-dropdown">
          {error ? (
            <div className="symbol-dropdown-error" role="status">{error}</div>
          ) : results.length === 0 ? (
            <div className="symbol-dropdown-error" role="status">No matching symbols found</div>
          ) : (
            <div role="listbox" id={listId} aria-label="Matching symbols">
            {results.map((result, index) => (
              <div
                key={result.symbol}
                id={optionId(index)}
                className={`symbol-dropdown-item ${index === highlightIndex ? 'highlighted' : ''}`}
                onClick={() => selectSymbol(result.symbol)}
                onMouseEnter={() => setHighlightIndex(index)}
                role="option"
                aria-selected={index === highlightIndex}
              >
                <span className="symbol-ticker">{result.symbol}</span>
                <span className="symbol-name">{result.name || ''}</span>
                <span className="symbol-exchange">{result.exchange || ''}</span>
              </div>
            ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
