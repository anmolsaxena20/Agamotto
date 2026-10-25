import React from 'react';

/**
 * Responsive SVG Mini Timeseries Chart
 * Supports line chart (single or multi-line) and area charts
 */
export function MiniChart({
  data = [],
  dataKeys = ['value'],
  colors = ['#E0B050'],
  height = 140,
  yLabel = '',
  timeKey = 'timestamp',
}) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-muted)',
          fontSize: '12px',
        }}
      >
        No timeseries data available
      </div>
    );
  }

  // Find min and max across all keys
  let minY = Infinity;
  let maxY = -Infinity;

  data.forEach((d) => {
    dataKeys.forEach((key) => {
      const v = Number(d[key]) || 0;
      if (v < minY) minY = v;
      if (v > maxY) maxY = v;
    });
  });

  if (minY === Infinity) minY = 0;
  if (maxY === -Infinity || maxY === minY) maxY = minY + 10;
  minY = Math.max(0, minY * 0.9);
  maxY = maxY * 1.1;

  const width = 600;
  const padding = { top: 15, right: 15, bottom: 25, left: 40 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const getX = (index) => padding.left + (index / (data.length - 1 || 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minY) / (maxY - minY)) * chartH;

  // Build SVG path
  const makePath = (key) => {
    return data
      .map((d, i) => {
        const x = getX(i);
        const y = getY(Number(d[key]) || 0);
        return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  };

  const makeAreaPath = (key) => {
    const linePath = makePath(key);
    const lastX = getX(data.length - 1);
    const firstX = getX(0);
    const bottomY = padding.top + chartH;
    return `${linePath} L ${lastX.toFixed(1)},${bottomY} L ${firstX.toFixed(1)},${bottomY} Z`;
  };

  return (
    <div style={{ width: '100%', position: 'relative' }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
      >
        <defs>
          {dataKeys.map((key, i) => (
            <linearGradient
              key={`grad-${key}`}
              id={`grad-${key}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={colors[i] || '#E0B050'} stopOpacity="0.25" />
              <stop offset="100%" stopColor={colors[i] || '#E0B050'} stopOpacity="0.0" />
            </linearGradient>
          ))}
        </defs>

        {/* Horizontal grid lines */}
        {[0, 0.33, 0.66, 1].map((ratio, idx) => {
          const y = padding.top + chartH * ratio;
          const val = (maxY - ratio * (maxY - minY)).toFixed(0);
          return (
            <g key={idx}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="var(--border-subtle)"
                strokeDasharray="3 3"
              />
              <text
                x={padding.left - 6}
                y={y + 3}
                fill="var(--text-dim)"
                fontSize="10"
                fontFamily="var(--font-mono)"
                textAnchor="end"
              >
                {val}
                {yLabel}
              </text>
            </g>
          );
        })}

        {/* Areas */}
        {dataKeys.map((key, i) => (
          <path
            key={`area-${key}`}
            d={makeAreaPath(key)}
            fill={`url(#grad-${key})`}
          />
        ))}

        {/* Lines */}
        {dataKeys.map((key, i) => (
          <path
            key={`line-${key}`}
            d={makePath(key)}
            fill="none"
            stroke={colors[i] || '#E0B050'}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Time X labels */}
        {data.length > 1 && (
          <>
            <text
              x={padding.left}
              y={height - 6}
              fill="var(--text-dim)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              textAnchor="start"
            >
              {data[0][timeKey]?.slice(11, 16) || 'Start'}
            </text>
            <text
              x={width - padding.right}
              y={height - 6}
              fill="var(--text-dim)"
              fontSize="10"
              fontFamily="var(--font-mono)"
              textAnchor="end"
            >
              {data[data.length - 1][timeKey]?.slice(11, 16) || 'Now'}
            </text>
          </>
        )}
      </svg>
    </div>
  );
}
