import { useState, useEffect } from 'react';

const FRED_KEY = import.meta.env.VITE_FRED_API_KEY;
const FRED_BASE = 'https://api.stlouisfed.org/fred';

// High-impact series: id, label, FRED page, and whether higher = better
const SERIES = [
  { id: 'CPIAUCSL',  label: 'CPI',                unit: '%',   higherBetter: false, releaseDay: 'mid' },
  { id: 'CPILFESL',  label: 'Core CPI',            unit: '%',   higherBetter: false, releaseDay: 'mid' },
  { id: 'PPIACO',    label: 'PPI',                 unit: '%',   higherBetter: false, releaseDay: 'mid' },
  { id: 'PCEPI',     label: 'PCE',                 unit: '%',   higherBetter: false, releaseDay: 'end' },
  { id: 'PCEPILFE',  label: 'Core PCE',            unit: '%',   higherBetter: false, releaseDay: 'end' },
  { id: 'PAYEMS',    label: 'Non-Farm Payrolls',   unit: 'K',   higherBetter: true,  releaseDay: 'first-fri' },
  { id: 'UNRATE',    label: 'Unemployment Rate',   unit: '%',   higherBetter: false, releaseDay: 'first-fri' },
  { id: 'GDP',       label: 'GDP',                 unit: '%',   higherBetter: true,  releaseDay: 'end' },
  { id: 'RSAFS',     label: 'Retail Sales',        unit: '%',   higherBetter: true,  releaseDay: 'mid' },
  { id: 'MANEMP',    label: 'ISM Manufacturing',   unit: '',    higherBetter: true,  releaseDay: 'first' },
  { id: 'UMCSENT',   label: 'Consumer Confidence', unit: '',    higherBetter: true,  releaseDay: 'mid' },
  { id: 'FEDFUNDS',  label: 'Federal Funds Rate',  unit: '%',   higherBetter: null,  releaseDay: 'fomc' },
];

// Generate approximate release dates for current + next 2 weeks
function getApproxReleaseDates() {
  const today = new Date();
  const events = [];

  // Look at current month and next 2 months to cover 3-week window
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const base = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    const year = base.getFullYear();
    const month = base.getMonth();

    // First Friday of month
    const firstFri = getFirstDayOfWeek(year, month, 5);
    // First business day
    const firstBiz = getFirstBusinessDay(year, month);
    // Mid-month (around 13th–15th, adjusted to business day)
    const midMonth = getNearestBizDay(new Date(year, month, 14));
    // End of month (last week, ~28th adjusted)
    const endMonth = getNearestBizDay(new Date(year, month, 26));
    // FOMC (approximate: every 6-7 weeks — we'll use a known 2025 schedule approximation)
    const fomcDate = getFOMCDate(year, month);

    for (const s of SERIES) {
      let releaseDate;
      if (s.releaseDay === 'first-fri') releaseDate = firstFri;
      else if (s.releaseDay === 'first')    releaseDate = firstBiz;
      else if (s.releaseDay === 'mid')      releaseDate = midMonth;
      else if (s.releaseDay === 'end')      releaseDate = endMonth;
      else if (s.releaseDay === 'fomc')     releaseDate = fomcDate;

      if (!releaseDate) continue;

      // Only include events within today - 7 days to today + 21 days
      const cutoffPast   = new Date(today); cutoffPast.setDate(today.getDate() - 7);
      const cutoffFuture = new Date(today); cutoffFuture.setDate(today.getDate() + 21);

      if (releaseDate >= cutoffPast && releaseDate <= cutoffFuture) {
        events.push({
          date: releaseDate,
          dateStr: releaseDate.toISOString().slice(0, 10),
          series: s,
          actual: null,
          prior: null,
        });
      }
    }
  }

  // Deduplicate by date+series, sort by date
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

