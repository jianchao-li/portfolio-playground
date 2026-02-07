'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '@/lib/api';
import { getPieChartColor } from '@/lib/colors';
import { CHART_TOOLTIP_STYLE } from '@/lib/theme';
import { formatPercent } from '@/lib/formatting';

interface PortfolioPopoverProps {
  name: string;
  assets: Asset[];
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}

export default function PortfolioPopover({
  name,
  assets,
  onEdit,
  onRemove,
  onClose,
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
        <h4>{name}</h4>
      </div>
      <div className="popover-content">
        <div className="popover-chart">
          <ResponsiveContainer width="100%" height={120}>
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={30}
                outerRadius={50}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${entry.name}-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{
                  ...CHART_TOOLTIP_STYLE,
                  fontSize: '12px',
                }}
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
              <span className="legend-weight">{formatPercent(asset.weight, 0)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="popover-actions">
        <button className="popover-edit-btn" onClick={onEdit}>
          Edit
        </button>
        <button className="popover-remove-btn" onClick={onRemove}>
          Remove
        </button>
      </div>
    </div>
  );
}
