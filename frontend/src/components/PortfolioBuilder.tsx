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

  const weightErrors: string[] = [];
  const hasEmpty = assets.some(a => a.weight === '');
  const hasInvalid = assets.some(a => a.weight !== '' && isNaN(Number(a.weight)));
  const hasOutOfRange = assets.some(a => {
    const n = Number(a.weight);
    return a.weight !== '' && !isNaN(n) && (n < 0 || n > 1);
  });
  const totalWeight = assets.reduce((sum, a) => sum + parseWeight(a.weight), 0);
  const totalOff = !hasEmpty && !hasInvalid && !hasOutOfRange && Math.abs(totalWeight - 1) >= 0.01;

  if (hasEmpty) weightErrors.push('Set a weight for each asset');
  if (hasInvalid) weightErrors.push('Weights must be valid numbers');
  if (hasOutOfRange) weightErrors.push('Each weight must be between 0 and 1');
  if (totalOff) weightErrors.push(`Weights must sum to 1 (currently ${totalWeight.toFixed(2)})`);

  const isValid = assets.length > 0 &&
    weightErrors.length === 0 &&
    assets.every(a => a.symbol.length > 0);

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
        {isValid
          ? `Total Weight: ${formatPercent(totalWeight, 1)}`
          : weightErrors.join(' · ')
        }
      </div>

      <button type="submit" disabled={!isValid || loading} className="submit-btn">
        {loading ? 'Adding...' : (submitLabel || 'Add Portfolio')}
      </button>
    </form>
  );
}
