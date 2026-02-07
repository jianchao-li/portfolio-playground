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

interface AssetInput {
  symbol: string;
  weight: string;
}

function toAssetInputs(assets: Asset[]): AssetInput[] {
  return assets.map(a => ({ symbol: a.symbol, weight: String(a.weight) }));
}

const DEFAULT_ASSET_INPUTS: AssetInput[] = [
  { symbol: '', weight: '' },
];

export default function PortfolioBuilder({
  onSubmit,
  loading,
  initialName = '',
  initialAssets,
  submitLabel,
}: PortfolioBuilderProps) {
  const [name, setName] = useState(initialName);
  const [assets, setAssets] = useState<AssetInput[]>(
    initialAssets ? toAssetInputs(initialAssets) : DEFAULT_ASSET_INPUTS
  );

  // Reset form when initial values change (for editing different portfolios)
  useEffect(() => {
    setName(initialName);
    setAssets(initialAssets ? toAssetInputs(initialAssets) : DEFAULT_ASSET_INPUTS);
  }, [initialName, initialAssets]);

  const addAsset = () => {
    setAssets([...assets, { symbol: '', weight: '' }]);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const updateSymbol = (index: number, symbol: string) => {
    const updated = [...assets];
    updated[index].symbol = symbol.toUpperCase();
    setAssets(updated);
  };

  const updateWeight = (index: number, value: string) => {
    const updated = [...assets];
    updated[index].weight = value;
    setAssets(updated);
  };

  const parseWeight = (w: string) => {
    const n = Number(w);
    return isNaN(n) ? 0 : n;
  };

  const totalWeight = assets.reduce((sum, a) => sum + parseWeight(a.weight), 0);
  const isValid = assets.length > 0 &&
    Math.abs(totalWeight - 1) < 0.01 &&
    assets.every(a => a.symbol.length > 0 && a.weight !== '' && !isNaN(Number(a.weight)));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(name, assets.map(a => ({ symbol: a.symbol, weight: parseWeight(a.weight) })));
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
              onChange={(symbol) => updateSymbol(i, symbol)}
              placeholder="Search symbol..."
            />
            <input
              type="number"
              placeholder="Weight"
              step="0.01"
              value={asset.weight}
              onChange={(e) => updateWeight(i, e.target.value)}
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
        {loading ? 'Adding...' : (submitLabel || 'Add Portfolio')}
      </button>
    </form>
  );
}
