'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { PerformanceData } from '@/lib/api';

interface PerformanceChartProps {
  data: { name: string; performance: PerformanceData }[];
}

const COLORS = ['#3ecfb2', '#e74c3c', '#9b59b6', '#f39c12', '#3498db', '#1abc9c', '#e91e63'];

export default function PerformanceChart({ data }: PerformanceChartProps) {
  if (!data.length || !data[0]?.performance?.dates?.length) {
    return (
      <div className="chart-container">
        <h3>Portfolio Performance (Normalized to 100)</h3>
        <div className="chart-empty">
          <p>Select portfolios to compare performance</p>
        </div>
      </div>
    );
  }

  // Transform data for Recharts
  const chartData = data[0].performance.dates.map((date, i) => {
    const point: Record<string, string | number> = { date };
    data.forEach((portfolio) => {
      point[portfolio.name] = portfolio.performance.values[i];
    });
    return point;
  });

  return (
    <div className="chart-container">
      <h3>Portfolio Performance (Normalized to 100)</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d1e3dd" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => value.slice(5)} // Show MM-DD
            interval="preserveStartEnd"
            stroke="#636e72"
            tick={{ fill: '#636e72' }}
          />
          <YAxis
            domain={['auto', 'auto']}
            stroke="#636e72"
            tick={{ fill: '#636e72' }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #d1e3dd',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }}
          />
          <Legend />
          {data.map((portfolio, i) => (
            <Line
              key={portfolio.name}
              type="monotone"
              dataKey={portfolio.name}
              stroke={COLORS[i % COLORS.length]}
              dot={false}
              strokeWidth={2}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