function getFirstDayOfWeek(year, month, dow) {
  // dow: 0=Sun, 1=Mon ... 5=Fri
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

// Approximate FOMC meeting end dates (second day of meeting)
const FOMC_DATES_2025 = [
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18',
  '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
];
const FOMC_DATES_2026 = [
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17',
  '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09',
];

function getFOMCDate(year, month) {
  const all = [...FOMC_DATES_2025, ...FOMC_DATES_2026];
  const match = all.find((d) => {
    const dt = new Date(d);
    return dt.getFullYear() === year && dt.getMonth() === month;
  });
  return match ? new Date(match) : null;
}

async function fetchLatestObservations(seriesId) {
  const url = `${FRED_BASE}/series/observations?series_id=${seriesId}&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=2`;
  const res = await fetch(url);
  if (!res.ok) return { actual: null, prior: null };
  const data = await res.json();
  const obs = (data.observations || []).filter((o) => o.value !== '.');
  return {
    actual: obs[0] ? parseFloat(obs[0].value) : null,
    prior:  obs[1] ? parseFloat(obs[1].value) : null,
  };
}

function formatValue(val, unit) {
  if (val === null || val === undefined) return '—';
  if (unit === 'K') return `${(val / 1000).toFixed(1)}K`;
  if (unit === '%') return `${val.toFixed(2)}%`;
  return val.toFixed(2);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function isToday(dateStr) {
  return dateStr === new Date().toISOString().slice(0, 10);
}

function isPast(dateStr) {
  return dateStr < new Date().toISOString().slice(0, 10);
}

export default function EconomicCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!FRED_KEY) {
      setError('VITE_FRED_API_KEY not set in .env');
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const base = getApproxReleaseDates();

        // Fetch actual + prior for each unique series
        const uniqueIds = [...new Set(base.map((e) => e.series.id))];
        const obsMap = {};
        await Promise.all(
          uniqueIds.map(async (id) => {
            obsMap[id] = await fetchLatestObservations(id);
          })
        );

        const enriched = base.map((e) => ({
          ...e,
          actual: isPast(e.dateStr) || isToday(e.dateStr) ? obsMap[e.series.id]?.actual ?? null : null,
          prior:  obsMap[e.series.id]?.prior ?? null,
        }));

        setEvents(enriched);
      } catch (err) {
        setError('Failed to load calendar data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return <div className="eco-loading">LOADING CALENDAR…</div>;
  }

  if (error) {
    return <div className="eco-error">{error}</div>;
  }

  // Group by date
  const grouped = {};
  for (const e of events) {
    if (!grouped[e.dateStr]) grouped[e.dateStr] = [];
    grouped[e.dateStr].push(e);
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="eco-wrapper">
      <table className="eco-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Actual</th>
            <th>Prior</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([dateStr, evts]) => (
            <>
              <tr key={`date-${dateStr}`} className={`eco-date-row ${dateStr === today ? 'eco-today' : ''}`}>
                <td colSpan={3}>{formatDate(dateStr)}{dateStr === today ? '  ◀ TODAY' : ''}</td>
              </tr>
              {evts.map((e) => {
                const actualFmt = formatValue(e.actual, e.series.unit);
                const priorFmt  = formatValue(e.prior,  e.series.unit);
                let actualClass = '';
                if (e.actual !== null && e.prior !== null && e.series.higherBetter !== null) {
                  if (e.series.higherBetter) {
                    actualClass = e.actual > e.prior ? 'eco-positive' : 'eco-negative';
                  } else {
                    actualClass = e.actual < e.prior ? 'eco-positive' : 'eco-negative';
                  }
                }
                const href = `https://fred.stlouisfed.org/series/${e.series.id}`;
                return (
                  <tr
                    key={`${dateStr}-${e.series.id}`}
                    className={`eco-event-row ${isPast(dateStr) ? 'eco-past' : ''}`}
                    onClick={() => window.open(href, '_blank')}
                    title={`Open ${e.series.label} on FRED`}
                  >
                    <td className="eco-name">{e.series.label}</td>
                    <td className={`eco-val ${actualClass}`}>{actualFmt}</td>
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
