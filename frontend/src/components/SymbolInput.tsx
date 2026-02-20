'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchSymbols, SymbolResult, SymbolSearchError } from '@/lib/api';
import { useClickOutside } from '@/hooks/useClickOutside';

interface SymbolInputProps {
  value: string;
  onChange: (symbol: string) => void;
  placeholder?: string;
}

export default function SymbolInput({ value, onChange, placeholder }: SymbolInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [results, setResults] = useState<SymbolResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const resetDropdown = useCallback(() => {
    setResults([]);
    setIsOpen(false);
    setHighlightIndex(-1);
    setError(null);
  }, []);

  // Close dropdown when clicking outside
  useClickOutside([inputRef, dropdownRef], () => setIsOpen(false));

  // Sync inputValue when value prop changes and clear pending debounce
  useEffect(() => {
    setInputValue(value);
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
    };
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      resetDropdown();
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await searchSymbols(query);
      setResults(data);
      setIsOpen(true);
      setHighlightIndex(-1);
    } catch (err) {
      setResults([]);
      setIsOpen(true);
      setError(err instanceof SymbolSearchError ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [resetDropdown]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setInputValue(newValue);
    onChange('');

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(newValue);
    }, 300);
  };

  const selectSymbol = (symbol: string) => {
    setInputValue(symbol);
    onChange(symbol);
    resetDropdown();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

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
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
    }
  };

  return (
    <div className="symbol-input-container">
      <input
        ref={inputRef}
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
      {isLoading && <span className="symbol-loading">...</span>}
      {isOpen && !isLoading && (error || results.length > 0 || inputValue.trim().length > 0) && (
        <div ref={dropdownRef} className="symbol-dropdown">
          {error ? (
            <div className="symbol-dropdown-error">{error}</div>
          ) : results.length === 0 ? (
            <div className="symbol-dropdown-error">No matching symbols found</div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.symbol}
                className={`symbol-dropdown-item ${index === highlightIndex ? 'highlighted' : ''}`}
                onClick={() => selectSymbol(result.symbol)}
                onMouseEnter={() => setHighlightIndex(index)}
                role="option"
              >
                <span className="symbol-ticker">{result.symbol}</span>
                <span className="symbol-name">{result.name || ''}</span>
                <span className="symbol-exchange">{result.exchange || ''}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
