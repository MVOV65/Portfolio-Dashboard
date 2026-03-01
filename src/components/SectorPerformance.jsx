// SectorPerformance — reads from the quotes prop passed by Dashboard.
// Makes ZERO direct API calls; all data comes from the shared Finnhub fetch loop.
import { SECTOR_META } from '../services/finnhub';

function getMaxAbs(rows) {
  return Math.max(1, ...rows.map((r) => Math.abs(r.dp ?? 0)));
}

function Bar({ row, maxAbs }) {
  const dp       = row.dp;
  const hasData  = dp != null;
  const positive = dp >= 0;
  const pct      = hasData ? `${positive ? '+' : ''}${dp.toFixed(2)}%` : '…';
  const barWidth = hasData ? `${Math.min(100, (Math.abs(dp) / maxAbs) * 100)}%` : '0%';
  const isSol    = row.ticker === 'SOLUSD';
  const barColor = isSol
    ? 'var(--sol)'
    : (hasData ? (positive ? 'var(--cyan)' : 'var(--magenta)') : 'rgba(255,255,255,0.1)');

  return (
    <div className="sector-row">
      <div className="sector-label-group">
        <span
          className="sector-label"
          style={{ color: isSol ? 'var(--sol)' : (row.isCrypto ? 'var(--magenta)' : 'var(--text-dim)') }}
        >
          {row.label}
        </span>
        <span
          className="sector-ticker"
          style={{ color: isSol ? 'var(--sol)' : (row.isCrypto ? 'var(--magenta)' : 'var(--text-dim)') }}
        >
          {row.displayTicker ?? row.ticker}
        </span>
      </div>

      <div className="sector-bar-track">
        <div className="sector-bar-fill" style={{ width: barWidth, background: barColor }} />
      </div>

      <span className="sector-pct" style={{ color: hasData ? barColor : 'var(--text-dim)' }}>
        {pct}
      </span>
    </div>
  );
}

export default function SectorPerformance({ quotes = [] }) {
  // Build a lookup map from the quotes array passed down from Dashboard
  const quoteMap = Object.fromEntries(quotes.map((q) => [q.symbol, q]));

  const rows = SECTOR_META.map((meta) => ({
    ...meta,
    dp: quoteMap[meta.ticker]?.dp ?? null,
  }));

  const maxAbs = getMaxAbs(rows);

  return (
    <div className="sector-wrapper">
      {rows.map((r) => (
        <Bar key={r.ticker} row={r} maxAbs={maxAbs} />
      ))}
    </div>
  );
}
