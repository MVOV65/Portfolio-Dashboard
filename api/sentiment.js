// Read endpoint: /api/sentiment
// Returns cached CNN Fear & Greed data from Redis (key: fear_greed).
// If the cache is empty, triggers a one-time live fetch as a cold-start fallback.

import { redis } from './_redis.js';

async function liveFetch() {
  const upstream = await fetch(
    'https://production.dataviz.cnn.io/index/fearandgreed/graphdata',
    {
      headers: {
        Accept:       'application/json',
        'User-Agent': 'Mozilla/5.0',
        Referer:      'https://www.cnn.com/',
      },
    }
  );
  if (!upstream.ok) throw new Error(`CNN API returned HTTP ${upstream.status}`);
  return upstream.json();
}

export default async function handler(req, res) {
  try {
    let raw = await redis.get('fear_greed');

    // Cold-start fallback: cache is empty, fetch live and prime the cache
    if (!raw) {
      const data    = await liveFetch();
      const payload = { ...data, cachedAt: new Date().toISOString() };
      await redis.set('fear_greed', JSON.stringify(payload));
      raw = JSON.stringify(payload);
    }

    const payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to read sentiment cache', detail: err.message });
  }
}
