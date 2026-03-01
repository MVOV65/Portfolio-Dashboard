import { useState, useEffect, useRef } from 'react';

// FRED data is fetched via /api/fred serverless proxy to avoid CORS.
const FORECAST_TOOLTIP = 'Forecast not available via free APIs — check Bloomberg or Investing.com for consensus estimates.';

// ─── localStorage cache ───────────────────────────────────────────────────────
// Persists across page refreshes. Keyed so stale data is always available,
// including on weekends (shows Friday's cached data).
const LS_KEY = 'eco-calendar-cache-v1';

function readCache() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(payload) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch { /* ignore quota errors */ }
}

// ─── Series definitions ───────────────────────────────────────────────────────
const SERIES = [
  { id: 'CPIAUCSL',  label: 'CPI',                displayUnit: 'raw',  higherBetter: false, releaseDay: 'mid'       },
  { id: 'CPILFESL',  label: 'Core CPI',            displayUnit: 'raw',  higherBetter: false, releaseDay: 'mid'       },
  { id: 'PPIACO',    label: 'PPI',                 displayUnit: 'raw',  higherBetter: false, releaseDay: 'mid'       },
  { id: 'PCEPI',     label: 'PCE',                 displayUnit: 'raw',  higherBetter: false, releaseDay: 'end'       },
  { id: 'PCEPILFE',  label: 'Core PCE',            displayUnit: 'raw',  higherBetter: false, releaseDay: 'end'       },
  { id: 'PAYEMS',    label: 'Non-Farm Payrolls',   displayUnit: 'rawK', higherBetter: true,  releaseDay: 'first-fri' },
  { id: 'UNRATE',    label: 'Unemployment Rate',   displayUnit: 'raw',  higherBetter: false, releaseDay: 'first-fri' },
  { id: 'GDP',       label: 'GDP',                 displayUnit: 'raw',  higherBetter: true,  releaseDay: 'end'       },
  { id: 'RSAFS',     label: 'Retail Sales',        displayUnit: 'rawK', higherBetter: true,  releaseDay: 'mid'       },
  { id: 'MANEMP',    label: 'Mfg Employment',      displayUnit: 'rawK', higherBetter: true,  releaseDay: 'first'     },
  { id: 'UMCSENT',   label: 'Consumer Sentiment',  displayUnit: 'raw',  higherBetter: true,  releaseDay: 'mid'       },
  { id: 'FEDFUNDS',  label: 'Fed Funds Rate',      displayUnit: 'raw',  higherBetter: null,  releaseDay: 'fomc'      },
];

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getFirstDayOfWeek(year, month, dow) {
  const d = new Date(year, month, 1);
  const diff = (dow - d.getDay() + 7) % 7;
  return new Date(year, month, 1 + diff);
}

