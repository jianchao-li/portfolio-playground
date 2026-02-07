'use client';

import { useState, useEffect } from 'react';
import { Asset } from '@/lib/api';
import { formatPercent } from '@/lib/formatting';
import SymbolInput from './SymbolInput';

interface PortfolioBuilderProps {
  onSubmit: (name: string, assets: Asset[]) => void;
  loading?: boolean;
  initialName?: string;
  initialAssets?: Asset[];
  submitLabel?: string;
}

const DEFAULT_ASSETS: Asset[] = [
  { symbol: '', weight: 0 },
];

export default function PortfolioBuilder({
  onSubmit,
  loading,
  initialName = '',
  initialAssets,
  submitLabel,
}: PortfolioBuilderProps) {
  const [name, setName] = useState(initialName);
  const [assets, setAssets] = useState<Asset[]>(initialAssets || DEFAULT_ASSETS);

  // Reset form when initial values change (for editing different portfolios)
  useEffect(() => {
    setName(initialName);
    setAssets(initialAssets || DEFAULT_ASSETS);
  }, [initialName, initialAssets]);

  const addAsset = () => {
    setAssets([...assets, { symbol: '', weight: 0 }]);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const updateAsset = (index: number, field: keyof Asset, value: string | number) => {
    const updated = [...assets];
    if (field === 'symbol') {
      updated[index].symbol = (value as string).toUpperCase();
    } else {
      updated[index].weight = Number(value);
    }
    setAssets(updated);
  };

  const totalWeight = assets.reduce((sum, a) => sum + a.weight, 0);
  const isValid = assets.length > 0 &&
    Math.abs(totalWeight - 1) < 0.01 &&
    assets.every(a => a.symbol.length > 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(name, assets);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="portfolio-builder">
      <div className="form-group">
        <label>Portfolio Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="assets-list">
        <h3>Assets</h3>
        {assets.map((asset, i) => (
          <div key={`asset-${asset.symbol || 'empty'}-${i}`} className="asset-row">
            <SymbolInput
              value={asset.symbol}
              onChange={(symbol) => updateAsset(i, 'symbol', symbol)}
              placeholder="Search symbol..."
            />
            <input
              type="number"
              placeholder="Weight"
              min="0"
              max="1"
              step="0.01"
              value={asset.weight}
              onChange={(e) => updateAsset(i, 'weight', e.target.value)}
              required
            />
            <button type="button" onClick={() => removeAsset(i)} className="remove-btn">
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={addAsset} className="add-btn">
          + Add Asset
        </button>
      </div>

      <div className={`weight-total ${isValid ? 'valid' : 'invalid'}`}>
        Total Weight: {formatPercent(totalWeight, 1)}
        {!isValid && <span> (must equal 100%)</span>}
      </div>

      <button type="submit" disabled={!isValid || loading} className="submit-btn">
        {loading ? 'Analyzing...' : (submitLabel || 'Analyze Portfolio')}
      </button>
    </form>
  );
}
