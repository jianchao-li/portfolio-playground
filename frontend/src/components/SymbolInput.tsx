'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { searchSymbols, SymbolResult, SymbolSearchError } from '@/lib/api';

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

  // Sync inputValue when value prop changes and clear pending debounce
  useEffect(() => {
    setInputValue(value);
    // Clear any pending search when value prop changes externally
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [value]);

  const performSearch = useCallback(async (query: string) => {
    if (!query || query.length < 1) {
      setResults([]);
      setIsOpen(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await searchSymbols(query);
      setResults(data);
      setIsOpen(data.length > 0);
      setHighlightIndex(-1);
    } catch (err) {
      setResults([]);
      setIsOpen(true); // Keep open to show error
      if (err instanceof SymbolSearchError) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value.toUpperCase();
    setInputValue(newValue);

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Debounce search
    debounceRef.current = setTimeout(() => {
      performSearch(newValue);
    }, 300);
  };

  const selectSymbol = (symbol: string) => {
    setInputValue(symbol);
    onChange(symbol);
    setIsOpen(false);
    setResults([]);
    setHighlightIndex(-1);
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="symbol-input-container">
      <input
        ref={inputRef}
        type="text"
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          // Reopen dropdown if we have results or an error to show
          if (results.length > 0 || error) {
            setIsOpen(true);
          } else if (inputValue.length > 0) {
            // Trigger a new search if user focuses with text but no results
            performSearch(inputValue);
          }
        }}
        placeholder={placeholder || 'Search symbol...'}
        autoComplete="off"
      />
      {isLoading && <span className="symbol-loading">...</span>}
      {isOpen && (error || results.length > 0) && (
        <div ref={dropdownRef} className="symbol-dropdown">
          {error ? (
            <div className="symbol-dropdown-error">{error}</div>
          ) : (
            results.map((result, index) => (
              <div
                key={result.symbol}
                className={`symbol-dropdown-item ${index === highlightIndex ? 'highlighted' : ''}`}
                onClick={() => selectSymbol(result.symbol)}
                onMouseEnter={() => setHighlightIndex(index)}
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
