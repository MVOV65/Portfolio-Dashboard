import { useState, useEffect, useRef } from 'react';

const fmt = (n, decimals = 2) =>
  n != null && !isNaN(n) ? Number(n).toFixed(decimals) : '—';

const fmtVol = (v) => {
  if (v == null || isNaN(v)) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
  if (v >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return String(v);
};

function FlashCell({ value, children, className = '' }) {
  const [flash, setFlash] = useState('');
  const prevValue = useRef(value);

  useEffect(() => {
    if (prevValue.current !== value && value != null) {
      setFlash(value >= 0 ? 'flash-green' : 'flash-red');
      const t = setTimeout(() => setFlash(''), 800);
      prevValue.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);

  return <span className={`${className} ${flash}`}>{children}</span>;
}

const ROW_FLASH_DURATION = 600;
const ROW_STAGGER_MS = 40;

function TickerRow({ q, index, refreshKey, onTickerClick }) {
  const [flashing, setFlashing] = useState(false);
  const prevKey = useRef(refreshKey);

  useEffect(() => {
    if (refreshKey === prevKey.current) return;
    prevKey.current = refreshKey;

    const staggerTimer = setTimeout(() => {
      setFlashing(true);
      const offTimer = setTimeout(() => setFlashing(false), ROW_FLASH_DURATION);
      return () => clearTimeout(offTimer);
    }, index * ROW_STAGGER_MS);

    return () => clearTimeout(staggerTimer);
  }, [refreshKey, index]);

  const hasData = q.c != null;
  const pos = q.dp >= 0;
  const colorClass = hasData ? (pos ? 'positive' : 'negative') : '';
  const displayLabel = q.label ?? q.symbol;

  return (
    <tr
      className={`ticker-row${flashing ? ' row-refresh-flash' : ''}${q.isCrypto ? ' crypto-row' : ''}${!hasData ? ' pending' : ''}`}
      onClick={() => onTickerClick(q.symbol)}
    >
      <td className="ticker-symbol">{displayLabel}</td>
      <td>
        <FlashCell value={q.c}>
          {hasData ? `$${fmt(q.c)}` : '—'}
        </FlashCell>
      </td>
      <td>
        <FlashCell value={q.d} className={colorClass}>
          {hasData ? `${q.d >= 0 ? '+' : ''}${fmt(q.d)}` : '—'}
        </FlashCell>
      </td>
      <td>
        <FlashCell value={q.dp} className={colorClass}>
          {hasData ? `${q.dp >= 0 ? '+' : ''}${fmt(q.dp)}%` : '—'}
        </FlashCell>
      </td>
      <td className="vol-cell">{fmtVol(q.v)}</td>
    </tr>
  );
}

function SeparatorRow() {
  return (
    <tr className="section-separator" aria-hidden="true">
      <td colSpan={5} />
    </tr>
  );
}

export default function TickerTable({ quotes, onTickerClick, refreshKey, cryptoTickers = [] }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => -d);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const arrow = (key) => sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';

  const cryptoSet = new Set(cryptoTickers);

  let rows;
  if (sortKey === null) {
    // Default: crypto pinned top, equities below, with a separator between
    const cryptoRows = quotes.filter((q) => cryptoSet.has(q.symbol));
    const equityRows = quotes.filter((q) => !cryptoSet.has(q.symbol));
    rows = { cryptoRows, equityRows, sorted: null };
  } else {
    const sorted = [...quotes].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });
    rows = { cryptoRows: null, equityRows: null, sorted };
  }

  // Build a flat list for stagger index tracking
  const flatList = sortKey === null
    ? [...rows.cryptoRows, ...rows.equityRows]
    : rows.sorted;

  return (
    <div className="ticker-table-wrapper">
      <table className="ticker-table">
        <thead>
          <tr>
            {[
              ['symbol', 'TICKER'],
              ['c', 'PRICE'],
              ['d', 'CHANGE'],
              ['dp', 'CHANGE %'],
              ['v', 'VOLUME'],
            ].map(([key, label]) => (
              <th key={key} onClick={() => handleSort(key)} className="sortable">
                {label}{arrow(key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sortKey === null ? (
            <>
              {rows.cryptoRows.map((q) => (
                <TickerRow
                  key={q.symbol}
                  q={q}
                  index={flatList.indexOf(q)}
                  refreshKey={refreshKey}
                  onTickerClick={onTickerClick}
                />
              ))}
              {rows.cryptoRows.length > 0 && rows.equityRows.length > 0 && (
                <SeparatorRow />
              )}
              {rows.equityRows.map((q) => (
                <TickerRow
                  key={q.symbol}
                  q={q}
                  index={flatList.indexOf(q)}
                  refreshKey={refreshKey}
                  onTickerClick={onTickerClick}
                />
              ))}
            </>
          ) : (
            rows.sorted.map((q, i) => (
              <TickerRow
                key={q.symbol}
                q={q}
                index={i}
                refreshKey={refreshKey}
                onTickerClick={onTickerClick}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
