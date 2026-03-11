import { useState, useEffect, useRef } from 'react';

// ─── localStorage cache ───────────────────────────────────────────────────────
const LS_KEY = 'eco-calendar-v3';
function readCache()  { try { return JSON.parse(localStorage.getItem(LS_KEY)); } catch { return null; } }
function writeCache(p){ try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* quota */ } }

// ─── Series metadata ──────────────────────────────────────────────────────────
// displayUnit: 'pct' = percentage, 'idx' = index level, 'rawK' = raw/1000, 'raw' = as-is
const SERIES = {
  CPIAUCSL:        { label: 'CPI',                  displayUnit: 'idx',  higherBetter: false },
  CPILFESL:        { label: 'Core CPI',             displayUnit: 'idx',  higherBetter: false },
  PPIACO:          { label: 'PPI',                  displayUnit: 'idx',  higherBetter: false },
  PCEPI:           { label: 'PCE',                  displayUnit: 'idx',  higherBetter: false },
  PCEPILFE:        { label: 'Core PCE',             displayUnit: 'idx',  higherBetter: false },
  PAYEMS:          { label: 'Non-Farm Payrolls',    displayUnit: 'rawK', higherBetter: true  },
  UNRATE:          { label: 'Unemployment Rate',    displayUnit: 'pct',  higherBetter: false },
  ICSA:            { label: 'Jobless Claims',       displayUnit: 'rawK', higherBetter: false },
  GDPC1:           { label: 'Real GDP',             displayUnit: 'raw',  higherBetter: true  },
  MANEMP:          { label: 'ISM Manufacturing',    displayUnit: 'raw',  higherBetter: true  },
  NMFCI:           { label: 'ISM Services',         displayUnit: 'raw',  higherBetter: true  },
  RSAFS:           { label: 'Retail Sales',         displayUnit: 'rawK', higherBetter: true  },
  INDPRO:          { label: 'Industrial Production',displayUnit: 'idx',  higherBetter: true  },
  HOUST:           { label: 'Housing Starts',       displayUnit: 'rawK', higherBetter: true  },
  EXHOSLUSM495S:   { label: 'Existing Home Sales',  displayUnit: 'rawK', higherBetter: true  },
  UMCSENT:         { label: 'Consumer Confidence',  displayUnit: 'idx',  higherBetter: true  },
  JTSJOL:          { label: 'JOLTS Job Openings',   displayUnit: 'rawK', higherBetter: true  },
  FEDFUNDS:        { label: 'FOMC Rate Decision',   displayUnit: 'pct',  higherBetter: null  },
  // Treasury rates — fetched separately for the rate pills, not in RELEASE_SCHEDULE
  DGS10:           { label: '10-Year Treasury',     displayUnit: 'pct',  higherBetter: null  },
  DGS2:            { label: '2-Year Treasury',      displayUnit: 'pct',  higherBetter: null  },
  T10Y2Y:          { label: '10-2 Spread',          displayUnit: 'pct',  higherBetter: null  },
};