function getFirstBusinessDay(year, month) {
  const d = new Date(year, month, 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return new Date(d);
}

function getNearestBizDay(d) {
  const dt = new Date(d);
  while (dt.getDay() === 0 || dt.getDay() === 6) dt.setDate(dt.getDate() + 1);
  return dt;
}

const FOMC_DATES = [
  '2025-01-29','2025-03-19','2025-05-07','2025-06-18',
  '2025-07-30','2025-09-17','2025-10-29','2025-12-10',
  '2026-01-28','2026-03-18','2026-04-29','2026-06-17',
  '2026-07-29','2026-09-16','2026-10-28','2026-12-09',
];

function getFOMCDate(year, month) {
  const match = FOMC_DATES.find((d) => {
    const dt = new Date(d);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });
  return match ? new Date(match) : null;
}

function getApproxReleaseDates() {
  const now = new Date();
  const cutoffPast   = new Date(now); cutoffPast.setDate(now.getDate() - 7);
  const cutoffFuture = new Date(now); cutoffFuture.setDate(now.getDate() + 21);
  const events = [];

  for (let mo = 0; mo <= 2; mo++) {
    const base  = new Date(now.getFullYear(), now.getMonth() + mo, 1);
    const year  = base.getFullYear();
    const month = base.getMonth();

    const dateMap = {
      'first-fri': getFirstDayOfWeek(year, month, 5),
      'first':     getFirstBusinessDay(year, month),
      'mid':       getNearestBizDay(new Date(year, month, 14)),
      'end':       getNearestBizDay(new Date(year, month, 26)),
      'fomc':      getFOMCDate(year, month),
    };

    for (const s of SERIES) {
      const releaseDate = dateMap[s.releaseDay];
      if (!releaseDate) continue;
      if (releaseDate >= cutoffPast && releaseDate <= cutoffFuture) {
        events.push({
          date:    releaseDate,
          dateStr: releaseDate.toISOString().slice(0, 10),
          series:  s,
          actual:  null,
          prior:   null,
        });
      }
    }
  }

  const seen = new Set();
  return events
    .filter((e) => {
      const key = `${e.dateStr}-${e.series.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date - b.date);
}

// ─── FRED fetching ────────────────────────────────────────────────────────────
// Reads the entire obsMap from the Redis-backed /api/fred endpoint in one call.
// Falls back to per-series requests (local dev proxy) if the bulk response has no obsMap.
async function runFetch() {
  const base = getApproxReleaseDates();
  let obsMap     = {};
  let cachedAt   = null;

  try {
    const res = await fetch('/api/fred');
    if (res.ok) {
      const data = await res.json();
      if (data.obsMap) {
        // Production: bulk response from Redis cache
        obsMap   = data.obsMap;
        cachedAt = data.cachedAt ?? null;
      } else {
        // Local dev: Vite proxy returns per-series FRED response — fall back to serial fetching
        throw new Error('no obsMap — falling back to serial fetch');
      }
    }
  } catch {
    // Serial per-series fallback (local dev or cold-start before cron runs)
    const uniqueIds = [...new Set(base.map((e) => e.series.id))];
    await Promise.all(uniqueIds.map(async (id) => {
      try {
        const res  = await fetch(`/api/fred?seriesId=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const data = await res.json();
        const obs  = (data.observations || []).filter((o) => o.value !== '.' && o.value !== '');
        obsMap[id] = {
          actual: obs[0] ? parseFloat(obs[0].value) : null,
          prior:  obs[1] ? parseFloat(obs[1].value) : null,
        };
        if (!cachedAt && data.cachedAt) cachedAt = data.cachedAt;
      } catch { /* leave entry null */ }
    }));
    if (!cachedAt) cachedAt = new Date().toISOString();
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const enriched = base.map((e) => {
    const obs = obsMap[e.series.id] ?? { actual: null, prior: null };
    return {
      ...e,
      actual: e.dateStr <= todayStr ? obs.actual : null,
      prior:  obs.prior,
    };
  });

  return { events: enriched, fetchedAt: cachedAt };
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function formatValue(val, displayUnit) {
  if (val === null || val === undefined) return '—';
  if (displayUnit === 'rawK') return `${(val / 1000).toFixed(1)}K`;
  if (Math.abs(val) >= 100) return val.toFixed(1);
  return val.toFixed(2);
}

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function formatCachedAt(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth()    === today.getMonth()    &&
    d.getDate()     === today.getDate();

  if (isToday) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const isToday  = (d) => d === todayStr();
const isPast   = (d) => d <  todayStr();
const isWeekend = () => { const d = new Date().getDay(); return d === 0 || d === 6; };

const ECO_REFRESH_MS = 60 * 60 * 1000; // 1 hour

// ─── Component ────────────────────────────────────────────────────────────────
export default function EconomicCalendar() {
  // Initialise immediately from localStorage so panel is never blank on load
  const [events,   setEvents]   = useState(() => readCache()?.events ?? []);
  const [fetchedAt, setFetchedAt] = useState(() => readCache()?.fetchedAt ?? null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    async function load() {
      if (fetchingRef.current) return;

      // On weekends: surface whatever is cached and skip live fetch
      if (isWeekend()) {
        const cached = readCache();
        if (cached?.events?.length > 0) {
          setEvents(cached.events);
          setFetchedAt(cached.fetchedAt ?? null);
        }
        setLoading(false);
        return;
      }

      fetchingRef.current = true;
      try {
        const result = await runFetch();

        // Never replace good cached data with an empty result
        if (result.events.length > 0) {
          const payload = { events: result.events, fetchedAt: result.fetchedAt };
          writeCache(payload);
          setEvents(result.events);
          setFetchedAt(result.fetchedAt);
        } else {
          // Live fetch returned nothing — fall back to cache
          const cached = readCache();
          if (cached?.events?.length > 0) {
            setEvents(cached.events);
            setFetchedAt(cached.fetchedAt ?? null);
          }
        }
      } catch (err) {
        // On error, surface cache rather than going blank
        const cached = readCache();
        if (cached?.events?.length > 0) {
          setEvents(cached.events);
          setFetchedAt(cached.fetchedAt ?? null);
        } else {
          setError('Unable to load calendar data');
          console.error(err);
        }
      } finally {
        fetchingRef.current = false;
        setLoading(false);
      }
    }

    load();
    const iv = setInterval(load, ECO_REFRESH_MS);
    return () => clearInterval(iv);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show loading only if we have no data at all yet
  if (loading && events.length === 0) return <div className="eco-loading">LOADING CALENDAR…</div>;
  if (error && events.length === 0)   return <div className="eco-error">{error}</div>;

  const grouped = {};
  for (const e of events) {
    if (!grouped[e.dateStr]) grouped[e.dateStr] = [];
    grouped[e.dateStr].push(e);
  }

  const cachedLabel = formatCachedAt(fetchedAt);
  const isStale = isWeekend() && fetchedAt;

  return (
    <div className="eco-wrapper">
      {/* Data freshness banner */}
      <div className="eco-freshness">
        {cachedLabel
          ? <span className={isStale ? 'eco-stale' : 'eco-fresh'}>
              {isStale ? '📅 ' : ''}LAST UPDATED: {cachedLabel}
              {isStale ? ' (WEEKEND — SHOWING PRIOR DATA)' : ''}
            </span>
          : <span className="eco-fresh">LIVE</span>
        }
      </div>

      <table className="eco-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Actual</th>
            <th title={FORECAST_TOOLTIP}>Fcst ⓘ</th>
            <th>Prior</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([dateStr, evts]) => (
            <>
              <tr key={`hdr-${dateStr}`} className={`eco-date-row${isToday(dateStr) ? ' eco-today' : ''}`}>
                <td colSpan={4}>
                  {formatDate(dateStr)}{isToday(dateStr) ? '  ◀ TODAY' : ''}
                </td>
              </tr>

              {evts.map((e) => {
                const actualFmt = formatValue(e.actual, e.series.displayUnit);
                const priorFmt  = formatValue(e.prior,  e.series.displayUnit);

                let actualClass = '';
                if (e.actual !== null && e.prior !== null && e.series.higherBetter !== null) {
                  actualClass = (e.series.higherBetter ? e.actual > e.prior : e.actual < e.prior)
                    ? 'eco-positive' : 'eco-negative';
                }

                return (
                  <tr
                    key={`${dateStr}-${e.series.id}`}
                    className={`eco-event-row${isPast(dateStr) ? ' eco-past' : ''}`}
                    onClick={() => window.open(`https://fred.stlouisfed.org/series/${e.series.id}`, '_blank')}
                  >
                    <td className="eco-name">{e.series.label}</td>
                    <td className={`eco-val ${actualClass}`}>{actualFmt}</td>
                    <td className="eco-val eco-forecast" title={FORECAST_TOOLTIP}>—</td>
                    <td className="eco-val eco-prior">{priorFmt}</td>
                  </tr>
                );
              })}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
