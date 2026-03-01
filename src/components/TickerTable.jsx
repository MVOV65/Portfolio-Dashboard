import { useState, useEffect, useRef } from 'react';
import { CRYPTO_MAP } from '../services/finnhub';

const fmt = (n, decimals = 2) =>
  n != null && !isNaN(n) ? Number(n).toFixed(decimals) : '—';

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

function TickerRow({ q, index, refreshKey, onTickerClick, weekPct }) {
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

  const weekColor = weekPct == null ? '' : weekPct >= 0 ? 'positive' : 'negative';
  const weekFmt   = weekPct == null ? '—' : `${weekPct >= 0 ? '+' : ''}${weekPct.toFixed(2)}%`;

  return (
    <tr
      className={`ticker-row${flashing ? ' row-refresh-flash' : ''}${q.isCrypto ? ' crypto-row' : ''}${q.symbol === 'SOLUSD' ? ' sol-row' : ''}${!hasData ? ' pending' : ''}`}
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
      <td className={`week-cell ${weekColor}`}>{weekFmt}</td>
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

// Module-level cache so 7D data survives re-renders and is only fetched once per session
const weekCache = {};
let fetchInProgress = false;
const fetchQueue = [];

async function fetch7Day(symbol) {
  if (weekCache[symbol] !== undefined) return weekCache[symbol];
  try {
    const yahooSymbol = CRYPTO_MAP[symbol]?.yahooSymbol ?? symbol;
    const res = await fetch(`/api/chart?symbol=${encodeURIComponent(yahooSymbol)}`);
    if (!res.ok) { weekCache[symbol] = null; return null; }
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const valid = closes.filter((c) => c != null);
    if (valid.length < 2) { weekCache[symbol] = null; return null; }
    const last  = valid[valid.length - 1];
    const start = valid[Math.max(0, valid.length - 8)];
    const pct = ((last - start) / start) * 100;
    weekCache[symbol] = pct;
    return pct;
  } catch {
    weekCache[symbol] = null;
    return null;
  }
}

export default function TickerTable({ quotes, onTickerClick, refreshKey, cryptoTickers = [] }) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState(1);
  const [weekMap, setWeekMap] = useState({});

  // Fetch 7-day changes once per session — cached at module level so re-renders
  // and StrictMode double-invocations don't trigger duplicate network calls.
  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      for (const q of quotes) {
        if (cancelled) break;
        // Skip if already cached
        if (weekCache[q.symbol] !== undefined) {
          setWeekMap((prev) => ({ ...prev, [q.symbol]: weekCache[q.symbol] }));
          continue;
        }
        const pct = await fetch7Day(q.symbol);
        if (!cancelled) setWeekMap((prev) => ({ ...prev, [q.symbol]: pct }));
        // 600ms between requests — 23 tickers takes ~14s total, no rate limit risk
        await new Promise((r) => setTimeout(r, 600));
      }
    }
    loadAll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const cryptoRows = quotes.filter((q) => cryptoSet.has(q.symbol));
    const equityRows = quotes.filter((q) => !cryptoSet.has(q.symbol));
    rows = { cryptoRows, equityRows, sorted: null };
  } else {
    const sorted = [...quotes].sort((a, b) => {
      const av = sortKey === 'week7' ? (weekMap[a.symbol] ?? -Infinity) : (a[sortKey] ?? '');
      const bv = sortKey === 'week7' ? (weekMap[b.symbol] ?? -Infinity) : (b[sortKey] ?? '');
      if (typeof av === 'string') return av.localeCompare(bv) * sortDir;
      return (av - bv) * sortDir;
    });
    rows = { cryptoRows: null, equityRows: null, sorted };
  }

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
              ['c',      'PRICE'],
              ['d',      'CHANGE'],
              ['dp',     'CHG %'],
              ['week7',  '7D %'],
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
                  weekPct={weekMap[q.symbol] ?? null}
                />
              ))}
              {rows.cryptoRows.length > 0 && rows.equityRows.length > 0 && <SeparatorRow />}
              {rows.equityRows.map((q) => (
                <TickerRow
                  key={q.symbol}
                  q={q}
                  index={flatList.indexOf(q)}
                  refreshKey={refreshKey}
                  onTickerClick={onTickerClick}
                  weekPct={weekMap[q.symbol] ?? null}
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
                weekPct={weekMap[q.symbol] ?? null}
              />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