// ─── Release schedule Mar–Jun 2026 ───────────────────────────────────────────
// { date: 'YYYY-MM-DD', seriesId: string, timeET: string }
// Note: Philly Fed (PHIL) not in FRED as a simple series — omitted.
const RELEASE_SCHEDULE = [
  // ════════════ MARCH 2026 ════════════
  { date: '2026-03-02', seriesId: 'MANEMP',        timeET: '10:00 AM' },
  { date: '2026-03-05', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-03-06', seriesId: 'PAYEMS',        timeET: '8:30 AM'  },
  { date: '2026-03-06', seriesId: 'UNRATE',        timeET: '8:30 AM'  },
  { date: '2026-03-11', seriesId: 'CPIAUCSL',      timeET: '8:30 AM'  },
  { date: '2026-03-11', seriesId: 'CPILFESL',      timeET: '8:30 AM'  },
  { date: '2026-03-11', seriesId: 'JTSJOL',        timeET: '10:00 AM' },
  { date: '2026-03-12', seriesId: 'PPIACO',        timeET: '8:30 AM'  },
  { date: '2026-03-12', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-03-17', seriesId: 'RSAFS',         timeET: '8:30 AM'  },
  { date: '2026-03-17', seriesId: 'INDPRO',        timeET: '9:15 AM'  },
  { date: '2026-03-18', seriesId: 'HOUST',         timeET: '8:30 AM'  },
  { date: '2026-03-19', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-03-19', seriesId: 'FEDFUNDS',      timeET: '2:00 PM'  },
  { date: '2026-03-23', seriesId: 'EXHOSLUSM495S', timeET: '10:00 AM' },
  { date: '2026-03-26', seriesId: 'GDPC1',         timeET: '8:30 AM'  },
  { date: '2026-03-26', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-03-27', seriesId: 'PCEPI',         timeET: '8:30 AM'  },
  { date: '2026-03-27', seriesId: 'PCEPILFE',      timeET: '8:30 AM'  },
  { date: '2026-03-31', seriesId: 'UMCSENT',       timeET: '10:00 AM' },

  // ════════════ APRIL 2026 ════════════
  { date: '2026-04-01', seriesId: 'MANEMP',        timeET: '10:00 AM' },
  { date: '2026-04-02', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-04-03', seriesId: 'PAYEMS',        timeET: '8:30 AM'  },
  { date: '2026-04-03', seriesId: 'UNRATE',        timeET: '8:30 AM'  },
  { date: '2026-04-07', seriesId: 'JTSJOL',        timeET: '10:00 AM' },
  { date: '2026-04-09', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-04-10', seriesId: 'CPIAUCSL',      timeET: '8:30 AM'  },
  { date: '2026-04-10', seriesId: 'CPILFESL',      timeET: '8:30 AM'  },
  { date: '2026-04-11', seriesId: 'PPIACO',        timeET: '8:30 AM'  },
  { date: '2026-04-15', seriesId: 'RSAFS',         timeET: '8:30 AM'  },
  { date: '2026-04-15', seriesId: 'INDPRO',        timeET: '9:15 AM'  },
  { date: '2026-04-16', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-04-16', seriesId: 'HOUST',         timeET: '8:30 AM'  },
  { date: '2026-04-22', seriesId: 'EXHOSLUSM495S', timeET: '10:00 AM' },
  { date: '2026-04-23', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-04-28', seriesId: 'UMCSENT',       timeET: '10:00 AM' },
  { date: '2026-04-29', seriesId: 'GDPC1',         timeET: '8:30 AM'  },
  { date: '2026-04-29', seriesId: 'FEDFUNDS',      timeET: '2:00 PM'  },
  { date: '2026-04-30', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-04-30', seriesId: 'PCEPI',         timeET: '8:30 AM'  },
  { date: '2026-04-30', seriesId: 'PCEPILFE',      timeET: '8:30 AM'  },

  // ════════════ MAY 2026 ════════════
  { date: '2026-05-01', seriesId: 'MANEMP',        timeET: '10:00 AM' },
  { date: '2026-05-06', seriesId: 'JTSJOL',        timeET: '10:00 AM' },
  { date: '2026-05-07', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-05-07', seriesId: 'FEDFUNDS',      timeET: '2:00 PM'  },
  { date: '2026-05-08', seriesId: 'PAYEMS',        timeET: '8:30 AM'  },
  { date: '2026-05-08', seriesId: 'UNRATE',        timeET: '8:30 AM'  },
  { date: '2026-05-13', seriesId: 'CPIAUCSL',      timeET: '8:30 AM'  },
  { date: '2026-05-13', seriesId: 'CPILFESL',      timeET: '8:30 AM'  },
  { date: '2026-05-14', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-05-14', seriesId: 'PPIACO',        timeET: '8:30 AM'  },
  { date: '2026-05-15', seriesId: 'RSAFS',         timeET: '8:30 AM'  },
  { date: '2026-05-15', seriesId: 'INDPRO',        timeET: '9:15 AM'  },
  { date: '2026-05-19', seriesId: 'HOUST',         timeET: '8:30 AM'  },
  { date: '2026-05-21', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-05-21', seriesId: 'EXHOSLUSM495S', timeET: '10:00 AM' },
  { date: '2026-05-26', seriesId: 'UMCSENT',       timeET: '10:00 AM' },
  { date: '2026-05-28', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-05-28', seriesId: 'GDPC1',         timeET: '8:30 AM'  },
  { date: '2026-05-29', seriesId: 'PCEPI',         timeET: '8:30 AM'  },
  { date: '2026-05-29', seriesId: 'PCEPILFE',      timeET: '8:30 AM'  },

  // ════════════ JUNE 2026 ════════════
  { date: '2026-06-01', seriesId: 'MANEMP',        timeET: '10:00 AM' },
  { date: '2026-06-03', seriesId: 'JTSJOL',        timeET: '10:00 AM' },
  { date: '2026-06-04', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-06-05', seriesId: 'PAYEMS',        timeET: '8:30 AM'  },
  { date: '2026-06-05', seriesId: 'UNRATE',        timeET: '8:30 AM'  },
  { date: '2026-06-10', seriesId: 'CPIAUCSL',      timeET: '8:30 AM'  },
  { date: '2026-06-10', seriesId: 'CPILFESL',      timeET: '8:30 AM'  },
  { date: '2026-06-11', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-06-11', seriesId: 'PPIACO',        timeET: '8:30 AM'  },
  { date: '2026-06-16', seriesId: 'RSAFS',         timeET: '8:30 AM'  },
  { date: '2026-06-16', seriesId: 'INDPRO',        timeET: '9:15 AM'  },
  { date: '2026-06-17', seriesId: 'HOUST',         timeET: '8:30 AM'  },
  { date: '2026-06-18', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-06-18', seriesId: 'FEDFUNDS',      timeET: '2:00 PM'  },
  { date: '2026-06-22', seriesId: 'EXHOSLUSM495S', timeET: '10:00 AM' },
  { date: '2026-06-25', seriesId: 'ICSA',          timeET: '8:30 AM'  },
  { date: '2026-06-25', seriesId: 'GDPC1',         timeET: '8:30 AM'  },
  { date: '2026-06-26', seriesId: 'PCEPI',         timeET: '8:30 AM'  },
  { date: '2026-06-26', seriesId: 'PCEPILFE',      timeET: '8:30 AM'  },
  { date: '2026-06-30', seriesId: 'UMCSENT',       timeET: '10:00 AM' },
];

// Treasury series — shown as always-visible pills, not in event rows
const TREASURY_IDS = ['DGS10', 'DGS2', 'T10Y2Y'];

// All series IDs that need FRED observations fetched
const ALL_SERIES_IDS = [
  ...new Set(RELEASE_SCHEDULE.map((e) => e.seriesId)),
  ...TREASURY_IDS,
];

// ─── Window helpers ───────────────────────────────────────────────────────────
function getWindowDates() {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const weekend = dow === 0 || dow === 6;

  let windowStart, windowEnd;

  if (weekend) {
    // Show the upcoming Mon–Sun week; no past dates on weekends
    const daysToMon = dow === 0 ? 1 : 2; // Sun→1, Sat→2
    const mon = new Date(now);
    mon.setDate(now.getDate() + daysToMon);
    mon.setHours(0, 0, 0, 0);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    windowStart = mon.toISOString().slice(0, 10);
    windowEnd   = sun.toISOString().slice(0, 10);
  } else {
    // Weekdays: this Mon → next Sun (14 days)
    const daysBackToMon = dow - 1;
    const mon = new Date(now);
    mon.setDate(now.getDate() - daysBackToMon);
    mon.setHours(0, 0, 0, 0);
    const nextSun = new Date(mon);
    nextSun.setDate(mon.getDate() + 13);
    windowStart = mon.toISOString().slice(0, 10);
    windowEnd   = nextSun.toISOString().slice(0, 10);
  }

  console.log('[EcoCalendar] window:', windowStart, '→', windowEnd, '(dow:', dow, weekend ? 'weekend)' : 'weekday)');
  return { windowStart, windowEnd };
}

function getEventsInWindow() {
  const { windowStart, windowEnd } = getWindowDates();
  return RELEASE_SCHEDULE
    .filter((e) => e.date >= windowStart && e.date <= windowEnd)
    .sort((a, b) => a.date.localeCompare(b.date) || a.timeET.localeCompare(b.timeET));
}

// ─── FRED data fetch ──────────────────────────────────────────────────────────
async function fetchFredData() {
  let obsMap   = {};
  let cachedAt = null;

  // Try Redis-backed bulk endpoint first
  try {
    const res = await fetch('/api/fred');
    if (res.ok) {
      const data = await res.json();
      console.log('[EcoCalendar] /api/fred keys:', Object.keys(data));
      if (data.obsMap) {
        obsMap   = data.obsMap;
        cachedAt = data.cachedAt ?? null;
        console.log('[EcoCalendar] obsMap count:', Object.keys(obsMap).length,
          '| sample:', JSON.stringify(Object.entries(obsMap).slice(0, 3)));
        return { obsMap, cachedAt };
      }
      console.warn('[EcoCalendar] no obsMap in response — falling back to serial');
    } else {
      console.warn('[EcoCalendar] /api/fred status:', res.status, '— falling back');
    }
  } catch (e) {
    console.warn('[EcoCalendar] /api/fred error:', e.message, '— falling back');
  }

  // Serial per-series fallback (local dev Vite proxy)
  console.log('[EcoCalendar] serial fetch for', ALL_SERIES_IDS.length, 'series');
  await Promise.all(ALL_SERIES_IDS.map(async (id) => {
    try {
      const res  = await fetch(`/api/fred?seriesId=${encodeURIComponent(id)}`);
      if (!res.ok) { console.warn('[EcoCalendar]', id, 'HTTP', res.status); return; }
      const data = await res.json();
      const obs  = (data.observations ?? []).filter((o) => o.value !== '.' && o.value !== '');
      obsMap[id] = {
        actual: obs[0] ? parseFloat(obs[0].value) : null,
        prior:  obs[1] ? parseFloat(obs[1].value) : null,
      };
      if (!cachedAt && data.cachedAt) cachedAt = data.cachedAt;
    } catch (e) {
      console.warn('[EcoCalendar] series', id, 'error:', e.message);
    }
  }));

  console.log('[EcoCalendar] serial complete. obsMap:', JSON.stringify(obsMap));
  return { obsMap, cachedAt: cachedAt ?? new Date().toISOString() };
}

// ─── Formatting ───────────────────────────────────────────────────────────────
function formatVal(val, unit) {
  if (val === null || val === undefined) return '—';
  switch (unit) {
    case 'pct':  return `${val.toFixed(2)}%`;
    case 'rawK': return `${(val / 1000).toFixed(1)}K`;
    case 'idx':  return val >= 100 ? val.toFixed(1) : val.toFixed(2);
    default:     return val.toFixed(2);
  }
}

function fmtDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

function fmtUpdated(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const n = new Date();
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? t : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + t;
}

const todayStr  = () => new Date().toISOString().slice(0, 10);
const isWeekend = () => { const d = new Date().getDay(); return d === 0 || d === 6; };
const ECO_REFRESH_MS  = 60 * 60 * 1000;
const FORECAST_TIP    = 'Forecast data not available from FRED — check Bloomberg or Investing.com for consensus.';

// ─── Treasury rate pills ──────────────────────────────────────────────────────
function RatePill({ label, value, unit = 'pct', color }) {
  const fmt = value != null ? formatVal(value, unit) : '—';
  return (
    <div className="eco-rate-pill" style={{ borderColor: color }}>
      <span className="eco-rate-label">{label}</span>
      <span className="eco-rate-value" style={{ color }}>{fmt}</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function EconomicCalendar() {
  const [obsMap,    setObsMap]    = useState(() => readCache()?.obsMap    ?? {});
  const [fetchedAt, setFetchedAt] = useState(() => readCache()?.fetchedAt ?? null);
  const [loading,   setLoading]   = useState(!readCache());
  const [error,     setError]     = useState(null);
  const fetchingRef = useRef(false);

  useEffect(() => {
    async function load() {
      if (fetchingRef.current) return;

      const cached = readCache();

      if (isWeekend() && cached?.obsMap && Object.keys(cached.obsMap).length > 0) {
        console.log('[EcoCalendar] weekend — cached obsMap count:', Object.keys(cached.obsMap).length);
        setObsMap(cached.obsMap);
        setFetchedAt(cached.fetchedAt);
        setLoading(false);
        return;
      }

      fetchingRef.current = true;
      try {
        const result = await fetchFredData();
        if (Object.keys(result.obsMap).length > 0) {
          writeCache(result);
          setObsMap(result.obsMap);
          setFetchedAt(result.cachedAt);
        } else if (cached?.obsMap) {
          setObsMap(cached.obsMap);
          setFetchedAt(cached.fetchedAt);
        }
      } catch (err) {
        if (cached?.obsMap) { setObsMap(cached.obsMap); setFetchedAt(cached.fetchedAt); }
        else setError('Unable to load calendar data');
        console.error('[EcoCalendar] load error:', err);
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

  if (loading && !Object.keys(obsMap).length)
    return <div className="eco-loading">LOADING CALENDAR…</div>;
  if (error && !Object.keys(obsMap).length)
    return <div className="eco-error">{error}</div>;

  const today      = todayStr();
  const weekend    = isWeekend();
  const windowEvts = getEventsInWindow();

  // Group by date
  const grouped = {};
  for (const e of windowEvts) {
    if (!grouped[e.date]) grouped[e.date] = [];
    grouped[e.date].push(e);
  }

  // Treasury rate values
  const rate10y  = obsMap['DGS10']?.actual;
  const rate2y   = obsMap['DGS2']?.actual;
  const spread   = obsMap['T10Y2Y']?.actual;

  // Spread color: positive = cyan (normal), negative = magenta (inverted)
  const spreadColor = spread == null ? 'var(--text-dim)'
    : spread >= 0 ? 'var(--cyan)' : 'var(--magenta)';

  return (
    <div className="eco-wrapper">
      {/* ── Freshness banner ── */}
      <div className="eco-freshness">
        <span className={weekend ? 'eco-stale' : 'eco-fresh'}>
          {fmtUpdated(fetchedAt) ? `LAST UPDATED: ${fmtUpdated(fetchedAt)}` : 'LOADING…'}
          {weekend ? ' · WEEKEND — PRIOR VALUES ONLY' : ''}
        </span>
      </div>

      {/* ── Treasury rate pills ── */}
      <div className="eco-rates">
        <RatePill label="10Y"    value={rate10y} color="var(--cyan)"    />
        <RatePill label="2Y"     value={rate2y}  color="var(--text-dim)" />
        <RatePill label="10-2 SPREAD" value={spread}  color={spreadColor} />
      </div>

      {/* ── Event table ── */}
      <table className="eco-table">
        <thead>
          <tr>
            <th className="eco-th-date">Date</th>
            <th className="eco-th-time">Time (ET)</th>
            <th className="eco-th-event">Event</th>
            <th className="eco-th-val">Actual</th>
            <th className="eco-th-val" title={FORECAST_TIP}>Fcst ⓘ</th>
            <th className="eco-th-val">Prior</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([date, evts]) => {
            const isToday  = date === today;
            const isPast   = date < today;
            const isFuture = date > today;

            return evts.map((e, i) => {
              const meta = SERIES[e.seriesId] ?? { label: e.seriesId, displayUnit: 'raw', higherBetter: null };
              const obs  = obsMap[e.seriesId] ?? { actual: null, prior: null };

              const showActual = (isPast || isToday) && !weekend;
              const actual = showActual ? obs.actual : null;
              const prior  = obs.prior;

              const actualFmt = formatVal(actual, meta.displayUnit);
              const priorFmt  = formatVal(prior,  meta.displayUnit);

              let actualClass = '';
              if (actual !== null && prior !== null && meta.higherBetter !== null) {
                actualClass = (meta.higherBetter ? actual > prior : actual < prior)
                  ? 'eco-positive' : 'eco-negative';
              }

              const rowClass = [
                'eco-event-row',
                isToday  ? 'eco-row-today'  : '',
                isPast   ? 'eco-row-past'   : '',
                isFuture ? 'eco-row-future' : '',
              ].filter(Boolean).join(' ');

              return (
                <tr
                  key={`${date}-${e.seriesId}-${e.timeET}`}
                  className={rowClass}
                  onClick={() => window.open(`https://fred.stlouisfed.org/series/${e.seriesId}`, '_blank')}
                >
                  {i === 0 ? (
                    <td className="eco-cell-date" rowSpan={evts.length}>
                      <span className={`eco-date-badge${isToday ? ' eco-date-today' : ''}`}>
                        {fmtDate(date)}
                        {isToday && <span className="eco-today-pill">TODAY</span>}
                      </span>
                    </td>
                  ) : null}
                  <td className="eco-cell-time">{e.timeET}</td>
                  <td className="eco-cell-name">{meta.label}</td>
                  <td className={`eco-cell-val ${actualClass}`}>{actualFmt}</td>
                  <td className="eco-cell-val eco-cell-fcst" title={FORECAST_TIP}>—</td>
                  <td className="eco-cell-val eco-cell-prior">{priorFmt}</td>
                </tr>
              );
            });
          })}
          {windowEvts.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: '16px', textAlign: 'center', color: 'var(--text-dim)', fontSize: '11px', letterSpacing: '0.1em' }}>
                NO EVENTS IN CURRENT WINDOW
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
