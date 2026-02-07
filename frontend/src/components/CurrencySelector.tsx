'use client';

import { CurrencyCode, CURRENCIES } from '@/lib/api';

interface CurrencySelectorProps {
  value: CurrencyCode;
  onChange: (currency: CurrencyCode) => void;
  disabled?: boolean;
}

export default function CurrencySelector({
  value,
  onChange,
  disabled = false,
}: CurrencySelectorProps) {
  return (
    <div className="currency-selector">
      <label>Currency</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyCode)}
        disabled={disabled}
      >
        {CURRENCIES.map((currency) => (
          <option key={currency.code} value={currency.code}>
            {currency.symbol} {currency.code} - {currency.name}
          </option>
        ))}
      </select>
    </div>
  );
}
