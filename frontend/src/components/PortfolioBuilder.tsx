'use client';

import { useState } from 'react';
import { Asset } from '@/lib/api';

interface PortfolioBuilderProps {
  onSubmit: (name: string, assets: Asset[]) => void;
  loading?: boolean;
}

export default function PortfolioBuilder({ onSubmit, loading }: PortfolioBuilderProps) {
  const [name, setName] = useState('My Portfolio');
  const [assets, setAssets] = useState<Asset[]>([
    { symbol: 'SPY', weight: 0.6 },
    { symbol: 'BND', weight: 0.4 },
  ]);

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
  const isValid = assets.length > 0 && Math.abs(totalWeight - 1) < 0.01;

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
          <div key={i} className="asset-row">
            <input
              type="text"
              placeholder="Symbol (e.g., SPY)"
              value={asset.symbol}
              onChange={(e) => updateAsset(i, 'symbol', e.target.value)}
              required
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
        Total Weight: {(totalWeight * 100).toFixed(1)}%
        {!isValid && <span> (must equal 100%)</span>}
      </div>

      <button type="submit" disabled={!isValid || loading} className="submit-btn">
        {loading ? 'Analyzing...' : 'Analyze Portfolio'}
      </button>
    </form>
  );
}
