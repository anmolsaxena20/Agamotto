/**
 * Global Latency, Time, and Formatting Utilities
 * Standardizes milliseconds to 2 decimal places and prevents scientific notation / infinite digits.
 */

export function formatLatency(val) {
  if (val == null || val === '') return '0.00 ms';
  const num = Number(val);
  if (Number.isNaN(num)) return '0.00 ms';
  return `${num.toFixed(2)} ms`;
}

export function formatLatencyNum(val) {
  if (val == null || val === '') return '0.00';
  const num = Number(val);
  if (Number.isNaN(num)) return '0.00';
  return num.toFixed(2);
}

export function formatPercent(val) {
  if (val == null || val === '') return '0.00%';
  const num = Number(val);
  if (Number.isNaN(num)) return '0.00%';
  // Auto-detect if fraction 0..1 or 0..100
  const normalized = num > 0 && num <= 1 ? num * 100 : num;
  return `${normalized.toFixed(2)}%`;
}
