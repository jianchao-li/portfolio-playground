'use client';

export function ChartSkeleton() {
  return (
    <div className="chart-container">
      <h3>Portfolio Performance (Normalized to 100)</h3>
      <div className="skeleton-chart">
        <div className="skeleton-pulse" />
      </div>
    </div>
  );
}

export function TableSkeleton() {
  return (
    <div className="stats-table-container">
      <h3>Portfolio Statistics</h3>
      <div className="skeleton-table">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton-row">
            <div className="skeleton-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResultsSkeleton() {
  return (
    <>
      <ChartSkeleton />
      <TableSkeleton />
    </>
  );
}
