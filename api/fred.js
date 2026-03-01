// Read endpoint: /api/fred
// Returns cached FRED data from Redis (key: fred_calendar).
// Accepts optional ?seriesId=XXX for single-series fallback (used by local dev proxy).
// If the cache is empty, triggers a one-time live fetch as a cold-start fallback.

import { redis } from './_redis.js';

const FRED_KEY  = process.env.VITE_FRED_API_KEY;
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

async function liveFetchAll() {
  const obsMap = {};
  await Promise.all(SERIES_IDS.map(async (id) => {
    try { obsMap[id] = await fetchSeries(id); }
    catch { obsMap[id] = { actual: null, prior: null }; }
  }));
  return obsMap;
}

export default async function handler(req, res) {
  try {
    let raw = await redis.get('fred_calendar');

    // Cold-start fallback: populate cache with a live fetch
    if (!raw) {
      const obsMap  = await liveFetchAll();
      const payload = { obsMap, cachedAt: new Date().toISOString() };
      await redis.set('fred_calendar', JSON.stringify(payload));
      raw = JSON.stringify(payload);
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;

    // Single-series compat: if ?seriesId is passed, return observations-style response
    // so the existing EconomicCalendar.fetchObservations() fallback still works in dev
    const { seriesId } = req.query ?? {};
    if (seriesId) {
      const entry = payload.obsMap?.[seriesId];
      if (entry) {
        // Wrap in the observations envelope the frontend expects when calling /api/fred directly
        return res.status(200).json({
          observations: [
            entry.actual != null ? { value: String(entry.actual) } : null,
            entry.prior  != null ? { value: String(entry.prior)  } : null,
          ].filter(Boolean),
          cachedAt: payload.cachedAt,
        });
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read FRED cache', detail: err.message });
  }
}
