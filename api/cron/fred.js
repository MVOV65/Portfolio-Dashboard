// Cron: every hour on weekdays  (schedule: "0 * * * 1-5")
// Fetches the last 3 observations for each high-impact FRED series,
// then stores the full observation map in Redis under "fred_calendar".
// The weekday-only constraint is enforced by the cron schedule (1-5 = Mon-Fri).

import { redis } from '../_redis.js';

const FRED_KEY = process.env.VITE_FRED_API_KEY;
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

const SERIES_IDS = [
  'CPIAUCSL','CPILFESL','PPIACO','PCEPI','PCEPILFE',
  'PAYEMS','UNRATE','GDP','RSAFS','MANEMP','UMCSENT','FEDFUNDS',
];

async function fetchSeries(seriesId) {
  const url =
    `${FRED_BASE}?series_id=${encodeURIComponent(seriesId)}` +
    `&api_key=${FRED_KEY}&file_type=json&sort_order=desc&limit=3`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`FRED ${seriesId} HTTP ${res.status}`);
  const data = await res.json();
  const obs = (data.observations ?? []).filter((o) => o.value !== '.' && o.value !== '');
  return {
    actual: obs[0] ? parseFloat(obs[0].value) : null,
    prior:  obs[1] ? parseFloat(obs[1].value) : null,
  };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const obsMap = {};

    // Fetch all series in parallel
    await Promise.all(SERIES_IDS.map(async (id) => {
      try {
        obsMap[id] = await fetchSeries(id);
      } catch (err) {
        console.error(`Skipping ${id}:`, err.message);
        obsMap[id] = { actual: null, prior: null };
      }
    }));

    const payload = { obsMap, cachedAt: new Date().toISOString() };
    await redis.set('fred_calendar', JSON.stringify(payload));

    return res.status(200).json({ ok: true, series: Object.keys(obsMap).length });
  } catch (err) {
    console.error('fred cron error:', err);
    return res.status(500).json({ error: err.message });
  }
}
