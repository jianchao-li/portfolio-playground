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

const COLORS = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c'];

export default function PerformanceChart({ data }: PerformanceChartProps) {
  if (!data.length || !data[0].performance.dates.length) {
    return <div className="chart-empty">No data to display</div>;
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
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => value.slice(5)} // Show MM-DD
            interval="preserveStartEnd"
          />
          <YAxis domain={['auto', 'auto']} />
          <Tooltip />
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
