'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Asset } from '@/lib/api';

interface PortfolioPopoverProps {
  name: string;
  assets: Asset[];
  onEdit: () => void;
  onRemove: () => void;
  onClose: () => void;
}

// Color palette for pie chart slices (distinct from main chart colors)
const COLORS = [
  '#6366f1', // indigo
  '#f59e0b', // amber
  '#10b981', // emerald
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
];

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
    color: COLORS[i % COLORS.length],
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
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => `${value.toFixed(1)}%`}
                contentStyle={{
                  background: '#fff',
                  border: '1px solid #d1e3dd',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="popover-legend">
          {assets.map((asset, i) => (
            <div key={i} className="legend-item">
              <span
                className="legend-color"
                style={{ background: COLORS[i % COLORS.length] }}
              />
              <span className="legend-symbol">{asset.symbol}</span>
              <span className="legend-weight">{(asset.weight * 100).toFixed(0)}%</span>
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
