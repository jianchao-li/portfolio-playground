'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '@/lib/api';
import { getPieChartColor } from '@/lib/colors';
import { CHART_TOOLTIP_STYLE } from '@/lib/theme';
import { formatPercent } from '@/lib/formatting';

/** Yahoo's minor-unit codes, spelled out. */
const CURRENCY_LABELS: Record<string, string> = {
  GBp: 'GBp (pence)', ZAc: 'ZAc (cents)', ILA: 'ILA (agorot)',
};

interface PortfolioPopoverProps {
  name: string;
  assets: Asset[];
  /** Trading currency per symbol; non-USD ones get a "not converted" badge. */
  currencies?: Record<string, string | null>;
  onEdit?: () => void;
  onRemove?: () => void;
}

export default function PortfolioPopover({
  name,
  assets,
  currencies,
  onEdit,
  onRemove,
}: PortfolioPopoverProps) {
  const chartData = assets.map((asset, i) => ({
    name: asset.symbol,
    value: asset.weight * 100,
    color: getPieChartColor(i),
  }));

  return (
    <div className="portfolio-popover" onClick={(e) => e.stopPropagation()}>
      <div className="popover-arrow" />
      <div className="popover-header">
        <p className="popover-title">{name}</p>
      </div>
      <div className="popover-content">
        {/* Decorative: the legend below lists the same weights as text */}
        <div className="popover-chart" aria-hidden="true">
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                paddingAngle={chartData.length > 1 ? 2 : 0}
                dataKey="value"
                // Decorative: the legend below lists the same weights as text
                rootTabIndex={-1}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} stroke={chartData.length > 1 ? undefined : 'none'} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={CHART_TOOLTIP_STYLE}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="popover-legend">
          {assets.map((asset, i) => (
            <div key={`${asset.symbol}-${i}`} className="legend-item">
              <span
                className="legend-color"
                style={{ background: getPieChartColor(i) }}
              />
              <span className="legend-symbol">{asset.symbol}</span>
              {(() => {
                const code = currencies?.[asset.symbol];
                return code && code !== 'USD' ? (
                  <span className="currency-badge" title="Prices are used as quoted; currency conversion is not applied yet">
                    {CURRENCY_LABELS[code] ?? code}, not converted
                  </span>
                ) : null;
              })()}
              <span className="legend-weight">{formatPercent(asset.weight, 0)}</span>
            </div>
          ))}
        </div>
      </div>
      {(onEdit || onRemove) && (
        <div className="popover-actions">
          {onEdit && (
            <button className="popover-edit-btn" onClick={onEdit}>
              Edit
            </button>
          )}
          {onRemove && (
            <button className="popover-remove-btn" onClick={onRemove}>
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}
