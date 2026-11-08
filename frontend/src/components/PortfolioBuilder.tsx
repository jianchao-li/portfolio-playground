'use client';

import { useState, useEffect, useId } from 'react';
import { Asset } from '@/lib/api';
import { formatPercent } from '@/lib/formatting';
import { MAX_NAME_LENGTH } from '@/lib/urlState';
import SymbolInput from './SymbolInput';

interface PortfolioBuilderProps {
  onSubmit: (name: string, assets: Asset[]) => void;
  loading?: boolean;
  initialName?: string;
  initialAssets?: Asset[];
  submitLabel?: string;
}

interface AssetInput {
  /** Stable React key: must not change while the user edits the row */
  id: number;
  symbol: string;
  weight: string;
}

let nextAssetId = 0;
const newAssetInput = (symbol = '', weight = ''): AssetInput => ({ id: nextAssetId++, symbol, weight });

function toAssetInputs(assets: Asset[]): AssetInput[] {
  return assets.map(a => newAssetInput(a.symbol, String(a.weight)));
}

const defaultAssetInputs = (): AssetInput[] => [newAssetInput()];

export default function PortfolioBuilder({
  onSubmit,
  loading,
  initialName = '',
  initialAssets,
  submitLabel,
}: PortfolioBuilderProps) {
  const nameId = useId();
  const [name, setName] = useState(initialName);
  const [assets, setAssets] = useState<AssetInput[]>(
    () => (initialAssets ? toAssetInputs(initialAssets) : defaultAssetInputs())
  );

  // Reset form when initial values change (for editing different portfolios)
  useEffect(() => {
    setName(initialName);
    setAssets(initialAssets ? toAssetInputs(initialAssets) : defaultAssetInputs());
  }, [initialName, initialAssets]);

  const addAsset = () => {
    setAssets([...assets, newAssetInput()]);
  };

  const removeAsset = (index: number) => {
    setAssets(assets.filter((_, i) => i !== index));
  };

  const updateAsset = (index: number, patch: Partial<AssetInput>) => {
    setAssets(assets.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  };

  const parseWeight = (w: string) => {
    const n = Number(w);
    return isNaN(n) ? 0 : n;
  };

  const totalWeight = assets.reduce((sum, a) => sum + parseWeight(a.weight), 0);
  const validationErrors: string[] = [];
  const allSymbolsSet = assets.every(a => a.symbol.length > 0);

  if (!allSymbolsSet) {
    validationErrors.push('Select a ticker for each asset');
  } else {
    const hasEmpty = assets.some(a => a.weight === '');
    const hasInvalid = assets.some(a => a.weight !== '' && isNaN(Number(a.weight)));
    const hasOutOfRange = assets.some(a => {
      const n = Number(a.weight);
      return a.weight !== '' && !isNaN(n) && (n < 0 || n > 1);
    });
    const totalOff = !hasEmpty && !hasInvalid && !hasOutOfRange && Math.abs(totalWeight - 1) >= 1e-9;

    if (hasEmpty) validationErrors.push('Set a weight for each asset');
    if (hasInvalid) validationErrors.push('Weights must be valid numbers');
    if (hasOutOfRange) validationErrors.push('Each weight must be between 0 and 1');
    if (totalOff) validationErrors.push(`Weights must sum to 1 (currently ${totalWeight.toFixed(2)})`);
  }

  const isValid = assets.length > 0 &&
    validationErrors.length === 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isValid) {
      onSubmit(name, assets.map(a => ({ symbol: a.symbol, weight: parseWeight(a.weight) })));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="portfolio-builder">
      <div className="form-group">
        <label htmlFor={nameId}>Portfolio Name</label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          required
        />
      </div>

      <div className="assets-list">
        <h3>Assets</h3>
        {assets.map((asset, i) => (
          <div key={asset.id} className="asset-row">
            <SymbolInput
              value={asset.symbol}
              onChange={(symbol) => updateAsset(i, { symbol: symbol.toUpperCase() })}
              placeholder="Search symbol..."
              ariaLabel={`Ticker for asset ${i + 1}`}
            />
            <input
              aria-label={`Weight for asset ${i + 1}${asset.symbol ? ` (${asset.symbol})` : ''}, between 0 and 1`}
              type="number"
              placeholder="Weight"
              step="0.01"
              value={asset.weight}
              onChange={(e) => updateAsset(i, { weight: e.target.value })}
            />
            <button
              type="button"
              onClick={() => removeAsset(i)}
              className="remove-btn"
              aria-label={`Remove asset ${i + 1}${asset.symbol ? ` (${asset.symbol})` : ''}`}
            >
              <span aria-hidden="true">×</span>
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
          : validationErrors.join(' · ')
        }
      </div>

      <button type="submit" disabled={!isValid || loading} className="submit-btn">
        {loading ? 'Adding...' : (submitLabel || 'Add Portfolio')}
      </button>
    </form>
  );
}
